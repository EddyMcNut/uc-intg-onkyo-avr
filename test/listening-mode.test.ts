import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

function mkTmpDir(prefix = "onkyo-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

it("ConfigManager validates and normalizes listening modes", async () => {
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
      listeningModes: {
        "00": { name: "stereo", setting: "stereo" },
        "40": { name: "straight-decode", setting: "straight-decode" },
        "88": { name: "neural-thx", setting: "neural-thx" },
        "13": { name: "full-mono", setting: "full-mono" }
      }
    };

    const res = ConfigManager.validateAvrPayload(payload);
    expect(res.errors.length === 0).toBe(true);
    expect(res.normalized).toBeTruthy();
    expect(Object.keys(res.normalized!.listeningModes)).toHaveLength(4);

    // Save and reload to ensure persistence
    ConfigManager.save({ avrs: [res.normalized] });
    const loaded = ConfigManager.load();
    expect(loaded.avrs && loaded.avrs[0].listeningModes).toBeTruthy();
    expect(Object.keys(loaded.avrs![0].listeningModes!)).toHaveLength(4);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
