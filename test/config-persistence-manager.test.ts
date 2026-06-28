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

describe("configPersistenceManager", () => {
  let ConfigPersistenceManager: any;
  let onConfigSaved: any;

  beforeAll(async () => {
    const mod = await import("../src/configPersistenceManager.js");
    ConfigPersistenceManager = mod.ConfigPersistenceManager;
  });

  beforeEach(() => {
    onConfigSaved = vi.fn().mockResolvedValue(undefined);
  });

  describe("saveManualConfiguration", () => {
    const baseParsedConfig = {
      modelName: "TX-RZ50",
      ipVal: "1.2.3.4",
      portNum: 60128,
      queueThresholdValue: undefined,
      albumArtURLValue: undefined,
      listeningModeOptions: undefined,
      inputSelectorOptions: undefined,
      volumeScaleValue: undefined,
      volumeDisplayValue: undefined,
      adjustVolumeDisplValue: undefined,
      entityNameStyleValue: undefined,
      createSensorsValue: undefined,
      netMenuDelayValue: undefined,
      tuneinPresetPositionValue: undefined,
      tuneinMenuStyleValue: undefined
    };

    beforeEach(() => {
      mockExistsSync.mockReset();
      mockReadFileSync.mockReset();
      mockWriteFileSync.mockReset();
      mockExistsSync.mockReturnValue(false);
    });

    it("saves single-zone config successfully", async () => {
      const mgr = new ConfigPersistenceManager(onConfigSaved);
      const result = await mgr.saveManualConfiguration({
        ...baseParsedConfig,
        zoneCountValue: 1
      });
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(onConfigSaved).toHaveBeenCalledTimes(1);
    });

    it("saves multi-zone config", async () => {
      const mgr = new ConfigPersistenceManager(onConfigSaved);
      const result = await mgr.saveManualConfiguration({
        ...baseParsedConfig,
        zoneCountValue: 3
      });
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("saves 4-zone config", async () => {
      const mgr = new ConfigPersistenceManager(onConfigSaved);
      const result = await mgr.saveManualConfiguration({
        ...baseParsedConfig,
        zoneCountValue: 4
      });
      expect(result.success).toBe(true);
    });

    it("fails with invalid payload", async () => {
      const mgr = new ConfigPersistenceManager(onConfigSaved);
      const result = await mgr.saveManualConfiguration({
        ...baseParsedConfig,
        modelName: "",
        zoneCountValue: 1
      });
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("saveDiscoveredAvr", () => {
    it("handles empty listening mode options", async () => {
      const mgr = new ConfigPersistenceManager(onConfigSaved);
      await mgr.saveDiscoveredAvr(
        { model: "X", host: "1.2.3.4", port: 60128 },
        {
          volumeDisplayValue: undefined,
          entityNameStyleValue: undefined,
          tuneinMenuStyleValue: undefined,
          listeningModeOptions: undefined,
          inputSelectorOptions: undefined,
          logLevelValue: "info"
        }
      );
      expect(onConfigSaved).toHaveBeenCalledTimes(1);
    });

    it("handles valid input selector options", async () => {
      const mgr = new ConfigPersistenceManager(onConfigSaved);
      await mgr.saveDiscoveredAvr(
        { model: "X", host: "1.2.3.4", port: 60128 },
        {
          volumeDisplayValue: undefined,
          entityNameStyleValue: undefined,
          tuneinMenuStyleValue: undefined,
          listeningModeOptions: "opt1",
          inputSelectorOptions: "opt1,opt2",
          logLevelValue: "info"
        }
      );
      expect(onConfigSaved).toHaveBeenCalledTimes(1);
    });
  });
});
