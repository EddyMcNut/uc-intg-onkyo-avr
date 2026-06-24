import { describe, it, expect } from "vitest";
import type { IntegrationAPI } from "@unfoldedcircle/integration-api";
import path from "path";

// Tests run against compiled dist artifacts
it("createAvrSpecificConfig coerces types correctly", async () => {
  const mod = await import("../src/driver.js");
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
    netMenuDelay: "120",
    tuneinPresetPosition: "3",
    listeningModeOptions: ["stereo", "straight-decode"]
  };

  const config = drv.createAvrSpecificConfig(avrPayload) as any;

  expect(config.avrs[0].queueThreshold).toBe(200);
  expect(config.avrs[0].volumeScale).toBe(80);
  expect(config.avrs[0].adjustVolumeDispl).toBe(false);
  expect(config.avrs[0].createSensors).toBe(false);
  expect(config.avrs[0].netMenuDelay).toBe(120);
  expect(config.avrs[0].tuneinPresetPosition).toBe(3);
  expect(config.avrs[0].port).toBe(60128);
  expect(config.avrs[0].albumArtURL).toBe("album_art.cgi");
  expect(config.avrs[0].listeningModeOptions).toEqual(["stereo", "straight-decode"]);
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
it("CommandSender volume conversion respects adjustVolumeDispl", async () => {
  const senderModule = await import("../src/commandSender.js");
  const avrStateModule = await import("../src/avrState.js");
  const CommandSender = senderModule.CommandSender as any;
  const { avrStateManager } = avrStateModule as any;

  const eiscp = new MockEiscp();
  // mock driver only needs updateEntityAttributes; use IntegrationAPI type for clarity
  const drv: Partial<IntegrationAPI> = { updateEntityAttributes: () => true };
  const entityId = "M 1.2.3.4 main";
  const baseAvrConfig = [{ model: "M", ip: "1.2.3.4", zone: "main", port: 60128 }];
  const configAdjTrue = { avrs: baseAvrConfig, volumeScale: 100, adjustVolumeDispl: true };
  const configAdjFalse = { avrs: baseAvrConfig, volumeScale: 100, adjustVolumeDispl: false };

  const senderTrue = new CommandSender(drv as any, configAdjTrue, eiscp as any, avrStateManager, null);
  await senderTrue.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.Volume, { volume: 50 });
  expect(eiscp.lastRaw).toBe("MVL64"); // 50 -> 50 *2 = 100 -> 0x64

  const eiscp2 = new MockEiscp();
  const senderFalse = new CommandSender(drv as any, configAdjFalse, eiscp2 as any, avrStateManager, null);
  await senderFalse.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.Volume, { volume: 50 });
  expect(eiscp2.lastRaw).toBe("MVL32"); // 50 -> 50 -> 0x32
});
