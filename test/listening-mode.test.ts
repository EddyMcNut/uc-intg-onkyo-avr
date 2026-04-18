import test from "ava";
import fs from "fs";
import os from "os";
import { pathToFileURL } from "url";
import path from "path";

function mkTmpDir(prefix = "onkyo-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test.serial("ConfigManager validates and normalizes listeningModeOptions (semicolon string)", async (t) => {
  const tmp = mkTmpDir();
  try {
    const cfgModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/configManager.js")).href);
    const { ConfigManager, setConfigDir } = cfgModule as any;
    if (typeof setConfigDir === "function") setConfigDir(tmp);

    const payload = {
      model: "TX-RZ50",
      ip: "192.168.2.103",
      port: 60128,
      zone: "main",
      listeningModeOptions: "stereo; straight-decode; neural-thx; full-mono"
    };

    const res = ConfigManager.validateAvrPayload(payload);
    t.true(res.errors.length === 0);
    t.truthy(res.normalized);
    t.deepEqual(res.normalized!.listeningModeOptions, ["stereo", "straight-decode", "neural-thx", "full-mono"]);

    // Save and reload to ensure persistence
    ConfigManager.save({ avrs: [res.normalized] });
    const loaded = ConfigManager.load();
    t.truthy(loaded.avrs && loaded.avrs[0].listeningModeOptions);
    t.deepEqual(loaded.avrs![0].listeningModeOptions, ["stereo", "straight-decode", "neural-thx", "full-mono"]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});