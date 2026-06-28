import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import * as uc from "@unfoldedcircle/integration-api";

function mkTmpDir(prefix = "onkyo-test-") {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return base;
}

// We import compiled modules from dist to match runtime behavior

it("handleRestorePayload: applies valid payload and calls onConfigSaved", async () => {
  const tmp = mkTmpDir();
  try {
    const configModule = await import("../src/configManager.js");
    const SetupHandlerModule = await import("../src/setupHandler.js");
    const ConfigManager = configModule.ConfigManager;
    if (typeof configModule.setConfigDir === "function") configModule.setConfigDir(tmp);

    // Seed initial config to ensure it changes
    ConfigManager.save({ avrs: [{ model: "OLD", ip: "0.0.0.0", port: 60128, zone: "main" }] });

    let saved = false;
    const host: any = {
      driver: {},
      getConfigDirPath: () => tmp,
      onConfigSaved: async () => {
        saved = true;
      },
      onConfigCleared: async () => {},
      log: console
    };

    const setup = new SetupHandlerModule.default(host);

    const driverJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "driver.json"), "utf-8"));
    const targetConfig = { avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main", entityNameStyle: "short" }] };
    const payload = { meta: { driver_id: driverJson.driver_id, version: driverJson.version }, config: targetConfig };
    const payloadString = JSON.stringify(payload);

    const res = await (setup as any).handleRestorePayload(payloadString);
    expect(res).toBeInstanceOf(uc.SetupComplete);

    const reloaded = ConfigManager.load();
    expect(reloaded.avrs).toBeTruthy();
    expect(reloaded.avrs[0].model).toBe(targetConfig.avrs[0].model);
    expect(reloaded.avrs[0].ip).toBe(targetConfig.avrs[0].ip);
    expect(reloaded.avrs[0].entityNameStyle).toBe("short");
    expect(saved).toBe(true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("handleRestorePayload: invalid payload returns RequestUserInput with preserved textarea", async () => {
  const tmp = mkTmpDir();
  try {
    const configModule = await import("../src/configManager.js");
    const SetupHandlerModule = await import("../src/setupHandler.js");
    if (typeof configModule.setConfigDir === "function") configModule.setConfigDir(tmp);

    const host: any = {
      driver: {},
      getConfigDirPath: () => tmp,
      onConfigSaved: async () => {},
      onConfigCleared: async () => {},
      log: console
    };

    const setup = new SetupHandlerModule.default(host);

    // Craft invalid payload: missing model and bad ip/port
    const payload = { avrs: [{ model: "", ip: "999.999.999.999", port: -1 }] };
    const raw = JSON.stringify(payload);

    const res = await (setup as any).handleRestorePayload(raw);
    expect(res).toBeInstanceOf(uc.RequestUserInput);
    const settings = (res as uc.RequestUserInput).settings as any[];
    const info = settings.find((s: any) => s.id === "info");
    const textarea = settings.find((s: any) => s.id === "restore_data");
    expect(info).toBeTruthy();
    expect(textarea).toBeTruthy();
    expect((textarea.field as any).textarea.value).toBe(raw);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("handleDeleteConfigPayload: confirm=false prompts and confirm=true clears config", async () => {
  const tmp = mkTmpDir();
  try {
    const configModule = await import("../src/configManager.js");
    const SetupHandlerModule = await import("../src/setupHandler.js");
    const ConfigManager = configModule.ConfigManager;
    if (typeof configModule.setConfigDir === "function") configModule.setConfigDir(tmp);

    // Seed a config
    ConfigManager.save({ avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main" }] });

    const host: any = {
      driver: {},
      getConfigDirPath: () => tmp,
      onConfigSaved: async () => {},
      onConfigCleared: async () => {
        ConfigManager.clear();
      },
      log: console
    };

    const setup = new SetupHandlerModule.default(host);

    const prompt = await (setup as any).handleDeleteConfigPayload(false, false);
    expect(prompt).toBeInstanceOf(uc.RequestUserInput);

    const res = await (setup as any).handleDeleteConfigPayload(true, false);
    expect(res).toBeInstanceOf(uc.SetupComplete);

    const reloaded = ConfigManager.load();
    // After clearing, avrs should be undefined or empty
    expect(!reloaded.avrs || reloaded.avrs.length === 0).toBe(true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("handleManualConfiguration: valid input creates AVR entries", async () => {
  const tmp = mkTmpDir();
  try {
    const configModule = await import("../src/configManager.js");
    const SetupHandlerModule = await import("../src/setupHandler.js");
    const ConfigManager = configModule.ConfigManager;
    if (typeof configModule.setConfigDir === "function") configModule.setConfigDir(tmp);

    let saved = false;
    const host: any = {
      driver: {},
      getConfigDirPath: () => tmp,
      onConfigSaved: async () => {
        saved = true;
      },
      onConfigCleared: async () => {},
      log: console
    };

    const setup = new SetupHandlerModule.default(host);

    const input = {
      model: "TX-RZ50",
      ipAddress: "192.168.2.103",
      port: 60128,
      zoneCount: 2,
      queueThreshold: 100,
      albumArtURL: "album_art.cgi",
      volumeScale: "100",
      adjustVolumeDispl: "true",
      entityNameStyle: "short",
      createSensors: "true",
      netMenuDelay: 500
    };

    const res = await (setup as any).handleManualConfiguration(input);
    expect(res).toBeInstanceOf(uc.SetupComplete);
    expect(saved).toBe(true);

    const reloaded = ConfigManager.load();
    expect(reloaded.avrs).toBeTruthy();
    expect(reloaded.avrs.length).toBe(2);
    expect(reloaded.avrs[0].model).toBe("TX-RZ50");
    expect(reloaded.avrs[0].entityNameStyle).toBe("short");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("handleManualConfiguration: invalid input returns RequestUserInput with errors", async () => {
  const tmp = mkTmpDir();
  try {
    const configModule = await import("../src/configManager.js");
    const SetupHandlerModule = await import("../src/setupHandler.js");
    if (typeof configModule.setConfigDir === "function") configModule.setConfigDir(tmp);

    const host: any = {
      driver: {},
      getConfigDirPath: () => tmp,
      onConfigSaved: async () => {},
      onConfigCleared: async () => {},
      log: console
    };

    const setup = new SetupHandlerModule.default(host);

    const input = {
      model: "",
      ipAddress: "bad-ip",
      port: "not-a-number",
      zoneCount: 1
    };

    const res = await (setup as any).handleManualConfiguration(input);
    expect(res).toBeInstanceOf(uc.RequestUserInput);
    const settings = (res as uc.RequestUserInput).settings as any[];
    const info = settings.find((s: any) => s.id === "info");
    expect(info).toBeTruthy();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("handleBackupPayload: returns backup data JSON textarea", async () => {
  const tmp = mkTmpDir();
  try {
    const configModule = await import("../src/configManager.js");
    const SetupHandlerModule = await import("../src/setupHandler.js");
    const ConfigManager = configModule.ConfigManager;
    if (typeof configModule.setConfigDir === "function") configModule.setConfigDir(tmp);

    // Seed config
    ConfigManager.save({ avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main" }] });

    const host: any = {
      driver: {},
      getConfigDirPath: () => tmp,
      onConfigSaved: async () => {},
      onConfigCleared: async () => {},
      log: console
    };

    const setup = new SetupHandlerModule.default(host);
    const res = await (setup as any).handleBackupPayload();
    expect(res).toBeInstanceOf(uc.RequestUserInput);
    const settings = (res as uc.RequestUserInput).settings as any[];
    const backup = settings.find((s: any) => s.id === "backup_data");
    expect(backup).toBeTruthy();
    const raw = (backup.field as any).textarea.value as string;
    const parsed = JSON.parse(raw);
    expect(parsed.meta).toBeTruthy();
    expect(parsed.config).toBeTruthy();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("handle: returns SetupComplete for non-matching message", async () => {
  const configModule = await import("../src/configManager.js");
  const SetupHandlerModule = await import("../src/setupHandler.js");
  const host: any = {
    driver: {},
    getConfigDirPath: () => "/tmp",
    onConfigSaved: async () => {},
    onConfigCleared: async () => {},
    log: console
  };
  const setup = new SetupHandlerModule.default(host);
  const res = await setup.handle({ customData: "no-match" });
  expect(res).toBeInstanceOf(uc.SetupComplete);
});

it("handleDriverSetupReconfigure: returns undefined for unknown choice", async () => {
  const configModule = await import("../src/configManager.js");
  const SetupHandlerModule = await import("../src/setupHandler.js");
  const host: any = {
    driver: {},
    getConfigDirPath: () => "/tmp",
    onConfigSaved: async () => {},
    onConfigCleared: async () => {},
    log: console
  };
  const setup = new SetupHandlerModule.default(host);
  const msg: any = { reconfigure: true, setupData: { choice: "unknown_option" } };
  const res = await (setup as any).handleDriverSetupReconfigure(msg);
  expect(res).toBeUndefined();
});

it("handleRestorePayload: returns restore form for undefined payload", async () => {
  const SetupHandlerModule = await import("../src/setupHandler.js");
  const host: any = {
    driver: {},
    getConfigDirPath: () => "/tmp",
    onConfigSaved: async () => {},
    onConfigCleared: async () => {},
    log: console
  };
  const setup = new SetupHandlerModule.default(host);
  const res = await (setup as any).handleRestorePayload(undefined);
  expect(res).toBeInstanceOf(uc.RequestUserInput);
});

// Ensure listeningModeOptions provided during initial setup + autodiscovery are persisted
it("handleManualConfiguration: autodiscovery should persist listeningModeOptions when supplied", async () => {
  const tmp = mkTmpDir();
  try {
    const configModule = await import("../src/configManager.js");
    const SetupHandlerModule = await import("../src/setupHandler.js");
    const EiscpModule = await import("../src/eiscp.js");

    const ConfigManager = configModule.ConfigManager;
    if (typeof configModule.setConfigDir === "function") configModule.setConfigDir(tmp);

    // Stub discovery to return a host
    const originalDiscover = EiscpModule.default.prototype.discover;
    EiscpModule.default.prototype.discover = async () => [{ model: "TX-RZ50", host: "192.168.2.103", port: 60128 }];

    let saved = false;
    const host: any = {
      driver: {},
      getConfigDirPath: () => tmp,
      onConfigSaved: async () => {
        saved = true;
      },
      onConfigCleared: async () => {},
      log: console
    };

    const setup = new SetupHandlerModule.default(host);

    const input = {
      model: "",
      ipAddress: "",
      listeningModeOptions: "stereo; straight-decode",
      entityNameStyle: "short"
    };

    const res = await (setup as any).handleManualConfiguration(input);
    expect(res).toBeInstanceOf(uc.SetupComplete);
    expect(saved).toBe(true);

    const reloaded = ConfigManager.load();
    expect(reloaded.avrs && reloaded.avrs[0].listeningModeOptions).toBeTruthy();
    expect(reloaded.avrs![0].listeningModeOptions).toEqual(["stereo", "straight-decode"]);
    expect(reloaded.avrs![0].entityNameStyle).toBe("short");

    // restore stub
    EiscpModule.default.prototype.discover = originalDiscover;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
