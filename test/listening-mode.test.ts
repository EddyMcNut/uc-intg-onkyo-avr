import test from "ava";
import { pathToFileURL } from "url";
import path from "path";

test.serial("ConfigManager validates and normalizes listeningModeOptions (semicolon string)", async (t) => {
  const cfgModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/configManager.js")).href);
  const { ConfigManager } = cfgModule as any;

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
});