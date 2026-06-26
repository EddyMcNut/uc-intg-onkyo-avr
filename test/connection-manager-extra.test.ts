import { describe, it, expect, vi } from "vitest";

// Mock eiscp module so constructor doesn't need net.Socket
vi.mock("../src/eiscp.js", () => ({
  default: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    waitForConnect: vi.fn(),
    disconnect: vi.fn(),
    updateConfig: vi.fn(),
    on: vi.fn(),
    command: vi.fn(),
    raw: vi.fn(),
    eiscpConfig: vi.fn()
  }))
}));

function mkEiscp(connected = false) {
  return {
    get connected() {
      return connected;
    },
    connect: vi.fn().mockResolvedValue({ model: "X", host: "1.2.3.4", port: 60128 }),
    waitForConnect: vi.fn(),
    disconnect: vi.fn(),
    updateConfig: vi.fn(),
    on: vi.fn(),
    command: vi.fn(),
    raw: vi.fn(),
    eiscpConfig: vi.fn()
  };
}

it("constructor stores injected dependencies", async () => {
  const mod = await import("../src/connectionManager.js");
  const CM = mod.default as any;
  const reconMod = await import("../src/reconnectionManager.js");
  const { ReconnectionManager } = reconMod as any;

  const reconMgr = new ReconnectionManager();
  const cm = new CM(
    reconMgr,
    async () => {},
    () => "v"
  );

  expect(cm.getPhysicalConnection("nonexistent")).toBeUndefined();
});

it("updateConnectionConfig updates eiscp config when connection exists", async () => {
  const mod = await import("../src/connectionManager.js");
  const CM = mod.default as any;
  const reconMod = await import("../src/reconnectionManager.js");
  const { ReconnectionManager } = reconMod as any;

  const reconMgr = new ReconnectionManager();
  const cm = new CM(
    reconMgr,
    async () => {},
    () => "v"
  );

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
  const cm = new CM(
    reconMgr,
    async () => {},
    () => "v"
  );

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
  const cm = new CM(
    reconMgr,
    async () => {},
    () => "v"
  );

  cm.updateConnectionConfig("nonexistent", {} as any);
});

it("disconnectAll disconnects all connected AVRs", async () => {
  const mod = await import("../src/connectionManager.js");
  const CM = mod.default as any;
  const reconMod = await import("../src/reconnectionManager.js");
  const { ReconnectionManager } = reconMod as any;

  const reconMgr = new ReconnectionManager();
  const cm = new CM(
    reconMgr,
    async () => {},
    () => "v"
  );

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
  const cm = new CM(
    reconMgr,
    async () => {},
    () => "v"
  );

  const eiscp = mkEiscp(true);
  cm.setPhysicalConnection("avr1", { eiscp, commandReceiver: {} as any });

  cm.clearAllConnections();

  expect(eiscp.disconnect).toHaveBeenCalled();
  expect(cm.getPhysicalConnection("avr1")).toBeUndefined();
});

describe("attemptReconnection", () => {
  it("returns false when no connection exists", async () => {
    const mod = await import("../src/connectionManager.js");
    const CM = mod.default as any;
    const reconMod = await import("../src/reconnectionManager.js");
    const { ReconnectionManager } = reconMod as any;

    const reconMgr = new ReconnectionManager();
    const cm = new CM(
      reconMgr,
      async () => {},
      () => "v"
    );

    const result = await cm.attemptReconnection("nonexistent");
    expect(result).toEqual({ success: false });
  });

  it("returns false when avrConfig is missing", async () => {
    const mod = await import("../src/connectionManager.js");
    const CM = mod.default as any;
    const reconMod = await import("../src/reconnectionManager.js");
    const { ReconnectionManager } = reconMod as any;

    const reconMgr = new ReconnectionManager();
    const cm = new CM(
      reconMgr,
      async () => {},
      () => "v"
    );

    const eiscp = { connected: false } as any;
    cm.setPhysicalConnection("avr1", { eiscp, commandReceiver: {} as any, avrConfig: undefined });

    const result = await cm.attemptReconnection("avr1");
    expect(result).toEqual({ success: false });
  });

  it("cancels scheduled reconnection on successful attempt", async () => {
    const mod = await import("../src/connectionManager.js");
    const CM = mod.default as any;

    class StubReconSuccess {
      async attemptReconnection() {
        return { success: true };
      }
      cancelScheduledReconnection = vi.fn();
      cancelAllScheduledReconnections() {}
    }

    const stub = new StubReconSuccess();
    const cm = new CM(
      stub as any,
      async () => {},
      () => "v"
    );

    const avrCfg = { model: "M", ip: "1.2.3.4", port: 60128 };
    const eiscp = { connected: false } as any;
    cm.setPhysicalConnection("avr1", { eiscp, commandReceiver: {} as any, avrConfig: avrCfg });

    const result = await cm.attemptReconnection("avr1");
    expect(result).toEqual({ success: true });
    expect(stub.cancelScheduledReconnection).toHaveBeenCalledWith("avr1");
  });

  it("catches error from reconnection manager and returns false", async () => {
    const mod = await import("../src/connectionManager.js");
    const CM = mod.default as any;

    class StubReconError {
      async attemptReconnection() {
        throw new Error("reconnect failed");
      }
      cancelScheduledReconnection = vi.fn();
      cancelAllScheduledReconnections() {}
    }

    const stub = new StubReconError();
    const cm = new CM(
      stub as any,
      async () => {},
      () => "v"
    );

    const avrCfg = { model: "M", ip: "1.2.3.4", port: 60128 };
    const eiscp = { connected: false } as any;
    cm.setPhysicalConnection("avr1", { eiscp, commandReceiver: {} as any, avrConfig: avrCfg });

    const result = await cm.attemptReconnection("avr1");
    expect(result).toEqual({ success: false });
  });
});

describe("createAndConnect", () => {
  it("schedules reconnect when connection fails", async () => {
    const mod = await import("../src/connectionManager.js");
    const CM = mod.default as any;
    const reconMod = await import("../src/reconnectionManager.js");
    const { ReconnectionManager } = reconMod as any;

    const reconMgr = new ReconnectionManager();
    const eiscp = mkEiscp();
    // Make connect return a result without model to trigger the throw
    eiscp.connect.mockResolvedValue({ model: null, host: "1.2.3.4", port: 60128 });

    const cm = new CM(
      reconMgr,
      async () => {},
      () => eiscp
    );

    const physicalAVR = "M 1.2.3.4";
    const avrCfg = { model: "M", ip: "1.2.3.4", port: 60128, netMenuDelay: 2500, tuneinPresetPosition: 1, queueThreshold: 100 };
    const createCommandReceiver = vi.fn(() => ({ setupEiscpListener: vi.fn(), updateConfig: vi.fn() }));

    const conn = await cm.createAndConnect(physicalAVR, avrCfg as any, createCommandReceiver);

    expect(eiscp.connect).toHaveBeenCalled();
    // Should still return the physical connection even on failure
    expect(conn.eiscp).toBe(eiscp);
  });

  it("schedules reconnect when connect returns null", async () => {
    const mod = await import("../src/connectionManager.js");
    const CM = mod.default as any;
    const reconMod = await import("../src/reconnectionManager.js");
    const { ReconnectionManager } = reconMod as any;

    const reconMgr = new ReconnectionManager();
    const eiscp = mkEiscp();
    eiscp.connect.mockResolvedValue(null);

    const cm = new CM(
      reconMgr,
      async () => {},
      () => eiscp
    );

    const physicalAVR = "M 1.2.3.4";
    const avrCfg = { model: "M", ip: "1.2.3.4", port: 60128, netMenuDelay: 2500, tuneinPresetPosition: 1, queueThreshold: 100 };
    const createCommandReceiver = vi.fn(() => ({ setupEiscpListener: vi.fn(), updateConfig: vi.fn() }));

    const conn = await cm.createAndConnect(physicalAVR, avrCfg as any, createCommandReceiver);

    expect(eiscp.connect).toHaveBeenCalled();
    expect(conn.eiscp).toBe(eiscp);
  });

  it("createAndConnect succeeds when connect returns valid model", async () => {
    const mod = await import("../src/connectionManager.js");
    const CM = mod.default as any;
    const reconMod = await import("../src/reconnectionManager.js");
    const { ReconnectionManager } = reconMod as any;

    const reconMgr = new ReconnectionManager();
    const eiscp = mkEiscp();
    eiscp.connect.mockResolvedValue({ model: "M", host: "1.2.3.4", port: 60128 });

    const cm = new CM(
      reconMgr,
      async () => {},
      () => eiscp
    );

    const avrCfg = { model: "M", ip: "1.2.3.4", port: 60128 };
    const createCommandReceiver = vi.fn(() => ({ setupEiscpListener: vi.fn(), updateConfig: vi.fn() }));

    const conn = await cm.createAndConnect("M 1.2.3.4", avrCfg as any, createCommandReceiver);

    expect(eiscp.connect).toHaveBeenCalled();
    expect(conn.eiscp).toBe(eiscp);
  });

  it("createAndConnect uses default queueThreshold when not provided", async () => {
    const mod = await import("../src/connectionManager.js");
    const CM = mod.default as any;
    const reconMod = await import("../src/reconnectionManager.js");
    const { ReconnectionManager } = reconMod as any;

    const reconMgr = new ReconnectionManager();
    const eiscp = mkEiscp();

    const cm = new CM(
      reconMgr,
      async () => {},
      () => eiscp
    );

    // No queueThreshold in avrCfg
    const avrCfg = { model: "M", ip: "1.2.3.4", port: 60128 };
    const createCommandReceiver = vi.fn(() => ({ setupEiscpListener: vi.fn(), updateConfig: vi.fn() }));

    await cm.createAndConnect("M 1.2.3.4", avrCfg as any, createCommandReceiver);

    expect(eiscp.connect).toHaveBeenCalled();
  });
});

describe("attemptReconnection with failed result", () => {
  it("does not cancel when attemptReconnection returns false", async () => {
    const mod = await import("../src/connectionManager.js");
    const CM = mod.default as any;

    class StubReconFail {
      async attemptReconnection() {
        return { success: false };
      }
      cancelScheduledReconnection = vi.fn();
      cancelAllScheduledReconnections() {}
    }

    const stub = new StubReconFail();
    const cm = new CM(
      stub as any,
      async () => {},
      () => "v"
    );

    const avrCfg = { model: "M", ip: "1.2.3.4", port: 60128 };
    const eiscp = { connected: false } as any;
    cm.setPhysicalConnection("avr1", { eiscp, commandReceiver: {} as any, avrConfig: avrCfg });

    const result = await cm.attemptReconnection("avr1");
    expect(result).toEqual({ success: false });
    expect(stub.cancelScheduledReconnection).not.toHaveBeenCalled();
  });
});

describe("constructor without factory", () => {
  it("sets default createEiscpDriver when not provided", async () => {
    const mod = await import("../src/connectionManager.js");
    const CM = mod.default as any;
    const reconMod = await import("../src/reconnectionManager.js");
    const { ReconnectionManager } = reconMod as any;

    const reconMgr = new ReconnectionManager();
    const cm = new CM(reconMgr, async () => {});

    expect(cm.createEiscpDriver).toBeDefined();
    expect(typeof cm.createEiscpDriver).toBe("function");
  });

  it("stores injected factory when provided", async () => {
    const mod = await import("../src/connectionManager.js");
    const CM = mod.default as any;
    const reconMod = await import("../src/reconnectionManager.js");
    const { ReconnectionManager } = reconMod as any;

    const reconMgr = new ReconnectionManager();
    const factory = () => "fake-eiscp" as any;
    const cm = new CM(reconMgr, async () => {}, factory);

    expect(cm.createEiscpDriver).toBe(factory);
    const result = cm.createEiscpDriver({} as any);
    expect(result).toBe("fake-eiscp");
  });
});
