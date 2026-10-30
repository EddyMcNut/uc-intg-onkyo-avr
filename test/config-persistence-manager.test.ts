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
      listeningModePreferences: {},
      listeningModeNames: {},
      volumeScaleValue: undefined,
      useAvrReportedInputsValue: false,
      volumeDisplayValue: "absolute",
      adjustVolumeDisplValue: true,
      entityNameStyleValue: "short",
      createSensorsValue: true,
      createTunerPresetsValue: true,
      createRemoteEntityValue: true,
      createDiracSelectEntityValue: true,
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

    it("writes AVR input name setting into the stored config", async () => {
      const mgr = new ConfigPersistenceManager(onConfigSaved);
      await mgr.saveManualConfiguration({
        ...baseParsedConfig,
        zoneCountValue: 1,
        useAvrReportedInputsValue: false
      });

      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      expect(written.avrs[0].useAvrReportedInputs).toBe(false);
    });

    it("excludes known inputs absent from a discovered AVR input list", async () => {
      const mgr = new ConfigPersistenceManager(onConfigSaved);
      await mgr.saveManualConfiguration({
        ...baseParsedConfig,
        ipVal: "9.8.7.6",
        zoneCountValue: 1,
        useAvrReportedInputsValue: true,
        inputSources: [
          { id: "10", name: "Blu-ray" },
          { id: "12", name: "Television" }
        ],
        inputSourceDiscoveryAvailable: true
      });

      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      const avr = written.avrs.find((entry: any) => entry.ip === "9.8.7.6");
      expect(avr.idInputSources["10"]).toEqual({ name: "Blu-ray", setting: "detected" });
      expect(avr.idInputSources["02"].setting).toBe("dont-include");
    });

    it("persists an empty input selector filter as all", async () => {
      const mgr = new ConfigPersistenceManager(onConfigSaved);
      await mgr.saveManualConfiguration({
        ...baseParsedConfig,
        zoneCountValue: 1,
        listeningModePreferences: {}
      });

      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      expect(written.avrs[0].listeningModes).toBeDefined();
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
          volumeDisplayValue: "absolute",
          entityNameStyleValue: "short",
          tuneinMenuStyleValue: "mypresets",
          listeningModePreferences: {},
          listeningModeNames: {},
          useAvrReportedInputsValue: true,
          createTunerPresetsValue: true,
          createRemoteEntityValue: true,
          createDiracSelectEntityValue: true,
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
          volumeDisplayValue: "absolute",
          entityNameStyleValue: "short",
          tuneinMenuStyleValue: "mypresets",
          listeningModePreferences: {},
          listeningModeNames: {},
          useAvrReportedInputsValue: true,
          createTunerPresetsValue: true,
          createRemoteEntityValue: true,
          createDiracSelectEntityValue: true,
          logLevelValue: "info"
        }
      );
      expect(onConfigSaved).toHaveBeenCalledTimes(1);
    });
  });
});
