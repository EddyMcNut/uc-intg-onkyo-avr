import test from "ava";
import { pathToFileURL } from "url";
import path from "path";

test.serial("ensureZoneInstances creates zone instances when physical connection present", async (t) => {
  const mod = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrInstanceManager.js")).href);
  const AvrInstanceManager = mod.default as any;

  const manager = new AvrInstanceManager();

  // Fake AVR config
  const avrs = [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main" }];

  // getPhysicalConnection returns an object with eiscp (connected) and commandReceiver
  const getPhysicalConnection = (_physicalAvr: string) => ({ eiscp: { connected: true }, commandReceiver: {} });

  // createAvrSpecificConfig just echoes
  const createAvrSpecificConfig = (cfg: any) => ({ ...cfg });

  // createCommandSender returns a dummy object referencing eiscp
  const createCommandSender = (_cfg: any, eiscp: any) => ({ eiscp });

  await manager.ensureZoneInstances(avrs, getPhysicalConnection, createAvrSpecificConfig, createCommandSender);

  const entries = Array.from(manager.entries());
  t.is(entries.length, 1);
  const first = entries[0] as any;
  const [entryId, instance] = first;
  t.truthy(String(entryId).includes("M"));
  t.truthy(instance);
  t.truthy((instance as any).commandSender);
  t.truthy((instance as any).commandSender.eiscp.connected);
});

test.serial("ensureZoneInstances skips when no physical connection present", async (t) => {
  const mod = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrInstanceManager.js")).href);
  const AvrInstanceManager = mod.default as any;

  const manager = new AvrInstanceManager();

  const avrs = [{ model: "M2", ip: "2.2.2.2", port: 60128, zone: "main" }];

  const getPhysicalConnection = (_physicalAvr: string) => undefined;
  const createAvrSpecificConfig = (cfg: any) => ({ ...cfg });
  const createCommandSender = (_cfg: any, eiscp: any) => ({ eiscp });

  await manager.ensureZoneInstances(avrs, getPhysicalConnection, createAvrSpecificConfig, createCommandSender);

  const entries = Array.from(manager.entries());
  t.is(entries.length, 0);
});

test.serial("set/get/has/remove/clear operations work", async (t) => {
  const mod = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrInstanceManager.js")).href);
  const AvrInstanceManager = mod.default as any;

  const manager = new AvrInstanceManager();

  const id = "X_1.2.3.4_main";
  const inst = { config: { model: "X" }, commandSender: {} };

  manager.setInstance(id, inst);
  t.true(manager.hasInstance(id));
  t.deepEqual(manager.getInstance(id), inst);
  manager.removeInstance(id);
  t.false(manager.hasInstance(id));

  // clear
  manager.setInstance("a", inst);
  manager.setInstance("b", inst);
  t.true(Array.from(manager.entries()).length === 2);
  manager.clearInstances();
  t.true(Array.from(manager.entries()).length === 0);
});
