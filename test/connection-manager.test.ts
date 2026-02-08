import test from "ava";
import { pathToFileURL } from "url";
import path from "path";

// Helpers
function mkConn(connected = false) {
  return {
    connected,
    connect: async () => {
      return { model: "X" };
    },
    waitForConnect: async (_ms?: number) => {
      if (!connected) throw new Error("not connected");
    }
  } as any;
}

test.serial("schedule and cancel scheduled reconnection", async (t) => {
  const module = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/connectionManager.js")).href);
  const ConnectionManager = module.default as any;
  const reconModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/reconnectionManager.js")).href);
  const ReconnectionManager = reconModule.ReconnectionManager as any;

  const reconMgr = new ReconnectionManager();
  const cm = new ConnectionManager(
    reconMgr,
    async () => {},
    () => "v"
  );

  const physicalAVR = "model_1";
  const fakeEiscp = mkConn(false);
  const avrCfg = { model: "M", ip: "1.2.3.4", port: 60128 };
  const fakeConn = { eiscp: fakeEiscp, commandReceiver: { getConfig: () => avrCfg }, avrConfig: avrCfg };

  cm.scheduleReconnect(physicalAVR, fakeConn, avrCfg);
  // ReconnectionManager tracks timers; ensure it's scheduled
  t.true(reconMgr.hasScheduledReconnection(physicalAVR));

  // Cancel
  cm.cancelScheduledReconnection(physicalAVR);
  t.false(reconMgr.hasScheduledReconnection(physicalAVR));
});

test.serial("attemptReconnection delegates to reconnection manager and returns result", async (t) => {
  const module = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/connectionManager.js")).href);
  const ConnectionManager = module.default as any;

  // Stubbed reconnection manager with controlled response
  class StubRecon {
    async attemptReconnection() {
      return { success: true };
    }
    cancelScheduledReconnection() {}
    cancelAllScheduledReconnections() {}
  }

  const stub = new StubRecon();
  const cm = new ConnectionManager(
    stub as any,
    async () => {},
    () => "v"
  );

  const physicalAVR = "model_2";
  const avrCfg = { model: "M2", ip: "2.2.2.2", port: 60128 };
  const fakeEiscp = { connected: false } as any;
  cm.setPhysicalConnection(physicalAVR, { eiscp: fakeEiscp, commandReceiver: {}, avrConfig: avrCfg });

  const res = await cm.attemptReconnection(physicalAVR);
  t.deepEqual(res, { success: true });
});

test.serial("clearAllConnections removes stored connections", async (t) => {
  const module = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/connectionManager.js")).href);
  const ConnectionManager = module.default as any;
  const reconModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/reconnectionManager.js")).href);
  const ReconnectionManager = reconModule.ReconnectionManager as any;

  const reconMgr = new ReconnectionManager();
  const cm = new ConnectionManager(
    reconMgr,
    async () => {},
    () => "v"
  );

  const physicalAVR = "model_3";
  const avrCfg = { model: "M3", ip: "3.3.3.3", port: 60128 };
  const fakeEiscp = mkConn(false);
  cm.setPhysicalConnection(physicalAVR, { eiscp: fakeEiscp, commandReceiver: {}, avrConfig: avrCfg });

  t.truthy(cm.getPhysicalConnection(physicalAVR));
  cm.clearAllConnections();
  t.falsy(cm.getPhysicalConnection(physicalAVR));
});
