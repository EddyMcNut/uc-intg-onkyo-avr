import { describe, it, expect } from "vitest";
import type { IntegrationAPI } from "@unfoldedcircle/integration-api";
import fs from "fs";
import os from "os";
import path from "path";
import { setConfigDir, ConfigManager } from "../src/configManager.js";

function mkTmpDir(prefix = "onkyo-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Ensure registerAvailableEntities re-applies listening-mode options after config change
it("registerAvailableEntities refreshes listening_mode options on reconfigure", async () => {
  const tmp = mkTmpDir();
  try {
    setConfigDir(tmp);

    // Initial config with user list A
    ConfigManager.save({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", listeningModeOptions: ["old-a", "old-b"] }] });

    const driverModule = await import("../src/driver.js");
    const OnkyoDriver = driverModule.default as any;

    // Create a driver-like object without invoking constructor
    interface DriverLike {
      driver?: Partial<IntegrationAPI>;
      config?: any;
      entityRegistrar?: any;
      registerAvailableEntities?: () => Promise<void>;
      handleDriverSetup?: Function; // present on real driver instances
    }
    const drv = Object.create(OnkyoDriver.prototype) as DriverLike;

    // record attribute updates with correct typing
    const updates: Array<{ id: string; attrs: { [key: string]: string | number | boolean } }> = [];
    drv.driver = {
      addAvailableEntity: () => {},
      getConfigDirPath: () => tmp,
      setDeviceState: async () => {},
      getConfiguredEntities: () => ({}),
      updateEntityAttributes: (id: string, attrs: { [key: string]: string | number | boolean }) => {
        updates.push({ id, attrs });
        return true;
      }
    } as unknown as Partial<IntegrationAPI>;

    drv.config = ConfigManager.load();
    drv.entityRegistrar = new (await import("../src/entityRegistrar.js")).default();
    drv.registerAvailableEntities = (OnkyoDriver.prototype as any).registerAvailableEntities.bind(drv);

    // First registration should push the initial options
    await drv.registerAvailableEntities?.();
    const first = updates.find((u) => u.id.endsWith("_listening_mode"));
    expect(first).toBeTruthy();
    expect(first!.attrs.options).toEqual(["old-a", "old-b"]);

    // Now simulate reconfigure: update config to new list B and re-register
    ConfigManager.save({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", listeningModeOptions: ["new-x", "new-y"] }] });
    drv.config = ConfigManager.load();

    await drv.registerAvailableEntities?.();
    const last = updates.reverse().find((u) => u.id.endsWith("_listening_mode"));
    expect(last).toBeTruthy();
    expect(last!.attrs.options).toEqual(["new-x", "new-y"]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
