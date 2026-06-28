import { describe, it, expect } from "vitest";
import path from "path";

it("ensureZoneInstances creates zone instances when physical connection present", async () => {
  const mod = await import("../src/connectCoordinator.js");
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
  expect(entries.length).toBe(1);
  const [entryId, instance] = entries[0] as any;
  expect(String(entryId).includes("M")).toBeTruthy();
  expect(instance).toBeTruthy();
  expect(instance.commandSender).toBeTruthy();
  expect(instance.commandSender.eiscp.connected).toBeTruthy();
});

it("ensureZoneInstances skips when no physical connection present", async () => {
  const mod = await import("../src/connectCoordinator.js");
  const ensureZoneInstances = mod.ensureZoneInstances as (...args: any[]) => Promise<void>;

  const instances = new Map<string, any>();

  const avrs = [{ model: "M2", ip: "2.2.2.2", port: 60128, zone: "main" }];

  const getPhysicalConnection = (_physicalAvr: string) => undefined;
  const createAvrSpecificConfig = (cfg: any) => ({ ...cfg });
  const createCommandSender = (_cfg: any, eiscp: any, _commandReceiver: any) => ({ eiscp });

  await ensureZoneInstances(instances, avrs, getPhysicalConnection, createAvrSpecificConfig, createCommandSender);

  expect(instances.size).toBe(0);
});

it("ensureZoneInstances refreshes config of existing instance", async () => {
  const mod = await import("../src/connectCoordinator.js");
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
  expect(instances.size).toBe(1);

  // Second call with updated config should refresh without creating a new instance
  const updatedAvrs = [{ model: "M3", ip: "3.3.3.3", port: 60128, zone: "main", queueThreshold: 999 }];
  await ensureZoneInstances(instances, updatedAvrs, getPhysicalConnection, createAvrSpecificConfig, createCommandSender);
  expect(instances.size).toBe(1);
  expect(updateConfigCalls.length).toBe(1);
  const entry = instances.values().next().value;
  expect(entry.config.queueThreshold).toBe(999);
});
