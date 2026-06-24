import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

function mkTmpDir(prefix = "onkyo-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

it("EntityRegistrar builds entities correctly", async () => {
  const tmp = mkTmpDir();
  try {
    const cfgModule = await import("../src/configManager.js");
    if (typeof (cfgModule as any).setConfigDir === "function") {
      (cfgModule as any).setConfigDir(tmp);
    }

    // Import compiled module from dist
    const avrStateModule = await import("../src/avrState.js");
    const module = await import("../src/entityRegistrar.js");
    const EntityRegistrar = module.default as any;
    const { avrStateManager } = avrStateModule as any;
    const registrar = new EntityRegistrar(avrStateManager);

    const avrEntry = "Model_192.168.1.2_main";

    const mp = registrar.createMediaPlayerEntity(avrEntry, 80, async () => {});
    expect(mp).toBeTruthy();
    expect((mp as any).options?.volume_steps).toBe(80);
    expect(Array.isArray((mp as any).options?.simple_commands)).toBe(true);
    expect((mp as any).options?.simple_commands.length > 0).toBe(true);
    expect((mp as any).name?.en).toBe("Model_192.168.1.2_main");

    const sensors = registrar.createSensorEntities(avrEntry);
    expect(sensors).toBeTruthy();
    expect(Array.isArray(sensors)).toBe(true);
    expect(sensors.length > 0).toBe(true);
    expect((sensors[0] as any).id.startsWith(avrEntry)).toBe(true);

    const select = registrar.createListeningModeSelectEntity(avrEntry, async () => {});
    expect(select).toBeTruthy();
    const attrs = (select as any).attributes || {};
    expect(Array.isArray(attrs.options)).toBe(true);
    expect(attrs.options.length > 0).toBe(true);
    expect((select as any).id.endsWith("_listening_mode")).toBe(true);
    expect((select as any).name?.en).toBe("Model_192.168.1.2_main Listening Mode");

    // When user config contains listeningModeOptions, the select entity should use it exactly
    const userList = ["stereo", "straight-decode", "neural-thx", "full-mono"];
    (cfgModule as any).ConfigManager.save({ avrs: [{ model: "Model", ip: "192.168.1.2", port: 60128, zone: "main", listeningModeOptions: userList, entityNameStyle: "long" }] });
    const avrStateModule2 = await import("../src/avrState.js");
    const registrar2Module = await import("../src/entityRegistrar.js");
    const Registrar2 = registrar2Module.default as any;
    const { avrStateManager: avrStateManager2 } = avrStateModule2 as any;
    const registrar2 = new Registrar2(avrStateManager2);
    const select2 = registrar2.createListeningModeSelectEntity("Model 192.168.1.2 main", async () => {});
    const attrs2 = (select2 as any).attributes || {};
    expect(attrs2.options).toEqual(userList);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("EntityRegistrar sensor names omit host from display name", async () => {
  const tmp = mkTmpDir();
  try {
    const cfgModule = await import("../src/configManager.js");
    if (typeof (cfgModule as any).setConfigDir === "function") {
      (cfgModule as any).setConfigDir(tmp);
    }
    (cfgModule as any).ConfigManager.save({ avrs: [{ model: "TX-RZ50", ip: "192.168.1.2", port: 60128, zone: "main", entityNameStyle: "short" }] });
    const module = await import("../src/entityRegistrar.js");
    const avrStateModule = await import("../src/avrState.js");
    const EntityRegistrar = module.default as any;
    const { avrStateManager } = avrStateModule as any;
    const registrar = new EntityRegistrar(avrStateManager);

    const avrEntry = "TX-RZ50 192.168.1.2 main";
    const sensors = registrar.createSensorEntities(avrEntry);

    expect(Array.isArray(sensors)).toBe(true);
    expect(sensors.length > 0).toBe(true);
    expect((sensors[0] as any).id).toBe(`${avrEntry}_volume_sensor`);
    expect((sensors[0] as any).name?.en).toBe("TX-RZ50 Main Volume");

    const mp = registrar.createMediaPlayerEntity(avrEntry, 100, async () => {});
    expect((mp as any).name?.en).toBe("TX-RZ50 Main");

    const listeningMode = registrar.createListeningModeSelectEntity(avrEntry, async () => {});
    expect((listeningMode as any).name?.en).toBe("TX-RZ50 Main Listening Mode");

    const inputSelector = registrar.createInputSelectorSelectEntity(avrEntry, async () => {});
    expect((inputSelector as any).name?.en).toBe("TX-RZ50 Main Input Selector");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("EntityRegistrar long entity names include host when configured", async () => {
  const tmp = mkTmpDir();
  try {
    const cfgModule = await import("../src/configManager.js");
    if (typeof (cfgModule as any).setConfigDir === "function") {
      (cfgModule as any).setConfigDir(tmp);
    }
    (cfgModule as any).ConfigManager.save({ avrs: [{ model: "TX-RZ50", ip: "192.168.1.2", port: 60128, zone: "main", entityNameStyle: "long" }] });

    const module = await import("../src/entityRegistrar.js");
    const EntityRegistrar = module.default as any;
    const avrStateModule = await import("../src/avrState.js");
    const { avrStateManager } = avrStateModule as any;
    const registrar = new EntityRegistrar(avrStateManager);
    const avrEntry = "TX-RZ50 192.168.1.2 main";

    const mp = registrar.createMediaPlayerEntity(avrEntry, 100, async () => {});
    expect((mp as any).name?.en).toBe(avrEntry);

    const sensor = registrar.createSensorEntities(avrEntry)[0];
    expect((sensor as any).name?.en).toBe(`${avrEntry} Volume`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
