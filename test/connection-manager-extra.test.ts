import { describe, it, expect, vi } from "vitest";

function mkEiscp(connected = false) {
  return {
    get connected() { return connected; },
    connect: vi.fn().mockResolvedValue({ model: "X", host: "1.2.3.4", port: 60128 }),
    waitForConnect: vi.fn(),
    disconnect: vi.fn(),
    updateConfig: vi.fn(),
    on: vi.fn(),
    command: vi.fn()
  };
}

it("constructor stores injected dependencies", async () => {
  const mod = await import("../src/connectionManager.js");
  const CM = mod.default as any;
  const reconMod = await import("../src/reconnectionManager.js");
  const { ReconnectionManager } = reconMod as any;

  const reconMgr = new ReconnectionManager();
  const cm = new CM(reconMgr, async () => {}, () => "v");

  expect(cm.getPhysicalConnection("nonexistent")).toBeUndefined();
});

it("updateConnectionConfig updates eiscp config when connection exists", async () => {
  const mod = await import("../src/connectionManager.js");
  const CM = mod.default as any;
  const reconMod = await import("../src/reconnectionManager.js");
  const { ReconnectionManager } = reconMod as any;

  const reconMgr = new ReconnectionManager();
  const cm = new CM(reconMgr, async () => {}, () => "v");

  const eiscp = mkEiscp();
  const commandReceiver = { updateConfig: vi.fn() };
  cm.setPhysicalConnection("M 1.2.3.4", { eiscp, commandReceiver, avrConfig: {} as any });

  cm.updateConnectionConfig("M 1.2.3.4", { netMenuDelay: 3000, tuneinPresetPosition: 2, queueThreshold: 200 } as any, ["main", "zone2"]);

  expect(eiscp.updateConfig).toHaveBeenCalledWith({
    netMenuDelay: 3000,
    tuneinPresetPosition: 2,
    sendDelay: 200,
    configuredZones: ["main", "zone2"]
  });
  expect(commandReceiver.updateConfig).not.toHaveBeenCalled();
});

it("updateConnectionConfig updates commandReceiver when runtimeConfig provided", async () => {
  const mod = await import("../src/connectionManager.js");
  const CM = mod.default as any;
  const reconMod = await import("../src/reconnectionManager.js");
  const { ReconnectionManager } = reconMod as any;

  const reconMgr = new ReconnectionManager();
  const cm = new CM(reconMgr, async () => {}, () => "v");

  const eiscp = mkEiscp();
  const commandReceiver = { updateConfig: vi.fn() };
  cm.setPhysicalConnection("M 1.2.3.4", { eiscp, commandReceiver, avrConfig: {} as any });

  cm.updateConnectionConfig("M 1.2.3.4", {} as any, undefined, { someConfig: true } as any);

  expect(commandReceiver.updateConfig).toHaveBeenCalledWith({ someConfig: true });
});

it("updateConnectionConfig is no-op for unknown AVR", async () => {
  const mod = await import("../src/connectionManager.js");
  const CM = mod.default as any;
  const reconMod = await import("../src/reconnectionManager.js");
  const { ReconnectionManager } = reconMod as any;

  const reconMgr = new ReconnectionManager();
  const cm = new CM(reconMgr, async () => {}, () => "v");

  cm.updateConnectionConfig("nonexistent", {} as any);
});

it("disconnectAll disconnects all connected AVRs", async () => {
  const mod = await import("../src/connectionManager.js");
  const CM = mod.default as any;
  const reconMod = await import("../src/reconnectionManager.js");
  const { ReconnectionManager } = reconMod as any;

  const reconMgr = new ReconnectionManager();
  const cm = new CM(reconMgr, async () => {}, () => "v");

  const eiscp1 = mkEiscp(true);
  const eiscp2 = mkEiscp(false);
  const eiscp3 = mkEiscp(true);

  cm.setPhysicalConnection("avr1", { eiscp: eiscp1, commandReceiver: {} as any });
  cm.setPhysicalConnection("avr2", { eiscp: eiscp2, commandReceiver: {} as any });
  cm.setPhysicalConnection("avr3", { eiscp: eiscp3, commandReceiver: {} as any });

  cm.disconnectAll();

  expect(eiscp1.disconnect).toHaveBeenCalledTimes(1);
  expect(eiscp2.disconnect).not.toHaveBeenCalled();
  expect(eiscp3.disconnect).toHaveBeenCalledTimes(1);
});

it("clearAllConnections disconnects and clears map", async () => {
  const mod = await import("../src/connectionManager.js");
  const CM = mod.default as any;
  const reconMod = await import("../src/reconnectionManager.js");
  const { ReconnectionManager } = reconMod as any;

  const reconMgr = new ReconnectionManager();
  const cm = new CM(reconMgr, async () => {}, () => "v");

  const eiscp = mkEiscp(true);
  cm.setPhysicalConnection("avr1", { eiscp, commandReceiver: {} as any });

  cm.clearAllConnections();

  expect(eiscp.disconnect).toHaveBeenCalled();
  expect(cm.getPhysicalConnection("avr1")).toBeUndefined();
});
