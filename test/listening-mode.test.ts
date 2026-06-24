import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

function mkTmpDir(prefix = "onkyo-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

it("ConfigManager validates and normalizes listeningModeOptions (semicolon string)", async () => {
  const tmp = mkTmpDir();
  try {
    const cfgModule = await import("../src/configManager.js");
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
    expect(res.errors.length === 0).toBe(true);
    expect(res.normalized).toBeTruthy();
    expect(res.normalized!.listeningModeOptions).toEqual(["stereo", "straight-decode", "neural-thx", "full-mono"]);

    // Save and reload to ensure persistence
    ConfigManager.save({ avrs: [res.normalized] });
    const loaded = ConfigManager.load();
    expect(loaded.avrs && loaded.avrs[0].listeningModeOptions).toBeTruthy();
    expect(loaded.avrs![0].listeningModeOptions).toEqual(["stereo", "straight-decode", "neural-thx", "full-mono"]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
