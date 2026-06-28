import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("node:fs", () => {
  const mockReadFileSync = vi.fn();
  const mockExistsSync = vi.fn();
  return {
    readFileSync: mockReadFileSync,
    existsSync: mockExistsSync,
    default: {
      readFileSync: mockReadFileSync,
      existsSync: mockExistsSync
    }
  };
});

describe("BackupRestoreManager", () => {
  let BackupRestoreManager: any;
  let fsMock: any;

  beforeAll(async () => {
    vi.stubEnv("UC_CONFIG_HOME", "/tmp/uc-test");
    const mod = await import("../src/backupRestoreManager.js");
    BackupRestoreManager = mod.BackupRestoreManager;
    fsMock = await import("node:fs");
  });

  describe("parseRestorePayload", () => {
    it("returns isValid true for valid JSON", () => {
      const mgr = new BackupRestoreManager();
      const result = mgr.parseRestorePayload('{"meta":{"driver_id":"test","version":"1.0"},"config":{}}');
      expect(result.isValid).toBe(true);
      expect(result.payload.meta.driver_id).toBe("test");
    });

    it("returns isValid false and errors for invalid JSON", () => {
      const mgr = new BackupRestoreManager();
      const result = mgr.parseRestorePayload("{invalid}");
      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.errors![0]).toContain("Invalid JSON");
    });
  });

  describe("validateAndNormalizeRestorePayload", () => {
    it("returns errors for invalid JSON", () => {
      const mgr = new BackupRestoreManager();
      const result = mgr.validateAndNormalizeRestorePayload("{bad}");
      expect(result.isValid).toBe(false);
      expect(result.normalized).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("returns errors when payload config is invalid", () => {
      const mgr = new BackupRestoreManager();
      // Empty object JSON → no avrs, no model/ip → validation error
      const result = mgr.validateAndNormalizeRestorePayload("{}");
      expect(result.isValid).toBe(false);
      expect(result.normalized).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("returns normalized config for valid payload with config wrapper", () => {
      const mgr = new BackupRestoreManager();
      const payload = {
        config: {
          avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, zone: "main" }]
        }
      };
      const result = mgr.validateAndNormalizeRestorePayload(JSON.stringify(payload));
      expect(result.isValid).toBe(true);
      expect(result.normalized).not.toBeNull();
      expect(result.normalized!.avrs).toHaveLength(1);
      expect(result.normalized!.avrs![0].model).toBe("TX-RZ50");
    });
  });

  describe("buildBackupString", () => {
    it("returns default metadata when driver.json missing", async () => {
      fsMock.readFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });
      fsMock.existsSync.mockReturnValue(false);

      const mgr = new BackupRestoreManager();
      const result = await mgr.buildBackupString(() => undefined);

      const parsed = JSON.parse(result);
      expect(parsed.meta.driver_id).toBe("unknown");
      expect(parsed.meta.version).toBe("unknown");
    });

    it("uses driver.json metadata when file exists", async () => {
      fsMock.readFileSync.mockImplementation((path: string) => {
        if (path.endsWith("driver.json")) {
          return JSON.stringify({ driver_id: "my-driver", version: "2.0.0" });
        }
        return "{}";
      });
      fsMock.existsSync.mockReturnValue(false);

      const mgr = new BackupRestoreManager();
      const result = await mgr.buildBackupString(() => undefined);

      const parsed = JSON.parse(result);
      expect(parsed.meta.driver_id).toBe("my-driver");
      expect(parsed.meta.version).toBe("2.0.0");
    });

    it("falls back to unknown for empty driver metadata", async () => {
      fsMock.readFileSync.mockImplementation((path: string) => {
        if (path.endsWith("driver.json")) {
          return JSON.stringify({ driver_id: "", version: "" });
        }
        return "{}";
      });
      fsMock.existsSync.mockReturnValue(false);

      const mgr = new BackupRestoreManager();
      const result = await mgr.buildBackupString(() => undefined);

      const parsed = JSON.parse(result);
      expect(parsed.meta.driver_id).toBe("unknown");
      expect(parsed.meta.version).toBe("unknown");
    });
  });
});
