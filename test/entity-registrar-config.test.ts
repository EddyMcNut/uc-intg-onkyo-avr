import test from "ava";
import fs from "fs";
import os from "os";
import { pathToFileURL } from "url";
import path from "path";

function mkTmpDir(prefix = "onkyo-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test.serial("EntityRegistrar returns user-configured listeningModeOptions from config", async (t) => {
  const tmp = mkTmpDir();
  try {
    const module = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/entityRegistrar.js")).href) as any;
    const cfgModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/configManager.js")).href) as any;

    const { ConfigManager, setConfigDir } = cfgModule;
    if (typeof setConfigDir === "function") setConfigDir(tmp);

    const EntityRegistrar = module.default as any;
    const registrar = new EntityRegistrar();

    // Save a config with listeningModeOptions and reload
    ConfigManager.save({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", listeningModeOptions: ["stereo", "straight-decode"] }] });
    const cfg = ConfigManager.load();
    t.truthy(cfg.avrs && cfg.avrs[0].listeningModeOptions);

    const avrEntry = `${cfg.avrs[0].model} ${cfg.avrs[0].ip} ${cfg.avrs[0].zone}`;
    const opts = registrar.getListeningModeOptions(undefined, avrEntry);
    t.deepEqual(opts, ["stereo", "straight-decode"]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});