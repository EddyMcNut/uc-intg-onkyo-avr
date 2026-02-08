import test from "ava";
import { pathToFileURL } from "url";
import path from "path";

test.serial("connect returns false when no avrs configured", async (t) => {
  const mod = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/connectCoordinator.js")).href);
  const ConnectCoordinator = mod.default as any;

  // Stubs
  const connMgr = {
    getPhysicalConnection: () => undefined,
    createAndConnect: async () => {},
    attemptReconnection: async () => ({ success: false }),
    cancelScheduledReconnection: () => {},
    cancelAllScheduledReconnections: () => {},
    disconnectAll: () => {}
  };
  const avrMgr = { ensureZoneInstances: async () => {}, entries: () => [] as any[] };

  const coordinator = new ConnectCoordinator(
    connMgr as any,
    avrMgr as any,
    async () => {},
    async () => {}
  );

  const res = await coordinator.connect(
    { avrs: [] },
    async () => {},
    async () => {}
  );
  t.false(res);
});

test.serial("connect creates physical connections and zone instances when missing", async (t) => {
  const mod = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/connectCoordinator.js")).href);
  const ConnectCoordinator = mod.default as any;

  let createAndConnectCalled = false;
  const fakePhysicalConn = { eiscp: { connected: true }, commandReceiver: {}, avrConfig: { model: "M", ip: "1.2.3.4", port: 60128 } };
  const connMgr = {
    getPhysicalConnection: () => undefined,
    createAndConnect: async (_physicalAVR: string, avrCfg: any, cb: any) => {
      createAndConnectCalled = true;
      return fakePhysicalConn;
    },
    attemptReconnection: async () => ({ success: false }),
    cancelScheduledReconnection: () => {},
    cancelAllScheduledReconnections: () => {},
    disconnectAll: () => {}
  };

  let ensureCalled = false;
  const avrMgr = {
    ensureZoneInstances: async (avrs: any[], getPhysicalConnection: any, createAvrSpecificConfig: any, createCommandSender: any) => {
      ensureCalled = true;
    },
    entries: () => [["M_1.2.3.4_main", { config: { model: "M", ip: "1.2.3.4", zone: "main" } }]]
  } as any;

  let queryCalled = false;
  const coordinator = new ConnectCoordinator(
    connMgr as any,
    avrMgr as any,
    async (_avrEntry: string, _eiscp: any, _ctx: string) => {
      queryCalled = true;
    },
    async () => {}
  );

  const config = { avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main" }] } as any;
  const res = await coordinator.connect(
    config,
    async (_avrCfg: any, _eiscp: any) => ({}),
    async () => ({})
  );

  t.true(createAndConnectCalled);
  t.true(ensureCalled);
  t.true(res);
});

test.serial("connect handles reconnection when physical connection exists but disconnected", async (t) => {
  const mod = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/connectCoordinator.js")).href);
  const ConnectCoordinator = mod.default as any;

  let attemptCalled = false;
  const fakePhysicalConn = { eiscp: { connected: false }, commandReceiver: {}, avrConfig: { model: "M", ip: "1.2.3.4", port: 60128 } };
  const connMgr = {
    getPhysicalConnection: () => fakePhysicalConn,
    createAndConnect: async () => fakePhysicalConn,
    attemptReconnection: async (_physicalAVR: string) => {
      attemptCalled = true;
      return { success: true };
    },
    cancelScheduledReconnection: () => {},
    cancelAllScheduledReconnections: () => {},
    disconnectAll: () => {}
  } as any;

  let ensureCalled = false;
  let queryAllCalled = false;
  const avrMgr = {
    ensureZoneInstances: async () => {
      ensureCalled = true;
    },
    entries: () => [["M_1.2.3.4_main", { config: { model: "M", ip: "1.2.3.4", zone: "main" } }]]
  } as any;

  const coordinator = new ConnectCoordinator(
    connMgr as any,
    avrMgr as any,
    async () => {},
    async () => {
      queryAllCalled = true;
    }
  );

  const config = { avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main" }] } as any;
  const res = await coordinator.connect(
    config,
    async () => ({}),
    async () => ({})
  );

  t.true(attemptCalled);
  t.true(ensureCalled);
  t.true(queryAllCalled);
  t.true(res);
});
