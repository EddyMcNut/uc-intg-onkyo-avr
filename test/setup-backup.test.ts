import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import * as uc from "@unfoldedcircle/integration-api";
import type { IntegrationAPI } from "@unfoldedcircle/integration-api";
import { setConfigDir, ConfigManager } from "../src/configManager.js";

function mkTmpDir(prefix = "onkyo-test-") {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return base;
}

// NOTE: We dynamically import the compiled driver (dist/driver.js) at runtime
// so the tests run against the build artifact (matching CI: build then test).

it("backup flow returns backup_data JSON", async () => {
  const tmp = mkTmpDir();
  try {
    setConfigDir(tmp);

    // Seed a sample config
    const sampleConfig = {
      avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main", entityNameStyle: "short" }]
    } as Partial<import("../src/configManager.js").OnkyoConfig>;
    ConfigManager.save(sampleConfig);
    console.log("on-disk-config (after src save):", fs.readFileSync(path.join(tmp, "config.json"), "utf-8"));

    // Import compiled driver using a file:// URL (required on Windows ESM loader)
    const driverModule = await import("../src/driver.js");
    const OnkyoDriver = driverModule.default as any;
    // Ensure the compiled ConfigManager uses the same temp config dir at runtime
    const configManagerModule = await import("../src/configManager.js");
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
    interface DriverLike {
      driver?: Partial<IntegrationAPI>;
      config?: any;
      handleConnect?: () => Promise<void>;
      registerAvailableEntities?: () => Promise<void>;
      handleDriverSetup?: Function;
    }
    const drv = Object.create(OnkyoDriver.prototype) as DriverLike;
    drv.driver = { addAvailableEntity: () => {}, getConfigDirPath: () => tmp, setDeviceState: async () => {}, getConfiguredEntities: () => ({}) } as unknown as Partial<IntegrationAPI>;
    drv.config = ConfigManager.load();
    drv.handleConnect = async () => {};
    drv.registerAvailableEntities = (OnkyoDriver.prototype as any).registerAvailableEntities.bind(drv);

    // Step 1: start reconfigure (manager would do this)
    const startResp = await drv.handleDriverSetup?.(new uc.DriverSetupRequest(true, {}));
    expect(startResp).toBeInstanceOf(uc.RequestUserInput);

    // Step 2a: ask for backup action (no placeholder)
    const backupResp = await drv.handleDriverSetup?.(new uc.UserDataResponse({ action: "backup" }));
    expect(backupResp instanceof uc.RequestUserInput).toBe(true);

    // Also simulate manager's PUT with action=backup and placeholder backup_data
    const managerReqResp = await drv.handleDriverSetup?.(new uc.UserDataResponse({ action: "backup", backup_data: "[]" }));
    expect(managerReqResp instanceof uc.RequestUserInput).toBe(true);

    // Function to extract backup_data field from RequestUserInput
    function extractBackup(resp: uc.RequestUserInput): string {
      const settings = resp.settings as Array<{ id: string; field?: { textarea?: { value: string } } }>;
      const backupSetting = settings.find((s) => s.id === "backup_data");
      expect(backupSetting).toBeTruthy();
      expect(backupSetting).toBeTruthy();
      expect(backupSetting?.field?.textarea?.value).toBeTruthy();
      return backupSetting!.field!.textarea!.value;
    }

    const backupString = extractBackup(backupResp as uc.RequestUserInput);
    const backupStringManager = extractBackup(managerReqResp as uc.RequestUserInput);

    console.log("BACKUPSTRING (no placeholder):", backupString);
    console.log("BACKUPSTRING (manager placeholder):", backupStringManager);

    const parsed = JSON.parse(backupString);
    const parsedManager = JSON.parse(backupStringManager);

    expect(parsed.meta).toBeTruthy();
    expect(parsedManager.meta).toBeTruthy();
    const driverJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "driver.json"), "utf-8"));
    expect(parsed.meta.driver_id).toBe(driverJson.driver_id);
    expect(parsedManager.meta.driver_id).toBe(driverJson.driver_id);
    expect(parsed.config).toBeTruthy();
    expect(parsedManager.config).toBeTruthy();
    expect(parsed.config.avrs?.[0].model).toBe(sampleConfig.avrs?.[0].model);
    expect(parsed.config.avrs?.[0].ip).toBe(sampleConfig.avrs?.[0].ip);
    expect(parsed.config.avrs?.[0].port).toBe(sampleConfig.avrs?.[0].port);
    expect(parsed.config.avrs?.[0].zone).toBe(sampleConfig.avrs?.[0].zone);
    expect(parsed.config.avrs?.[0].entityNameStyle).toBe(sampleConfig.avrs?.[0].entityNameStyle);
    expect(parsedManager.config.avrs?.[0].model).toBe(sampleConfig.avrs?.[0].model);
    expect(parsedManager.config.avrs?.[0].ip).toBe(sampleConfig.avrs?.[0].ip);
    expect(parsedManager.config.avrs?.[0].port).toBe(sampleConfig.avrs?.[0].port);
    expect(parsedManager.config.avrs?.[0].zone).toBe(sampleConfig.avrs?.[0].zone);
    expect(parsedManager.config.avrs?.[0].entityNameStyle).toBe(sampleConfig.avrs?.[0].entityNameStyle);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("restore flow applies provided backup_data", async () => {
  const tmp = mkTmpDir();
  try {
    setConfigDir(tmp);

    // Start with an empty/other config so we can see it change
    ConfigManager.save({ avrs: [{ model: "OLD", ip: "0.0.0.0", port: 60128, zone: "main" }] });
    console.log("on-disk-config (after src save - restore test):", fs.readFileSync(path.join(tmp, "config.json"), "utf-8"));

    // Import compiled driver using a file:// URL (required on Windows ESM loader)
    const driverModule = await import("../src/driver.js");
    const OnkyoDriver = driverModule.default as any;
    // Ensure the compiled ConfigManager uses the same temp config dir at runtime
    const configManagerModule = await import("../src/configManager.js");
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
    interface DriverLike {
      driver?: Partial<IntegrationAPI>;
      config?: any;
      handleConnect?: () => Promise<void>;
      registerAvailableEntities?: () => Promise<void>;
      handleDriverSetup?: Function;
    }
    const drv = Object.create(OnkyoDriver.prototype) as DriverLike;
    drv.driver = { addAvailableEntity: () => {}, getConfigDirPath: () => tmp, setDeviceState: async () => {}, getConfiguredEntities: () => ({}) } as unknown as Partial<IntegrationAPI>;
    drv.config = ConfigManager.load();
    drv.handleConnect = async () => {};
    drv.registerAvailableEntities = (OnkyoDriver.prototype as any).registerAvailableEntities.bind(drv);

    // Create a backup payload to restore
    const driverJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "driver.json"), "utf-8"));
    const targetConfig = { avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main", entityNameStyle: "short" }] } as Partial<import("../src/configManager.js").OnkyoConfig>;
    const payload = { meta: { driver_id: driverJson.driver_id, version: driverJson.version }, config: targetConfig };
    const payloadString = JSON.stringify(payload);

    // Perform restore via setup input
    const restoreResp = await drv.handleDriverSetup?.(new uc.UserDataResponse({ action: "restore", backup_data: payloadString }));
    expect(restoreResp).toBeInstanceOf(uc.SetupComplete);

    // Verify config applied
    const reloaded = ConfigManager.load();
    expect(reloaded.avrs).toBeTruthy();
    expect(reloaded.avrs?.[0].model).toBe(targetConfig.avrs![0].model);
    expect(reloaded.avrs?.[0].ip).toBe(targetConfig.avrs![0].ip);
    expect(reloaded.avrs?.[0].entityNameStyle).toBe(targetConfig.avrs![0].entityNameStyle);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("restore flow defaults missing TuneIn menu setting to mypresets", async () => {
  const tmp = mkTmpDir();
  try {
    setConfigDir(tmp);

    ConfigManager.save({ avrs: [{ model: "OLD", ip: "0.0.0.0", port: 60128, zone: "main" }] });

    const driverModule = await import("../src/driver.js");
    const OnkyoDriver = driverModule.default as any;
    const configManagerModule = await import("../src/configManager.js");
    if (configManagerModule && typeof configManagerModule.setConfigDir === "function") {
      configManagerModule.setConfigDir(tmp);
    }

    interface DriverLike {
      driver?: Partial<IntegrationAPI>;
      config?: any;
      handleConnect?: () => Promise<void>;
      registerAvailableEntities?: () => Promise<void>;
      handleDriverSetup?: Function;
    }
    const drv = Object.create(OnkyoDriver.prototype) as DriverLike;
    drv.driver = { addAvailableEntity: () => {}, getConfigDirPath: () => tmp, setDeviceState: async () => {}, getConfiguredEntities: () => ({}) } as unknown as Partial<IntegrationAPI>;
    drv.config = ConfigManager.load();
    drv.handleConnect = async () => {};
    drv.registerAvailableEntities = (OnkyoDriver.prototype as any).registerAvailableEntities.bind(drv);

    const driverJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "driver.json"), "utf-8"));
    const targetConfig = { avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main", entityNameStyle: "short" }] } as Partial<import("../src/configManager.js").OnkyoConfig>;
    const payload = { meta: { driver_id: driverJson.driver_id, version: driverJson.version }, config: targetConfig };
    const payloadString = JSON.stringify(payload);

    const restoreResp = await drv.handleDriverSetup?.(new uc.UserDataResponse({ action: "restore", backup_data: payloadString }));
    expect(restoreResp).toBeInstanceOf(uc.SetupComplete);

    const reloaded = ConfigManager.load();
    expect(reloaded.avrs).toBeTruthy();
    expect(reloaded.avrs?.[0].model).toBe(targetConfig.avrs![0].model);
    expect(reloaded.avrs?.[0].ip).toBe(targetConfig.avrs![0].ip);
    expect(reloaded.avrs?.[0].entityNameStyle).toBe(targetConfig.avrs![0].entityNameStyle);
    expect(reloaded.avrs?.[0].tuneinMenuStyle).toBe("mypresets");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("restore flow accepts intg-manager restore_from_backup payload", async () => {
  const tmp = mkTmpDir();
  try {
    setConfigDir(tmp);

    ConfigManager.save({ avrs: [{ model: "OLD", ip: "0.0.0.0", port: 60128, zone: "main" }] });

    const driverModule = await import("../src/driver.js");
    const OnkyoDriver = driverModule.default as any;
    const configManagerModule = await import("../src/configManager.js");
    if (configManagerModule && typeof configManagerModule.setConfigDir === "function") {
      configManagerModule.setConfigDir(tmp);
    }

    interface DriverLike {
      driver?: Partial<IntegrationAPI>;
      config?: any;
      handleConnect?: () => Promise<void>;
      registerAvailableEntities?: () => Promise<void>;
      handleDriverSetup?: Function;
    }
    const drv = Object.create(OnkyoDriver.prototype) as DriverLike;
    drv.driver = { addAvailableEntity: () => {}, getConfigDirPath: () => tmp, setDeviceState: async () => {}, getConfiguredEntities: () => ({}) } as unknown as Partial<IntegrationAPI>;
    drv.config = ConfigManager.load();
    drv.handleConnect = async () => {};
    drv.registerAvailableEntities = (OnkyoDriver.prototype as any).registerAvailableEntities.bind(drv);

    const driverJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "driver.json"), "utf-8"));
    const targetConfig = { avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main", entityNameStyle: "short" }] } as Partial<import("../src/configManager.js").OnkyoConfig>;
    const payload = { meta: { driver_id: driverJson.driver_id, version: driverJson.version }, config: targetConfig };
    const payloadString = JSON.stringify(payload);

    const startResp = await drv.handleDriverSetup?.(new uc.DriverSetupRequest(false, {}));
    expect(startResp).toBeInstanceOf(uc.RequestUserInput);

    const promptResp = await drv.handleDriverSetup?.(new uc.UserDataResponse({ restore_from_backup: "true" }));
    expect(promptResp instanceof uc.RequestUserInput).toBe(true);

    const restoreResp = await drv.handleDriverSetup?.(new uc.UserDataResponse({ restore_from_backup: "true", restore_data: payloadString }));
    expect(restoreResp).toBeInstanceOf(uc.SetupComplete);

    const reloaded = ConfigManager.load();
    expect(reloaded.avrs).toBeTruthy();
    expect(reloaded.avrs?.[0].model).toBe(targetConfig.avrs![0].model);
    expect(reloaded.avrs?.[0].ip).toBe(targetConfig.avrs![0].ip);
    expect(reloaded.avrs?.[0].entityNameStyle).toBe(targetConfig.avrs![0].entityNameStyle);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("initial setup manual mode opens configuration form", async () => {
  const tmp = mkTmpDir();
  try {
    setConfigDir(tmp);

    const driverModule = await import("../src/driver.js");
    const OnkyoDriver = driverModule.default as any;
    const configManagerModule = await import("../src/configManager.js");
    if (configManagerModule && typeof configManagerModule.setConfigDir === "function") {
      configManagerModule.setConfigDir(tmp);
    }

    interface DriverLike {
      driver?: Partial<IntegrationAPI>;
      config?: any;
      handleConnect?: () => Promise<void>;
      registerAvailableEntities?: () => Promise<void>;
      handleDriverSetup?: Function;
    }
    const drv = Object.create(OnkyoDriver.prototype) as DriverLike;
    drv.driver = { addAvailableEntity: () => {}, getConfigDirPath: () => tmp, setDeviceState: async () => {}, getConfiguredEntities: () => ({}) } as unknown as Partial<IntegrationAPI>;
    drv.config = ConfigManager.load();
    drv.handleConnect = async () => {};
    drv.registerAvailableEntities = (OnkyoDriver.prototype as any).registerAvailableEntities.bind(drv);

    const startResp = await drv.handleDriverSetup?.(new uc.DriverSetupRequest(false, {}));
    expect(startResp).toBeInstanceOf(uc.RequestUserInput);

    const manualResp = await drv.handleDriverSetup?.(new uc.UserDataResponse({ restore_from_backup: "false" }));
    expect(manualResp instanceof uc.RequestUserInput).toBe(true);
    const settings = (manualResp as uc.RequestUserInput).settings as Array<{ id: string }>;
    expect(settings.find((s) => s.id === "model")).toBeTruthy();
    expect(settings.find((s) => s.id === "ipAddress")).toBeTruthy();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
