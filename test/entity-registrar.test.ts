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
});
