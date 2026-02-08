import test from "ava";
import { pathToFileURL } from "url";
import fs from "fs";
import path from "path";

// Tests run against compiled dist artifacts
test.serial("createAvrSpecificConfig coerces types correctly", async (t) => {
  const mod = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/onkyo.js")).href);
  const OnkyoDriver = mod.default as any;

  const drv: any = Object.create(OnkyoDriver.prototype);

  const avrPayload: any = {
    model: "TX-RZ50",
    ip: "192.168.2.103",
    port: "60128",
    zone: "main",
    queueThreshold: "200",
    albumArtURL: "",
    volumeScale: "80",
    adjustVolumeDispl: "false",
    createSensors: "false",
    netMenuDelay: "120"
  };

  const config = drv.createAvrSpecificConfig(avrPayload) as any;

  t.is(config.avrs[0].queueThreshold, 200);
  t.is(config.avrs[0].volumeScale, 80);
  t.is(config.avrs[0].adjustVolumeDispl, false);
  t.is(config.avrs[0].createSensors, false);
  t.is(config.avrs[0].netMenuDelay, 120);
  t.is(config.avrs[0].port, 60128);
  t.is(config.avrs[0].albumArtURL, "album_art.cgi");
});

// Mock eISCP for capturing raw commands
class MockEiscp {
  public connected = true;
  public lastRaw: string | null = null;
  async waitForConnect() {
    return;
  }
  async raw(cmd: string) {
    this.lastRaw = cmd;
  }
}

import * as uc from "@unfoldedcircle/integration-api";
test.serial("OnkyoCommandSender volume conversion respects adjustVolumeDispl", async (t) => {
  const senderModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/onkyoCommandSender.js")).href);
  const OnkyoCommandSender = senderModule.OnkyoCommandSender as any;

  const eiscp = new MockEiscp();
  const drv: any = { updateEntityAttributes: () => {} } as any;
  const configAdjTrue: any = { avrs: [{ zone: "main" }], volumeScale: 100, adjustVolumeDispl: true };
  const configAdjFalse: any = { avrs: [{ zone: "main" }], volumeScale: 100, adjustVolumeDispl: false };

  const senderTrue = new OnkyoCommandSender(drv, configAdjTrue, eiscp as any);
  await senderTrue.sharedCmdHandler(new uc.MediaPlayer("id", { en: "id" }, {}), uc.MediaPlayerCommands.Volume, { volume: 50 });
  t.is(eiscp.lastRaw, "MVL64"); // 50 -> 50 *2 = 100 -> 0x64

  const eiscp2 = new MockEiscp();
  const senderFalse = new OnkyoCommandSender(drv, configAdjFalse, eiscp2 as any);
  await senderFalse.sharedCmdHandler(new uc.MediaPlayer("id", { en: "id" }, {}), uc.MediaPlayerCommands.Volume, { volume: 50 });
  t.is(eiscp2.lastRaw, "MVL32"); // 50 -> 50 -> 0x32
});
