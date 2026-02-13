import test from "ava";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { setConfigDir, ConfigManager } from "../src/configManager.js";

function mkTmpDir(prefix = "onkyo-test-") {
  const os = require("os");
  const base = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return base;
}

// Ensure registerAvailableEntities re-applies listening-mode options after config change
test.serial("registerAvailableEntities refreshes listening_mode options on reconfigure", async (t) => {
  const tmp = mkTmpDir();
  try {
    setConfigDir(tmp);

    // Initial config with user list A
    ConfigManager.save({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", listeningModeOptions: ["old-a","old-b"] }] });

    const driverModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/onkyo.js")).href);
    const OnkyoDriver = driverModule.default as any;

    // Create a driver-like object without invoking constructor
    const drv: any = Object.create(OnkyoDriver.prototype);

    const updates: Array<{ id: string; attrs: any }> = [];
    drv.driver = {
      addAvailableEntity: () => {},
      getConfigDirPath: () => tmp,
      setDeviceState: async () => {},
      getConfiguredEntities: () => ({}),
      updateEntityAttributes: (id: string, attrs: any) => updates.push({ id, attrs })
    } as any;

    drv.config = ConfigManager.load();
    drv.entityRegistrar = new (await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/entityRegistrar.js")).href)).default();
    drv.registerAvailableEntities = (OnkyoDriver.prototype as any).registerAvailableEntities.bind(drv);

    // First registration should push the initial options
    await drv.registerAvailableEntities();
    const first = updates.find((u) => u.id.endsWith("_listening_mode"));
    t.truthy(first, "initial listening_mode update should be emitted");
    t.deepEqual(first!.attrs.options, ["old-a", "old-b"]);

    // Now simulate reconfigure: update config to new list B and re-register
    ConfigManager.save({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", listeningModeOptions: ["new-x","new-y"] }] });
    drv.config = ConfigManager.load();

    await drv.registerAvailableEntities();
    const last = updates.reverse().find((u) => u.id.endsWith("_listening_mode"));
    t.truthy(last, "listening_mode update should be emitted after reconfigure");
    t.deepEqual(last!.attrs.options, ["new-x", "new-y"]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});