import test from "ava";
import { pathToFileURL } from "url";
import fs from "fs";
import path from "path";

test.serial("EntityRegistrar builds entities correctly", async (t) => {
  // Import compiled module from dist
  const module = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/entityRegistrar.js")).href);
  const EntityRegistrar = module.default as any;
  const registrar = new EntityRegistrar();

  const avrEntry = "Model_192.168.1.2_main";

  const mp = registrar.createMediaPlayerEntity(avrEntry, 80, async () => {});
  t.truthy(mp);
  t.is((mp as any).options?.volume_steps, 80);

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

  // When user config contains listeningModeOptions, the select entity should use it exactly
  const userList = ["stereo", "straight-decode", "neural-thx", "full-mono"];
  const cfgModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/configManager.js")).href);
  cfgModule.ConfigManager.save({ avrs: [{ model: "Model", ip: "192.168.1.2", port: 60128, zone: "main", listeningModeOptions: userList }] });
  const registrar2Module = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/entityRegistrar.js")).href);
  const Registrar2 = registrar2Module.default as any;
  const registrar2 = new Registrar2();
  const select2 = registrar2.createListeningModeSelectEntity("Model 192.168.1.2 main", async () => {});
  const attrs2 = (select2 as any).attributes || {};
  t.deepEqual(attrs2.options, userList);
});
