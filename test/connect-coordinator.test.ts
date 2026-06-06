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
  let storedConn: any = undefined;
  const connMgr = {
    getPhysicalConnection: () => storedConn,
    createAndConnect: async (_physicalAVR: string, _avrCfg: any, _cb: any) => {
      createAndConnectCalled = true;
      storedConn = fakePhysicalConn;
      return fakePhysicalConn;
    },
    attemptReconnection: async () => ({ success: false }),
    cancelScheduledReconnection: () => {},
    cancelAllScheduledReconnections: () => {},
    disconnectAll: () => {}
  };

  const avrInstances = new Map<string, any>();

  const coordinator = new ConnectCoordinator(
    connMgr as any,
    avrInstances,
    async (_avrEntry: string, _eiscp: any, _ctx: string) => {},
    async () => {}
  );

  const config = { avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main" }] } as any;
  const res = await coordinator.connect(
    config,
    async (_avrCfg: any, _eiscp: any) => ({}),
    async () => ({})
  );

  t.true(createAndConnectCalled);
  t.is(avrInstances.size, 1);
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
    updateConnectionConfig: () => {},
    attemptReconnection: async (_physicalAVR: string) => {
      attemptCalled = true;
      return { success: true };
    },
    cancelScheduledReconnection: () => {},
    cancelAllScheduledReconnections: () => {},
    disconnectAll: () => {}
  } as any;

  let queryAllCalled = false;
  const avrInstances = new Map<string, any>();

  const coordinator = new ConnectCoordinator(
    connMgr as any,
    avrInstances,
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
  t.is(avrInstances.size, 1);
  t.true(queryAllCalled);
  t.true(res);
});
