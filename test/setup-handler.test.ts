import test from "ava";
import fs from "fs";
import os from "os";
import path from "path";
import * as uc from "@unfoldedcircle/integration-api";

function mkTmpDir(prefix = "onkyo-test-") {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return base;
}

// We import compiled modules from dist to match runtime behavior
async function importDistModule(relPath: string) {
  const { pathToFileURL } = await import("url");
  return await import(pathToFileURL(path.resolve(process.cwd(), relPath)).href);
}

test.serial("handleRestorePayload: applies valid payload and calls onConfigSaved", async (t) => {
  const tmp = mkTmpDir();
  try {
    const configModule = await importDistModule("dist/src/configManager.js");
    const SetupHandlerModule = await importDistModule("dist/src/setupHandler.js");
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
    const targetConfig = { avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main" }] };
    const payload = { meta: { driver_id: driverJson.driver_id, version: driverJson.version }, config: targetConfig };
    const payloadString = JSON.stringify(payload);

    const res = await (setup as any).handleRestorePayload(payloadString);
    t.true(res instanceof uc.SetupComplete);

    const reloaded = ConfigManager.load();
    t.truthy(reloaded.avrs);
    t.is(reloaded.avrs[0].model, targetConfig.avrs[0].model);
    t.is(reloaded.avrs[0].ip, targetConfig.avrs[0].ip);
    t.true(saved);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test.serial("handleRestorePayload: invalid payload returns RequestUserInput with preserved textarea", async (t) => {
  const tmp = mkTmpDir();
  try {
    const configModule = await importDistModule("dist/src/configManager.js");
    const SetupHandlerModule = await importDistModule("dist/src/setupHandler.js");
    const ConfigManager = configModule.ConfigManager;
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
    t.true(res instanceof uc.RequestUserInput);
    const settings = (res as uc.RequestUserInput).settings as any[];
    const info = settings.find((s: any) => s.id === "info");
    const textarea = settings.find((s: any) => s.id === "backup_data");
    t.truthy(info);
    t.truthy(textarea);
    t.is((textarea.field as any).textarea.value, raw);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test.serial("handleDeleteConfigPayload: confirm=false prompts and confirm=true clears config", async (t) => {
  const tmp = mkTmpDir();
  try {
    const configModule = await importDistModule("dist/src/configManager.js");
    const SetupHandlerModule = await importDistModule("dist/src/setupHandler.js");
    const ConfigManager = configModule.ConfigManager;
    if (typeof configModule.setConfigDir === "function") configModule.setConfigDir(tmp);

    // Seed a config
    ConfigManager.save({ avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main" }] });

    let cleared = false;
    const host: any = {
      driver: {},
      getConfigDirPath: () => tmp,
      onConfigSaved: async () => {},
      onConfigCleared: async () => {
        cleared = true;
        ConfigManager.clear();
      },
      log: console
    };

    const setup = new SetupHandlerModule.default(host);

    const prompt = await (setup as any).handleDeleteConfigPayload(false, false);
    t.true(prompt instanceof uc.RequestUserInput);

    const res = await (setup as any).handleDeleteConfigPayload(true, false);
    t.true(res instanceof uc.SetupComplete);

    const reloaded = ConfigManager.load();
    // After clearing, avrs should be undefined or empty
    t.true(!reloaded.avrs || reloaded.avrs.length === 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test.serial("handleManualConfiguration: valid input creates AVR entries", async (t) => {
  const tmp = mkTmpDir();
  try {
    const configModule = await importDistModule("dist/src/configManager.js");
    const SetupHandlerModule = await importDistModule("dist/src/setupHandler.js");
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
      createSensors: "true",
      netMenuDelay: 500
    };

    const res = await (setup as any).handleManualConfiguration(input);
    t.true(res instanceof uc.SetupComplete);
    t.true(saved);

    const reloaded = ConfigManager.load();
    t.truthy(reloaded.avrs);
    t.is(reloaded.avrs.length, 2);
    t.is(reloaded.avrs[0].model, "TX-RZ50");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test.serial("handleManualConfiguration: invalid input returns RequestUserInput with errors", async (t) => {
  const tmp = mkTmpDir();
  try {
    const configModule = await importDistModule("dist/src/configManager.js");
    const SetupHandlerModule = await importDistModule("dist/src/setupHandler.js");
    const ConfigManager = configModule.ConfigManager;
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
    t.true(res instanceof uc.RequestUserInput);
    const settings = (res as uc.RequestUserInput).settings as any[];
    const info = settings.find((s: any) => s.id === "info");
    t.truthy(info);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test.serial("handleBackupPayload: returns backup data JSON textarea", async (t) => {
  const tmp = mkTmpDir();
  try {
    const configModule = await importDistModule("dist/src/configManager.js");
    const SetupHandlerModule = await importDistModule("dist/src/setupHandler.js");
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
    t.true(res instanceof uc.RequestUserInput);
    const settings = (res as uc.RequestUserInput).settings as any[];
    const backup = settings.find((s: any) => s.id === "backup_data");
    t.truthy(backup);
    const raw = (backup.field as any).textarea.value as string;
    const parsed = JSON.parse(raw);
    t.truthy(parsed.meta);
    t.truthy(parsed.config);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// Ensure listeningModeOptions provided during initial setup + autodiscovery are persisted
test.serial("handleManualConfiguration: autodiscovery should persist listeningModeOptions when supplied", async (t) => {
  const tmp = mkTmpDir();
  try {
    const configModule = await importDistModule("dist/src/configManager.js");
    const SetupHandlerModule = await importDistModule("dist/src/setupHandler.js");
    const EiscpModule = await importDistModule("dist/src/eiscp.js");

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
      listeningModeOptions: "stereo; straight-decode"
    };

    const res = await (setup as any).handleManualConfiguration(input);
    t.true(res instanceof uc.SetupComplete);
    t.true(saved);

    const reloaded = ConfigManager.load();
    t.truthy(reloaded.avrs && reloaded.avrs[0].listeningModeOptions);
    t.deepEqual(reloaded.avrs![0].listeningModeOptions, ["stereo", "straight-decode"]);

    // restore stub
    EiscpModule.default.prototype.discover = originalDiscover;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
