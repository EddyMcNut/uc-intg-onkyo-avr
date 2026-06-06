import test from "ava";
import { pathToFileURL } from "url";
import path from "path";

test.serial("ensureZoneInstances creates zone instances when physical connection present", async (t) => {
  const mod = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/connectCoordinator.js")).href);
  const ensureZoneInstances = mod.ensureZoneInstances as (...args: any[]) => Promise<void>;

  const instances = new Map<string, any>();

  // Fake AVR config
  const avrs = [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main" }];

  // getPhysicalConnection returns an object with eiscp (connected) and commandReceiver
  const getPhysicalConnection = (_physicalAvr: string) => ({ eiscp: { connected: true }, commandReceiver: {} });

  // createAvrSpecificConfig just echoes
  const createAvrSpecificConfig = (cfg: any) => ({ ...cfg });

  // createCommandSender returns a dummy object referencing eiscp
  const createCommandSender = (_cfg: any, eiscp: any, _commandReceiver: any) => ({ eiscp });

  await ensureZoneInstances(instances, avrs, getPhysicalConnection, createAvrSpecificConfig, createCommandSender);

  const entries = Array.from(instances.entries());
  t.is(entries.length, 1);
  const [entryId, instance] = entries[0] as any;
  t.truthy(String(entryId).includes("M"));
  t.truthy(instance);
  t.truthy(instance.commandSender);
  t.truthy(instance.commandSender.eiscp.connected);
});

test.serial("ensureZoneInstances skips when no physical connection present", async (t) => {
  const mod = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/connectCoordinator.js")).href);
  const ensureZoneInstances = mod.ensureZoneInstances as (...args: any[]) => Promise<void>;

  const instances = new Map<string, any>();

  const avrs = [{ model: "M2", ip: "2.2.2.2", port: 60128, zone: "main" }];

  const getPhysicalConnection = (_physicalAvr: string) => undefined;
  const createAvrSpecificConfig = (cfg: any) => ({ ...cfg });
  const createCommandSender = (_cfg: any, eiscp: any, _commandReceiver: any) => ({ eiscp });

  await ensureZoneInstances(instances, avrs, getPhysicalConnection, createAvrSpecificConfig, createCommandSender);

  t.is(instances.size, 0);
});

test.serial("ensureZoneInstances refreshes config of existing instance", async (t) => {
  const mod = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/connectCoordinator.js")).href);
  const ensureZoneInstances = mod.ensureZoneInstances as (...args: any[]) => Promise<void>;

  const instances = new Map<string, any>();

  const avrs = [{ model: "M3", ip: "3.3.3.3", port: 60128, zone: "main" }];
  const getPhysicalConnection = (_physicalAvr: string) => ({ eiscp: { connected: true }, commandReceiver: {} });
  const createAvrSpecificConfig = (cfg: any) => ({ ...cfg });
  const updateConfigCalls: any[] = [];
  const createCommandSender = (_cfg: any, eiscp: any, _commandReceiver: any) => ({
    eiscp,
    updateConfig: (c: any) => updateConfigCalls.push(c)
  });

  // First call creates the instance
  await ensureZoneInstances(instances, avrs, getPhysicalConnection, createAvrSpecificConfig, createCommandSender);
  t.is(instances.size, 1);

  // Second call with updated config should refresh without creating a new instance
  const updatedAvrs = [{ model: "M3", ip: "3.3.3.3", port: 60128, zone: "main", queueThreshold: 999 }];
  await ensureZoneInstances(instances, updatedAvrs, getPhysicalConnection, createAvrSpecificConfig, createCommandSender);
  t.is(instances.size, 1);
  t.is(updateConfigCalls.length, 1);
  const entry = instances.values().next().value;
  t.is(entry.config.queueThreshold, 999);
});
