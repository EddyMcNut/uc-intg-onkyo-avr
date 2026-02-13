import test from "ava";
import fs from "fs";
import os from "os";
import path from "path";
import * as uc from "@unfoldedcircle/integration-api";
import { setConfigDir, ConfigManager } from "../src/configManager.js";

function mkTmpDir(prefix = "onkyo-test-") {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return base;
}

// NOTE: We dynamically import the compiled driver (dist/onkyo.js) at runtime
// so the tests run against the build artifact (matching CI: build then test).

test.serial("backup flow returns backup_data JSON", async (t) => {
  const tmp = mkTmpDir();
  try {
    setConfigDir(tmp);

    // Seed a sample config
    const sampleConfig = {
      avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main" }]
    } as any as Partial<import("../src/configManager.js").OnkyoConfig>;
    ConfigManager.save(sampleConfig);
    console.log("on-disk-config (after src save):", fs.readFileSync(path.join(tmp, "config.json"), "utf-8"));

    // Import compiled driver using a file:// URL (required on Windows ESM loader)
    const { pathToFileURL } = await import("url");
    const driverModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/onkyo.js")).href);
    const OnkyoDriver = driverModule.default as any;
    // Ensure the compiled ConfigManager uses the same temp config dir at runtime
    const configManagerModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/configManager.js")).href);
    if (configManagerModule && typeof configManagerModule.setConfigDir === "function") {
      configManagerModule.setConfigDir(tmp);
      console.log("dist config path set to", configManagerModule.getConfigPath && configManagerModule.getConfigPath());
      // Ensure dist config actually loads from disk
      if (typeof configManagerModule.load === "function") {
        const loaded = configManagerModule.load();
        console.log("dist config after load:", JSON.stringify(loaded));
      }
    }

    // Create a driver-like object without invoking constructor to avoid starting the API server
    const drv: any = Object.create(OnkyoDriver.prototype);
    drv.driver = { addAvailableEntity: () => {}, getConfigDirPath: () => tmp, setDeviceState: async () => {}, getConfiguredEntities: () => ({}) };
    drv.config = ConfigManager.load();
    drv.handleConnect = async () => {};
    (drv as any).registerAvailableEntities = (OnkyoDriver.prototype as any).registerAvailableEntities.bind(drv);

    // Step 1: start reconfigure (manager would do this)
    const startResp = await drv.handleDriverSetup(new uc.DriverSetupRequest(true, {}));
    t.true(startResp instanceof uc.RequestUserInput);

    // Step 2a: ask for backup action (no placeholder)
    const backupResp = await drv.handleDriverSetup(new uc.UserDataResponse({ action: "backup" }));
    t.true(backupResp instanceof uc.RequestUserInput);

    // Also simulate manager's PUT with action=backup and placeholder backup_data
    const managerReqResp = await drv.handleDriverSetup(new uc.UserDataResponse({ action: "backup", backup_data: "[]" }));
    t.true(managerReqResp instanceof uc.RequestUserInput);

    // Function to extract backup_data field from RequestUserInput
    function extractBackup(resp: uc.RequestUserInput): string {
      const settings = resp.settings as any[];
      const backupSetting = settings.find((s: any) => s.id === "backup_data");
      t.truthy(backupSetting);
      t.truthy(backupSetting.field && (backupSetting.field as any).textarea && (backupSetting.field as any).textarea.value);
      return (backupSetting.field as any).textarea.value as string;
    }

    const backupString = extractBackup(backupResp as uc.RequestUserInput);
    const backupStringManager = extractBackup(managerReqResp as uc.RequestUserInput);

    console.log("BACKUPSTRING (no placeholder):", backupString);
    console.log("BACKUPSTRING (manager placeholder):", backupStringManager);

    const parsed = JSON.parse(backupString);
    const parsedManager = JSON.parse(backupStringManager);

    t.truthy(parsed.meta);
    t.truthy(parsedManager.meta);
    const driverJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "driver.json"), "utf-8"));
    t.is(parsed.meta.driver_id, driverJson.driver_id);
    t.is(parsedManager.meta.driver_id, driverJson.driver_id);
    t.truthy(parsed.config);
    t.truthy(parsedManager.config);
    t.is(parsed.config.avrs?.[0].model, sampleConfig.avrs?.[0].model);
    t.is(parsed.config.avrs?.[0].ip, sampleConfig.avrs?.[0].ip);
    t.is(parsed.config.avrs?.[0].port, sampleConfig.avrs?.[0].port);
    t.is(parsed.config.avrs?.[0].zone, sampleConfig.avrs?.[0].zone);
    t.is(parsedManager.config.avrs?.[0].model, sampleConfig.avrs?.[0].model);
    t.is(parsedManager.config.avrs?.[0].ip, sampleConfig.avrs?.[0].ip);
    t.is(parsedManager.config.avrs?.[0].port, sampleConfig.avrs?.[0].port);
    t.is(parsedManager.config.avrs?.[0].zone, sampleConfig.avrs?.[0].zone);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test.serial("restore flow applies provided backup_data", async (t) => {
  const tmp = mkTmpDir();
  try {
    setConfigDir(tmp);

    // Start with an empty/other config so we can see it change
    ConfigManager.save({ avrs: [{ model: "OLD", ip: "0.0.0.0", port: 60128, zone: "main" }] });
    console.log("on-disk-config (after src save - restore test):", fs.readFileSync(path.join(tmp, "config.json"), "utf-8"));

    // Import compiled driver using a file:// URL (required on Windows ESM loader)
    const { pathToFileURL } = await import("url");
    const driverModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/onkyo.js")).href);
    const OnkyoDriver = driverModule.default as any;
    // Ensure the compiled ConfigManager uses the same temp config dir at runtime
    const configManagerModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/configManager.js")).href);
    if (configManagerModule && typeof configManagerModule.setConfigDir === "function") {
      configManagerModule.setConfigDir(tmp);
      console.log("dist config path set to", configManagerModule.getConfigPath && configManagerModule.getConfigPath());
      // Ensure dist config actually loads from disk
      if (typeof configManagerModule.load === "function") {
        const loaded = configManagerModule.load();
        console.log("dist config after load:", JSON.stringify(loaded));
      }
    }

    // Create a driver-like object without invoking constructor to avoid starting the API server
    const drv: any = Object.create(OnkyoDriver.prototype);
    drv.driver = { addAvailableEntity: () => {}, getConfigDirPath: () => tmp, setDeviceState: async () => {}, getConfiguredEntities: () => ({}) };
    drv.config = ConfigManager.load();
    drv.handleConnect = async () => {};
    (drv as any).registerAvailableEntities = (OnkyoDriver.prototype as any).registerAvailableEntities.bind(drv);

    // Create a backup payload to restore
    const driverJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "driver.json"), "utf-8"));
    const targetConfig = { avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main" }] } as any;
    const payload = { meta: { driver_id: driverJson.driver_id, version: driverJson.version }, config: targetConfig };
    const payloadString = JSON.stringify(payload);

    // Perform restore via setup input
    const restoreResp = await drv.handleDriverSetup(new uc.UserDataResponse({ action: "restore", backup_data: payloadString }));
    t.true(restoreResp instanceof uc.SetupComplete);

    // Verify config applied
    const reloaded = ConfigManager.load();
    t.truthy(reloaded.avrs);
    t.is(reloaded.avrs?.[0].model, targetConfig.avrs[0].model);
    t.is(reloaded.avrs?.[0].ip, targetConfig.avrs[0].ip);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
