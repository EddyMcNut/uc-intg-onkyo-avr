import { describe, it, expect, vi, beforeEach } from "vitest";

function makeMockEiscp(connected = true) {
  return {
    get connected() { return connected; },
    connect: vi.fn().mockResolvedValue({ model: "M", host: "1.2.3.4", port: 60128 }),
    waitForConnect: vi.fn().mockResolvedValue(undefined),
    command: vi.fn()
  };
}

const avrQMod = await import("../src/avrStateQuery.js");
const { avrStateQueryService } = avrQMod as any;
const querySpy = vi.spyOn(avrStateQueryService, "queryAvrState");

beforeEach(() => {
  querySpy.mockClear();
});

it("handle returns early when no instance found for entity", async () => {
  const subMod = await import("../src/subscriptionHandler.js");
  const SubHandler = subMod.default as any;

  const connectionManager = { getPhysicalConnection: vi.fn(), scheduleReconnect: vi.fn() };
  const avrInstances = new Map();

  const handler = new SubHandler(connectionManager, avrInstances);

  await handler.handle("nonexistent_main");

  expect(querySpy).not.toHaveBeenCalled();
});

it("handle returns early when shouldQuery returns false", async () => {
  const subMod = await import("../src/subscriptionHandler.js");
  const SubHandler = subMod.default as any;

  const eid = "sh-sq-" + Date.now();
  avrStateQueryService.recordQuery(eid);

  const connectionManager = { getPhysicalConnection: vi.fn(), scheduleReconnect: vi.fn() };
  const avrInstances = new Map([[eid, { config: { model: "M", ip: "1.2.3.4", port: 60128, zone: "main" } }]]);

  const handler = new SubHandler(connectionManager, avrInstances);

  await handler.handle(eid);

  expect(querySpy).not.toHaveBeenCalled();
});

it("handle returns early when no physical connection found", async () => {
  const subMod = await import("../src/subscriptionHandler.js");
  const SubHandler = subMod.default as any;
  const cfgMod = await import("../src/configManager.js");
  const { buildPhysicalAvrId } = cfgMod as any;

  const eid = "sh-noconn-" + Date.now();
  const model = "M";
  const ip = "1.2.3.4";

  const connectionManager = { getPhysicalConnection: vi.fn().mockReturnValue(undefined), scheduleReconnect: vi.fn() };
  const avrInstances = new Map([[eid, { config: { model, ip, port: 60128, zone: "main" } }]]);

  const handler = new SubHandler(connectionManager, avrInstances);

  await handler.handle(eid);

  expect(querySpy).not.toHaveBeenCalled();
  expect(connectionManager.getPhysicalConnection).toHaveBeenCalledWith(buildPhysicalAvrId(model, ip));
});

it("handle queries AVR state when connected", async () => {
  const subMod = await import("../src/subscriptionHandler.js");
  const SubHandler = subMod.default as any;

  const eid = "sh-conn-" + Date.now();
  const model = "M";
  const ip = "1.2.3.4";
  const mockEiscp = makeMockEiscp(true);

  const connectionManager = {
    getPhysicalConnection: vi.fn().mockReturnValue({ eiscp: mockEiscp, commandReceiver: {} }),
    scheduleReconnect: vi.fn()
  };
  const avrInstances = new Map([[eid, { config: { model, ip, port: 60128, zone: "main", queueThreshold: 100 } }]]);

  const handler = new SubHandler(connectionManager, avrInstances);

  await handler.handle(eid);

  expect(querySpy).toHaveBeenCalledWith(eid, mockEiscp, "main", "on subscribe", 100);
});

it("attempts reconnection when not connected", async () => {
  const subMod = await import("../src/subscriptionHandler.js");
  const SubHandler = subMod.default as any;

  const eid = "sh-reconn-" + Date.now();
  const model = "M";
  const ip = "1.2.3.4";
  const mockEiscp = makeMockEiscp(false);

  const connectionManager = {
    getPhysicalConnection: vi.fn().mockReturnValue({ eiscp: mockEiscp, commandReceiver: {} }),
    scheduleReconnect: vi.fn()
  };
  const avrInstances = new Map([[eid, { config: { model, ip, port: 60128, zone: "main", queueThreshold: 50 } }]]);

  const handler = new SubHandler(connectionManager, avrInstances);

  await handler.handle(eid);

  expect(mockEiscp.connect).toHaveBeenCalledWith({ model, host: ip, port: 60128 });
  expect(mockEiscp.waitForConnect).toHaveBeenCalled();
  expect(querySpy).toHaveBeenCalledWith(eid, mockEiscp, "main", "after subscription reconnection", 50);
});

it("schedules reconnect when reconnection fails", async () => {
  const subMod = await import("../src/subscriptionHandler.js");
  const SubHandler = subMod.default as any;

  const eid = "sh-fail-" + Date.now();
  const model = "M";
  const ip = "1.2.3.4";
  const mockEiscp = {
    get connected() { return false; },
    connect: vi.fn().mockResolvedValue({ model, host: ip, port: 60128 }),
    waitForConnect: vi.fn().mockRejectedValue(new Error("timeout")),
    command: vi.fn()
  };
  const physicalAVR = `${model} ${ip}`;

  const connectionManager = {
    getPhysicalConnection: vi.fn().mockReturnValue({ eiscp: mockEiscp, commandReceiver: {} }),
    scheduleReconnect: vi.fn()
  };
  const avrInstances = new Map([[eid, { config: { model, ip, port: 60128, zone: "main" } }]]);

  const handler = new SubHandler(connectionManager, avrInstances);

  await handler.handle(eid);

  expect(connectionManager.scheduleReconnect).toHaveBeenCalledWith(physicalAVR, { eiscp: mockEiscp, commandReceiver: {} }, { model, ip, port: 60128, zone: "main" });
  expect(querySpy).not.toHaveBeenCalled();
});
