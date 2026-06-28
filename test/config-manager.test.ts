import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync
  }
}));

describe("ConfigManager static methods", () => {
  let ConfigManager: any;

  beforeAll(async () => {
    const mod = await import("../src/configManager.js");
    ConfigManager = mod.ConfigManager;
  });

  describe("validateZone", () => {
    it("returns default for undefined", () => {
      expect(ConfigManager.validateZone(undefined)).toBe("main");
    });

    it("returns default for unknown zone", () => {
      expect(ConfigManager.validateZone("zone5")).toBe("main");
    });

    it("returns zone2 as-is", () => {
      expect(ConfigManager.validateZone("zone2")).toBe("zone2");
    });
  });

  describe("applyDefaults", () => {
    it("fills missing fields with defaults", () => {
      const result = ConfigManager.applyDefaults({});
      expect(result.model).toBe("");
      expect(result.ip).toBe("");
      expect(result.port).toBe(60128);
      expect(result.zone).toBe("main");
    });
  });

  describe("validateAvrPayload", () => {
    it("rejects non-object", () => {
      const result = ConfigManager.validateAvrPayload(null);
      expect(result.errors).toContain("AVR entry must be an object");
    });

    it("rejects missing model", () => {
      const result = ConfigManager.validateAvrPayload({ ip: "1.2.3.4", port: 60128 });
      expect(result.errors).toContain("model is required and must be a non-empty string");
    });

    it("rejects model with invalid characters", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50/", ip: "1.2.3.4", port: 60128 });
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects missing ip", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", port: 60128 });
      expect(result.errors).toContain("ip is required and must be a non-empty string");
    });

    it("rejects invalid ip format", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "not-an-ip", port: 60128 });
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects ip with octets out of range", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.256", port: 60128 });
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects invalid port", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 0 });
      expect(result.errors).toContain("port must be a valid number between 1 and 65535");
    });

    it("rejects zone with unknown value", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, zone: "zone5" });
      expect(result.errors).toContain('zone must be one of "main", "zone2", "zone3", "zone4"');
    });

    it("rejects albumArtURL with invalid chars", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, albumArtURL: "<script>" });
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects negative queueThreshold", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, queueThreshold: -1 });
      expect(result.errors).toContain("queueThreshold must be a non-negative integer");
    });

    it("rejects invalid volumeScale", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, volumeScale: 50 });
      expect(result.errors).toContain("volumeScale must be 80 or 100");
    });

    it("rejects invalid volumeDisplay", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, volumeDisplay: "invalid" });
      expect(result.errors).toContain('volumeDisplay must be "absolute" or "relative"');
    });

    it("rejects invalid entityNameStyle", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, entityNameStyle: "medium" });
      expect(result.errors).toContain('entityNameStyle must be "long" or "short"');
    });

    it("rejects negative netMenuDelay", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, netMenuDelay: -1 });
      expect(result.errors).toContain("netMenuDelay must be a non-negative integer");
    });

    it("rejects tuneinPresetPosition out of range", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, tuneinPresetPosition: 0 });
      expect(result.errors).toContain("tuneinPresetPosition must be an integer between 1 and 9");
    });

    it("rejects invalid tuneinMenuStyle", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, tuneinMenuStyle: "compact" });
      expect(result.errors).toContain('tuneinMenuStyle must be "mypresets" or "full"');
    });

    it("rejects invalid listeningModeOptions type", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, listeningModeOptions: 42 });
      expect(result.errors).toContain("listeningModeOptions must be an array of strings or a semicolon-separated string");
    });

    it("accepts valid input and returns normalized config", () => {
      const result = ConfigManager.validateAvrPayload({
        model: "TX-RZ50",
        ip: "1.2.3.4",
        port: 60128,
        zone: "main"
      });
      expect(result.errors.length).toBe(0);
      expect(result.normalized).toBeDefined();
      expect(result.normalized.model).toBe("TX-RZ50");
    });
  });

  describe("validateConfigPayload", () => {
    it("rejects non-object", () => {
      const result = ConfigManager.validateConfigPayload(null);
      expect(result.errors).toContain("Payload must be an object");
    });

    it("rejects empty object (no avrs, no legacy fields)", () => {
      const result = ConfigManager.validateConfigPayload({});
      expect(result.errors).toContain("No avrs array or legacy model/ip fields found");
    });

    it("accepts legacy single-model payload", () => {
      const result = ConfigManager.validateConfigPayload({ model: "TX-RZ50", ip: "1.2.3.4" });
      expect(result.errors.length).toBe(0);
      expect(result.normalized).toBeDefined();
      expect(result.normalized.avrs).toHaveLength(1);
    });

    it("accepts config-wrapped payload", () => {
      const result = ConfigManager.validateConfigPayload({
        config: { model: "TX-RZ50", ip: "1.2.3.4" }
      });
      expect(result.errors.length).toBe(0);
      expect(result.normalized).toBeDefined();
    });

    it("accepts avrs array payload", () => {
      const result = ConfigManager.validateConfigPayload({
        avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", port: 60128 }]
      });
      expect(result.errors.length).toBe(0);
      expect(result.normalized).toBeDefined();
      expect(result.normalized.avrs).toHaveLength(1);
    });

    it("handles valid logLevel", () => {
      const result = ConfigManager.validateConfigPayload({
        avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", port: 60128 }],
        logLevel: "debug"
      });
      expect(result.errors.length).toBe(0);
      expect(result.normalized.logLevel).toBe("debug");
    });

    it("rejects invalid logLevel", () => {
      const result = ConfigManager.validateConfigPayload({
        avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", port: 60128 }],
        logLevel: "bogus"
      });
      expect(result.errors.length).toBe(0);
      expect(result.normalized.logLevel).toBeUndefined();
    });

    it("rejects legacy avr payload with validation errors", () => {
      const result = ConfigManager.validateConfigPayload({ model: "TX", ip: "1.2.3.4.5" });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/legacy avrs:/);
    });

    it("accepts valid legacy payload and normalizes", () => {
      const result = ConfigManager.validateConfigPayload({ model: "TX-RZ50", ip: "1.2.3.4" });
      expect(result.errors.length).toBe(0);
      expect(result.normalized.avrs).toHaveLength(1);
      expect(result.normalized.avrs[0].port).toBe(60128);
    });
  });

  describe("validateAvrPayload edge cases", () => {
    it("rejects model too long", () => {
      const result = ConfigManager.validateAvrPayload({ model: "A".repeat(51), ip: "1.2.3.4" });
      expect(result.errors).toContain(`model too long (max 50)`);
    });

    it("rejects ip too long", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX", ip: "1".repeat(50) });
      expect(result.errors).toContain(`ip address too long (max 15)`);
    });

    it("parses port from string", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: "60128" });
      expect(result.errors.length).toBe(0);
      expect(result.normalized.port).toBe(60128);
    });

    it("rejects albumArtURL too long", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, albumArtURL: "a".repeat(251) });
      expect(result.errors).toContain("albumArtURL too long (max 250)");
    });

    it("rejects queueThreshold from string NaN", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, queueThreshold: "abc" });
      expect(result.errors).toContain("queueThreshold must be a non-negative integer");
    });

    it("rejects volumeScale from string NaN", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, volumeScale: "abc" });
      expect(result.errors).toContain("volumeScale must be 80 or 100");
    });

    it("rejects adjustVolumeDispl with wrong type", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, adjustVolumeDispl: 42 });
      expect(result.errors).toContain("adjustVolumeDispl must be boolean");
    });

    it("rejects createSensors with wrong type", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, createSensors: 42 });
      expect(result.errors).toContain("createSensors must be boolean");
    });

    it("rejects netMenuDelay from string NaN", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, netMenuDelay: "abc" });
      expect(result.errors).toContain("netMenuDelay must be a non-negative integer");
    });

    it("rejects tuneinPresetPosition from string NaN", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, tuneinPresetPosition: "abc" });
      expect(result.errors).toContain("tuneinPresetPosition must be an integer between 1 and 9");
    });

    it("rejects invalid input selector option", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, inputSelectorOptions: [""] });
      expect(result.errors.length).toBe(0);
      expect(result.normalized.inputSelectorOptions).toEqual([]);
    });

    it("handles listeningModeOptions with null sentinel", () => {
      const result = ConfigManager.validateAvrPayload({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, listeningModeOptions: null });
      expect(result.errors.length).toBe(0);
      expect(result.normalized.listeningModeOptions).toBeNull();
    });

    it("normalizes string fields correctly", () => {
      const result = ConfigManager.validateAvrPayload({
        model: "TX-RZ50",
        ip: "1.2.3.4",
        port: "60128",
        volumeScale: "80",
        netMenuDelay: "5",
        tuneinPresetPosition: "3",
        inputSelectorOptions: ["opt1", "opt2"]
      });
      expect(result.errors.length).toBe(0);
      expect(result.normalized.port).toBe(60128);
      expect(result.normalized.volumeScale).toBe(80);
      expect(result.normalized.netMenuDelay).toBe(5);
      expect(result.normalized.tuneinPresetPosition).toBe(3);
      expect(result.normalized.inputSelectorOptions).toEqual(["opt1", "opt2"]);
    });

    it("normalizes volumeDisplay, entityNameStyle, tuneinMenuStyle correctly", () => {
      const result = ConfigManager.validateAvrPayload({
        model: "TX-RZ50",
        ip: "1.2.3.4",
        port: 60128,
        volumeDisplay: "relative",
        entityNameStyle: "long",
        tuneinMenuStyle: "full"
      });
      expect(result.errors.length).toBe(0);
      expect(result.normalized.volumeDisplay).toBe("relative");
      expect(result.normalized.entityNameStyle).toBe("long");
      expect(result.normalized.tuneinMenuStyle).toBe("full");
    });

    it("rejects config with falsy config payload", () => {
      const result = ConfigManager.validateConfigPayload({ config: false });
      expect(result.errors).toContain("No config object found in payload");
    });

    it("normalizes valid avrs with logLevel and multiple avrs", () => {
      const result = ConfigManager.validateConfigPayload({
        avrs: [
          { model: "TX-RZ50", ip: "1.2.3.4", port: 60128 },
          { model: "TX-NR7100", ip: "1.2.3.5", port: 60128 }
        ],
        logLevel: "error"
      });
      expect(result.errors.length).toBe(0);
      expect(result.normalized.avrs).toHaveLength(2);
      expect(result.normalized.logLevel).toBe("error");
    });

    it("rejects selector option with invalid characters", () => {
      const result = ConfigManager.validateAvrPayload({
        model: "TX-RZ50",
        ip: "1.2.3.4",
        port: 60128,
        listeningModeOptions: ["invalid!!"]
      });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/invalid characters/);
    });

    it("rejects selector option too long", () => {
      const result = ConfigManager.validateAvrPayload({
        model: "TX-RZ50",
        ip: "1.2.3.4",
        port: 60128,
        listeningModeOptions: ["a".repeat(251)]
      });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/too long/);
    });
  });

  describe("load() with mocked fs", () => {
    beforeEach(() => {
      mockExistsSync.mockReset();
      mockReadFileSync.mockReset();
      mockWriteFileSync.mockReset();
      ConfigManager.config = {};
    });

    it("loads legacy config and migrates to avrs array", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128 }));
      const result = ConfigManager.load();
      expect(result.avrs).toHaveLength(1);
      expect(result.avrs[0].model).toBe("TX-RZ50");
    });

    it("loads config with global settings and migrates to per-AVR", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", port: 60128 }],
          queueThreshold: 10,
          albumArtURL: "/art",
          entityNameStyle: "short"
        })
      );
      const result = ConfigManager.load();
      expect(result.avrs).toHaveLength(1);
      expect(result.avrs[0].queueThreshold).toBe(10);
      expect(result.avrs[0].albumArtURL).toBe("/art");
    });
  });

  describe("setConfigDir", () => {
    it("handles empty dir by falling back to env", async () => {
      const mod = await import("../src/configManager.js");
      const prev = process.env.UC_CONFIG_HOME;
      delete process.env.UC_CONFIG_HOME;
      mod.setConfigDir("");
      expect(mod.getConfigPath()).toBeDefined();
      process.env.UC_CONFIG_HOME = prev;
    });
  });
});
