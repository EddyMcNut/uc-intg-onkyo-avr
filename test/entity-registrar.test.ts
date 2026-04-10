import test from "ava";
import { pathToFileURL } from "url";
import fs from "fs";
import os from "os";
import path from "path";

function mkTmpDir(prefix = "onkyo-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test.serial("EntityRegistrar builds entities correctly", async (t) => {
  const tmp = mkTmpDir();
  try {
    const cfgModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/configManager.js")).href);
    if (typeof (cfgModule as any).setConfigDir === "function") {
      (cfgModule as any).setConfigDir(tmp);
    }

    // Import compiled module from dist
    const module = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/entityRegistrar.js")).href);
    const EntityRegistrar = module.default as any;
    const registrar = new EntityRegistrar();

    const avrEntry = "Model_192.168.1.2_main";

    const mp = registrar.createMediaPlayerEntity(avrEntry, 80, async () => {});
    t.truthy(mp);
    t.is((mp as any).options?.volume_steps, 80);
    t.is((mp as any).name?.en, "Model_192.168.1.2_main");

    const sensors = registrar.createSensorEntities(avrEntry);
    t.truthy(sensors);
    t.true(Array.isArray(sensors));
    t.true(sensors.length > 0);
    t.true((sensors[0] as any).id.startsWith(avrEntry));

    const select = registrar.createListeningModeSelectEntity(avrEntry, async () => {});
    t.truthy(select);
    const attrs = (select as any).attributes || {};
    t.true(Array.isArray(attrs.options));
    t.true(attrs.options.length > 0);
    t.true((select as any).id.endsWith("_listening_mode"));
    t.is((select as any).name?.en, "Model_192.168.1.2_main Listening Mode");

    // When user config contains listeningModeOptions, the select entity should use it exactly
    const userList = ["stereo", "straight-decode", "neural-thx", "full-mono"];
    (cfgModule as any).ConfigManager.save({ avrs: [{ model: "Model", ip: "192.168.1.2", port: 60128, zone: "main", listeningModeOptions: userList, entityNameStyle: "long" }] });
    const registrar2Module = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/entityRegistrar.js")).href);
    const Registrar2 = registrar2Module.default as any;
    const registrar2 = new Registrar2();
    const select2 = registrar2.createListeningModeSelectEntity("Model 192.168.1.2 main", async () => {});
    const attrs2 = (select2 as any).attributes || {};
    t.deepEqual(attrs2.options, userList);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test.serial("EntityRegistrar sensor names omit host from display name", async (t) => {
  const tmp = mkTmpDir();
  try {
    const cfgModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/configManager.js")).href);
    if (typeof (cfgModule as any).setConfigDir === "function") {
      (cfgModule as any).setConfigDir(tmp);
    }
    (cfgModule as any).ConfigManager.save({ avrs: [{ model: "TX-RZ50", ip: "192.168.1.2", port: 60128, zone: "main", entityNameStyle: "short" }] });
    const module = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/entityRegistrar.js")).href);
    const EntityRegistrar = module.default as any;
    const registrar = new EntityRegistrar();

    const avrEntry = "TX-RZ50 192.168.1.2 main";
    const sensors = registrar.createSensorEntities(avrEntry);

    t.true(Array.isArray(sensors));
    t.true(sensors.length > 0);
    t.is((sensors[0] as any).id, `${avrEntry}_volume_sensor`);
    t.is((sensors[0] as any).name?.en, "TX-RZ50 Main Volume");

    const mp = registrar.createMediaPlayerEntity(avrEntry, 100, async () => {});
    t.is((mp as any).name?.en, "TX-RZ50 Main");

    const listeningMode = registrar.createListeningModeSelectEntity(avrEntry, async () => {});
    t.is((listeningMode as any).name?.en, "TX-RZ50 Main Listening Mode");

    const inputSelector = registrar.createInputSelectorSelectEntity(avrEntry, async () => {});
    t.is((inputSelector as any).name?.en, "TX-RZ50 Main Input Selector");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test.serial("EntityRegistrar long entity names include host when configured", async (t) => {
  const tmp = mkTmpDir();
  try {
    const cfgModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/configManager.js")).href);
    if (typeof (cfgModule as any).setConfigDir === "function") {
      (cfgModule as any).setConfigDir(tmp);
    }
    (cfgModule as any).ConfigManager.save({ avrs: [{ model: "TX-RZ50", ip: "192.168.1.2", port: 60128, zone: "main", entityNameStyle: "long" }] });

    const module = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/entityRegistrar.js")).href);
    const EntityRegistrar = module.default as any;
    const registrar = new EntityRegistrar();
    const avrEntry = "TX-RZ50 192.168.1.2 main";

    const mp = registrar.createMediaPlayerEntity(avrEntry, 100, async () => {});
    t.is((mp as any).name?.en, avrEntry);

    const sensor = registrar.createSensorEntities(avrEntry)[0];
    t.is((sensor as any).name?.en, `${avrEntry} Volume`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
