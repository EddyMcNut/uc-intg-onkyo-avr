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
