import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

function mkTmpDir(prefix = "onkyo-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

it("EntityRegistrar returns user-configured listeningModeOptions from config", async () => {
  const tmp = mkTmpDir();
  try {
    const module = (await import("../src/entityRegistrar.js")) as any;
    const cfgModule = (await import("../src/configManager.js")) as any;

    const { ConfigManager, setConfigDir } = cfgModule;
    if (typeof setConfigDir === "function") setConfigDir(tmp);

    const avrStateModule = (await import("../src/avrState.js")) as any;
    const EntityRegistrar = module.default as any;
    const { avrStateManager } = avrStateModule;
    const registrar = new EntityRegistrar(avrStateManager);

    // Save a config with listeningModeOptions and reload
    ConfigManager.save({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", listeningModeOptions: ["stereo", "straight-decode"] }] });
    const cfg = ConfigManager.load();
    expect(cfg.avrs && cfg.avrs[0].listeningModeOptions).toBeTruthy();

    const avrEntry = `${cfg.avrs[0].model} ${cfg.avrs[0].ip} ${cfg.avrs[0].zone}`;
    const opts = registrar.getListeningModeOptions(undefined, avrEntry);
    expect(opts).toEqual(["stereo", "straight-decode"]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("EntityRegistrar treats 'all' sentinel and legacy empty array as showing all listening modes", async () => {
  const tmp = mkTmpDir();
  try {
    const module = (await import("../src/entityRegistrar.js")) as any;
    const cfgModule = (await import("../src/configManager.js")) as any;

    const { ConfigManager, setConfigDir } = cfgModule;
    if (typeof setConfigDir === "function") setConfigDir(tmp);

    const avrStateModule = (await import("../src/avrState.js")) as any;
    const EntityRegistrar = module.default as any;
    const { avrStateManager } = avrStateModule;
    const registrar = new EntityRegistrar(avrStateManager);

    for (const stored of ["all", []]) {
      ConfigManager.save({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", listeningModeOptions: stored }] });
      const cfg = ConfigManager.load();
      const avrEntry = `${cfg.avrs[0].model} ${cfg.avrs[0].ip} ${cfg.avrs[0].zone}`;
      const opts = registrar.getListeningModeOptions(undefined, avrEntry);
      // "all" (and legacy []) means show all known modes, not a restricted list.
      expect(Array.isArray(opts)).toBe(true);
      expect(opts.length).toBeGreaterThan(5);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("EntityRegistrar treats 'all' sentinel as showing all input sources", async () => {
  const tmp = mkTmpDir();
  try {
    const module = (await import("../src/entityRegistrar.js")) as any;
    const cfgModule = (await import("../src/configManager.js")) as any;

    const { ConfigManager, setConfigDir } = cfgModule;
    if (typeof setConfigDir === "function") setConfigDir(tmp);

    const avrStateModule = (await import("../src/avrState.js")) as any;
    const EntityRegistrar = module.default as any;
    const { avrStateManager } = avrStateModule;
    const registrar = new EntityRegistrar(avrStateManager);

    ConfigManager.save({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", inputSelectorOptions: "all" }] });
    const cfg = ConfigManager.load();
    const avrEntry = `${cfg.avrs[0].model} ${cfg.avrs[0].ip} ${cfg.avrs[0].zone}`;
    const opts = registrar.getInputSelectorOptions(avrEntry);
    expect(Array.isArray(opts)).toBe(true);
    expect(opts.length).toBeGreaterThan(5);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("EntityRegistrar uses the inputs the AVR reported when the input source list is auto", async () => {
  const tmp = mkTmpDir();
  try {
    const module = (await import("../src/entityRegistrar.js")) as any;
    const cfgModule = (await import("../src/configManager.js")) as any;
    const inputSourceStore = (await import("../src/inputSourceStore.js")) as any;

    const { ConfigManager, setConfigDir } = cfgModule;
    if (typeof setConfigDir === "function") setConfigDir(tmp);

    const avrStateModule = (await import("../src/avrState.js")) as any;
    const EntityRegistrar = module.default as any;
    const { avrStateManager } = avrStateModule;
    const registrar = new EntityRegistrar(avrStateManager);

    ConfigManager.save({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", inputSourceList: "auto" }] });
    const avrEntry = "M 1.2.3.4 main";

    // Before the AVR reported anything, the built-in list is used.
    expect(registrar.getInputSelectorOptions(avrEntry).length).toBeGreaterThan(5);

    inputSourceStore.setAvrInputs("M 1.2.3.4", [
      { id: "10", name: "BD/DVD" },
      { id: "33", name: "DAB" }
    ]);
    expect(registrar.getInputSelectorOptions(avrEntry)).toEqual(["BD/DVD", "DAB"]);

    // 'manual' ignores what was collected and uses the built-in list again.
    ConfigManager.save({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", inputSourceList: "manual" }] });
    expect(registrar.getInputSelectorOptions(avrEntry).length).toBeGreaterThan(5);

    inputSourceStore.clearAllAvrInputs();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("EntityRegistrar prefers the reported inputs over a user-configured input list in auto mode", async () => {
  const tmp = mkTmpDir();
  try {
    const module = (await import("../src/entityRegistrar.js")) as any;
    const cfgModule = (await import("../src/configManager.js")) as any;
    const inputSourceStore = (await import("../src/inputSourceStore.js")) as any;

    const { ConfigManager, setConfigDir } = cfgModule;
    if (typeof setConfigDir === "function") setConfigDir(tmp);

    const avrStateModule = (await import("../src/avrState.js")) as any;
    const EntityRegistrar = module.default as any;
    const { avrStateManager } = avrStateModule;
    const registrar = new EntityRegistrar(avrStateManager);

    ConfigManager.save({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", inputSourceList: "auto", inputSelectorOptions: ["bd", "tv"] }] });
    inputSourceStore.setAvrInputs("M 1.2.3.4", [{ id: "10", name: "BD/DVD" }]);

    expect(registrar.getInputSelectorOptions("M 1.2.3.4 main")).toEqual(["BD/DVD"]);

    inputSourceStore.clearAllAvrInputs();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("EntityRegistrar lists the tuner preset stations the AVR reported, and none before that", async () => {
  const tmp = mkTmpDir();
  try {
    const module = (await import("../src/entityRegistrar.js")) as any;
    const cfgModule = (await import("../src/configManager.js")) as any;
    const tunerPresetStore = (await import("../src/tunerPresetStore.js")) as any;

    const { ConfigManager, setConfigDir } = cfgModule;
    if (typeof setConfigDir === "function") setConfigDir(tmp);

    const avrStateModule = (await import("../src/avrState.js")) as any;
    const EntityRegistrar = module.default as any;
    const { avrStateManager } = avrStateModule;
    const registrar = new EntityRegistrar(avrStateManager);

    ConfigManager.save({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main" }] });
    const avrEntry = "M 1.2.3.4 main";

    // Nothing was reported yet: the entity exists but has no stations to show.
    expect(registrar.getTunerPresetOptions(avrEntry)).toEqual([]);
    const select = registrar.createTunerPresetsSelectEntity(avrEntry, async () => {});
    expect(select.id).toBe(`${avrEntry}_tuner_presets`);
    expect((select as any).attributes.options).toEqual([]);

    tunerPresetStore.setTunerPresets("M 1.2.3.4", [
      { slot: 12, name: "NPO FunX", band: "2", freq: "0" },
      { slot: 28, name: "STRKSTAD", band: "1", freq: "107.20" }
    ]);
    expect(registrar.getTunerPresetOptions(avrEntry)).toEqual(["NPO FunX", "STRKSTAD"]);

    // The stations are also part of the entity definition, not only of the attribute update.
    expect((registrar.createTunerPresetsSelectEntity(avrEntry, async () => {}) as any).attributes.options).toEqual(["NPO FunX", "STRKSTAD"]);

    tunerPresetStore.clearAllTunerPresets();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
