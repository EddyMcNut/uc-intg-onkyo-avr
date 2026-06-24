import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const m = (name: string) => {
    const obj: any = {};
    obj.fn = (...args: any[]) => {
      const calls = obj._calls || [];
      calls.push(args);
      obj._calls = calls;
      return obj._returnValue;
    };
    obj.fn._calls = [];
    obj.mockReturnValue = (v: any) => { obj._returnValue = v; };
    obj.mockReset = () => { obj._calls = []; };
    // expose for assertion
    const track = vi.fn();
    obj.__track = track;
    // Make fn delegate to track
    obj.fn = (...args: any[]) => {
      track(...args);
      return obj._returnValue;
    };
    obj.fn.mockReset = () => { track.mockReset(); obj._calls = []; };
    return { obj, track };
  };

  return {
    eventHandlers: handlers,
    mockDriver: {
      init: vi.fn(),
      on: vi.fn((event: string, handler: (...args: any[]) => any) => { handlers[event] = handler; }),
      getConfigDirPath: vi.fn(() => "/fake/config/dir"),
      addAvailableEntity: vi.fn(),
      setDeviceState: vi.fn(),
      updateEntityAttributes: vi.fn(),
    },
    mockAvrStateApi: {
      getAudioFormat: vi.fn(() => "unknown"),
      isEntityOn: vi.fn(() => true),
    },
    mockEntityRegistrar: {
      createMediaPlayerEntity: vi.fn(() => ({ id: "mp_entity" })),
      createSensorEntities: vi.fn(() => [{ id: "sensor_1" }]),
      createListeningModeSelectEntity: vi.fn(() => ({ id: "lm_entity" })),
      createInputSelectorSelectEntity: vi.fn(() => ({ id: "is_entity" })),
      getListeningModeOptions: vi.fn(() => ["option1"]),
      getInputSelectorOptions: vi.fn(() => ["input1"]),
    },
    mockConnectionManager: {
      getPhysicalConnection: vi.fn(() => undefined),
      disconnectAll: vi.fn(),
      clearAllConnections: vi.fn(),
      cancelAllScheduledReconnections: vi.fn(),
    },
    mockConnectCoordinator: {
      connect: vi.fn(),
    },
    mockCommandSender: {
      sharedCmdHandler: vi.fn(),
    },
    mockLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

const { eventHandlers, mockDriver, mockAvrStateApi, mockEntityRegistrar, mockConnectionManager, mockConnectCoordinator, mockCommandSender, mockLog } = h;

vi.mock("@unfoldedcircle/integration-api", () => ({
  IntegrationAPI: function () { return mockDriver; },
  Events: { Connect: "connect", EnterStandby: "enter-standby", ExitStandby: "exit-standby", Disconnect: "disconnect", SubscribeEntities: "subscribe-entities", UnsubscribeEntities: "unsubscribe-entities" },
  DeviceStates: { Connected: "connected", Disconnected: "disconnected" },
  MediaPlayerAttributes: { SourceList: "sourceList" },
  StatusCodes: { Ok: 0, NotFound: 1 },
  SelectAttributes: { Options: "options" },
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => JSON.stringify({ version: "2.0.0" })),
}));

vi.mock("../src/configManager.js", () => {
  const mockBuildId = vi.fn((m: string, ip: string, z: string) => `${m}_${ip}_${z}`);
  const mockBuildPhys = vi.fn((m: string, ip: string) => `${m}_${ip}`);
  return {
    ConfigManager: { load: vi.fn(() => ({ avrs: [], logLevel: "info" })) },
    setConfigDir: vi.fn(),
    buildEntityId: mockBuildId,
    buildPhysicalAvrId: mockBuildPhys,
    DEFAULT_QUEUE_THRESHOLD: 100,
    normalizeAvrConfig: vi.fn((cfg: any) => ({ ...cfg, queueThreshold: cfg.queueThreshold ?? 100, volumeScale: cfg.volumeScale ?? 100, port: cfg.port ?? 60128 })),
  };
});

vi.mock("../src/loggers.js", () => ({ default: mockLog, setLogLevel: vi.fn() }));

// For modules used with `new`, provide a plain function that returns the mock instance
vi.mock("../src/eiscp.js", () => ({ default: function () { return {}; } }));
vi.mock("../src/commandSender.js", () => ({ CommandSender: function () { return mockCommandSender; } }));
vi.mock("../src/commandReceiver.js", () => ({ CommandReceiver: function () { return {}; } }));
vi.mock("../src/reconnectionManager.js", () => ({ ReconnectionManager: function () { return { cancelAllScheduledReconnections: vi.fn() }; } }));
vi.mock("../src/avrState.js", () => ({ AvrStateManager: function () { return mockAvrStateApi; } }));
vi.mock("../src/avrStateQuery.js", () => ({ avrStateQueryService: { queryAvrState: vi.fn(), recordQueries: vi.fn() } }));
vi.mock("../src/mediaBrowser.js", () => ({ initMediaBrowser: vi.fn() }));
vi.mock("../src/setupHandler.js", () => ({ default: function () { return { handle: vi.fn() }; } }));
vi.mock("../src/entityRegistrar.js", () => ({ default: function () { return mockEntityRegistrar; } }));
vi.mock("../src/connectionManager.js", () => ({ default: function () { return mockConnectionManager; } }));
vi.mock("../src/selectEntityHandler.js", () => ({ SelectEntityHandler: function () { return { handle: vi.fn() }; } }));
vi.mock("../src/subscriptionHandler.js", () => ({ default: function () { return { handle: vi.fn() }; } }));
vi.mock("../src/connectCoordinator.js", () => ({ default: function () { return mockConnectCoordinator; } }));
vi.mock("../src/utils.js", () => ({ delay: vi.fn() }));

let OnkyoDriver: any;

beforeEach(() => {
  vi.clearAllMocks();
});

async function createDriver() {
  if (!OnkyoDriver) OnkyoDriver = (await import("../src/driver.js")).default;
  return new OnkyoDriver();
}

describe("OnkyoDriver", () => {
  describe("constructor", () => {
    it("creates instance with no AVRs and calls setup methods", async () => {
      const driver = await createDriver();

      expect(driver.driver).toBe(mockDriver);
      expect(mockDriver.init).toHaveBeenCalledWith("driver.json", expect.any(Function));
      expect(mockDriver.on).toHaveBeenCalled();
      expect(mockDriver.getConfigDirPath).toHaveBeenCalled();
      expect(driver.entityRegistrar).toBeDefined();
    });

    it("loads config with AVRs and calls registerAvailableEntities", async () => {
      const configModule = await import("../src/configManager.js");
      (configModule.ConfigManager.load as any).mockReturnValueOnce({
        avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", createSensors: true, listeningModeOptions: ["mode1"], inputSelectorOptions: ["input1"] }],
        logLevel: "debug",
      });

      const driver = await createDriver();

      expect(driver.config.avrs).toHaveLength(1);
      expect(mockDriver.addAvailableEntity).toHaveBeenCalled();
    });

    it("handles readFileSync failure gracefully", async () => {
      const fs = await import("node:fs");
      (fs.readFileSync as any).mockImplementationOnce(() => { throw new Error("ENOENT"); });

      const driver = await createDriver();

      expect(mockLog.warn).toHaveBeenCalled();
      expect(driver.driverVersion).toBe("unknown");
    });

    it("handles getConfigDirPath failure gracefully", async () => {
      mockDriver.getConfigDirPath.mockImplementationOnce(() => { throw new Error("no dir"); });

      const driver = await createDriver();

      expect(mockLog.warn).toHaveBeenCalled();
    });
  });

  describe("createAvrSpecificConfig", () => {
    it("creates config with normalized values", async () => {
      const driver = await createDriver();
      const avrConfig = { model: "TX-RZ50", ip: "1.2.3.4", zone: "zone2", volumeScale: 80 };
      const result = driver.createAvrSpecificConfig(avrConfig);

      expect(result.avrs).toHaveLength(1);
      expect(result.avrs[0].volumeScale).toBe(80);
      expect(result.volumeScale).toBe(80);
    });
  });

  describe("sharedCmdHandler", () => {
    it("returns NotFound when entity has no AVR instance", async () => {
      const driver = await createDriver();

      const result = await driver.sharedCmdHandler({ id: "unknown_entity" }, "someCommand");

      expect(result).toBe(1);
      expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("No AVR instance found"), expect.any(String), "unknown_entity");
    });

    it("delegates to commandSender when instance exists", async () => {
      const driver = await createDriver();
      const entity = { id: "test_avr" };
      const cmdId = "play";
      const params = { key: "value" };

      const cmdReceiver = { commandSender: { sharedCmdHandler: vi.fn(() => 0) } };
      driver.avrInstances.set("test_avr", cmdReceiver);

      const result = await driver.sharedCmdHandler(entity, cmdId, params);

      expect(result).toBe(0);
      expect(cmdReceiver.commandSender.sharedCmdHandler).toHaveBeenCalledWith(entity, cmdId, params);
    });
  });

  describe("setupDriverEvents", () => {
    it("Connect event calls handleConnect", async () => {
      await createDriver();

      await eventHandlers["connect"]();

      expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("CONNECT EVENT RECEIVED"));
      expect(mockConnectCoordinator.connect).toHaveBeenCalled();
    });

    it("EnterStandby event disconnects AVRs and sets disconnected", async () => {
      await createDriver();

      await eventHandlers["enter-standby"]();

      expect(mockConnectionManager.cancelAllScheduledReconnections).toHaveBeenCalled();
      expect(mockConnectionManager.disconnectAll).toHaveBeenCalled();
      expect(mockDriver.setDeviceState).toHaveBeenCalledWith("disconnected");
    });

    it("ExitStandby event calls handleConnect", async () => {
      await createDriver();

      await eventHandlers["exit-standby"]();

      expect(mockConnectCoordinator.connect).toHaveBeenCalled();
    });
  });

  describe("setupEventHandlers", () => {
    it("Disconnect event cleans up reconnection timers", async () => {
      await createDriver();

      await eventHandlers["disconnect"]();

      expect(mockDriver.setDeviceState).toHaveBeenCalledWith("disconnected");
    });

    it("SubscribeEntities updates source list for known entities", async () => {
      const driver = await createDriver();
      const entityId = "known_avr";
      const cmdReceiver = { commandSender: { sharedCmdHandler: vi.fn() } };
      driver.avrInstances.set(entityId, cmdReceiver);

      await eventHandlers["subscribe-entities"]([entityId, "unknown_entity"]);

      expect(mockDriver.updateEntityAttributes).toHaveBeenCalledWith(entityId, { sourceList: ["input1"] });
    });

    it("UnsubscribeEntities logs entity IDs", async () => {
      await createDriver();

      await eventHandlers["unsubscribe-entities"](["entity1", "entity2"]);

      expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("Unsubscribed entity"), expect.any(String), "entity1");
    });
  });

  describe("queryAvrState", () => {
    it("returns early when eiscp is not connected", async () => {
      const driver = await createDriver();
      const eiscp: any = { connected: false };

      await driver.queryAvrState("avr_entry", eiscp, "test");

      expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("Cannot query AVR state"));
    });

    it("calls queryAvrState when connected", async () => {
      const driver = await createDriver();
      const eiscp: any = { connected: true };
      const avrEntry = "avr_entry";
      driver.avrInstances.set(avrEntry, { config: { zone: "zone2", queueThreshold: 200 } });

      await driver.queryAvrState(avrEntry, eiscp, "test");

      const avrStateQuery = await import("../src/avrStateQuery.js");
      expect(avrStateQuery.avrStateQueryService.queryAvrState).toHaveBeenCalledWith(avrEntry, eiscp, "zone2", "test", 200);
    });

    it("uses defaults when instance config lacks values", async () => {
      const driver = await createDriver();
      const eiscp: any = { connected: true };
      const avrEntry = "avr_entry";
      driver.avrInstances.set(avrEntry, { config: {} });

      await driver.queryAvrState(avrEntry, eiscp, "test");

      const avrStateQuery = await import("../src/avrStateQuery.js");
      expect(avrStateQuery.avrStateQueryService.queryAvrState).toHaveBeenCalledWith(avrEntry, eiscp, "main", "test", 100);
    });
  });

  describe("queryAllZonesState", () => {
    it("iterates matching zones and records queries", async () => {
      const driver = await createDriver();
      const eiscp: any = { connected: true };
      const physicalAVR = "TX-RZ50_1.2.3.4";

      driver.avrInstances.set("z1", { config: { model: "TX-RZ50", ip: "1.2.3.4", zone: "main", queueThreshold: 50 } });
      driver.avrInstances.set("z2", { config: { model: "TX-RZ50", ip: "1.2.3.4", zone: "zone2", queueThreshold: 50 } });

      const querySpy = vi.spyOn(driver, "queryAvrState").mockResolvedValue(undefined);

      await driver.queryAllZonesState(physicalAVR, eiscp, "after connection");

      expect(querySpy).toHaveBeenCalledTimes(2);
      expect(querySpy).toHaveBeenCalledWith("z1", eiscp, "after connection");
      expect(querySpy).toHaveBeenCalledWith("z2", eiscp, "after connection");

      const avrStateQuery = await import("../src/avrStateQuery.js");
      expect(avrStateQuery.avrStateQueryService.recordQueries).toHaveBeenCalledWith(["z1", "z2"]);
    });

    it("skips zones in standby for non-initial queries", async () => {
      const driver = await createDriver();
      const eiscp: any = { connected: true };
      const physicalAVR = "TX-RZ50_1.2.3.4";

      driver.avrInstances.set("z1", { config: { model: "TX-RZ50", ip: "1.2.3.4", zone: "main" } });
      driver.avrInstances.set("z2", { config: { model: "TX-RZ50", ip: "1.2.3.4", zone: "zone2" } });

      mockAvrStateApi.isEntityOn.mockReturnValue(false);

      const querySpy = vi.spyOn(driver, "queryAvrState").mockResolvedValue(undefined);

      await driver.queryAllZonesState(physicalAVR, eiscp, "subscription update");

      expect(querySpy).not.toHaveBeenCalled();
    });

    it("handles empty avrInstances map", async () => {
      const driver = await createDriver();
      const eiscp: any = { connected: true };
      const physicalAVR = "NONEXISTENT_1.2.3.4";

      const querySpy = vi.spyOn(driver, "queryAvrState").mockResolvedValue(undefined);

      await driver.queryAllZonesState(physicalAVR, eiscp, "after connection");

      expect(querySpy).not.toHaveBeenCalled();
    });
  });

  describe("registerAvailableEntities with AVRs in config", () => {
    it("registers all enabled entity types", async () => {
      const configModule = await import("../src/configManager.js");
      (configModule.ConfigManager.load as any).mockReturnValueOnce({
        avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", createSensors: true, listeningModeOptions: ["mode1"], inputSelectorOptions: ["input1"] }],
        logLevel: "info",
      });

      const driver = await createDriver();

      expect(mockDriver.addAvailableEntity).toHaveBeenCalled();
      expect(mockEntityRegistrar.createMediaPlayerEntity).toHaveBeenCalled();
      expect(mockEntityRegistrar.createSensorEntities).toHaveBeenCalled();
    });

    it("skips disabled entity types", async () => {
      const configModule = await import("../src/configManager.js");
      (configModule.ConfigManager.load as any).mockReturnValueOnce({
        avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", createSensors: false, listeningModeOptions: null, inputSelectorOptions: null }],
        logLevel: "info",
      });

      mockEntityRegistrar.createMediaPlayerEntity.mockReturnValueOnce({ id: "mp" });

      const driver = await createDriver();

      expect(mockEntityRegistrar.createSensorEntities).not.toHaveBeenCalled();
      expect(mockEntityRegistrar.createListeningModeSelectEntity).not.toHaveBeenCalled();
      expect(mockEntityRegistrar.createInputSelectorSelectEntity).not.toHaveBeenCalled();
    });
  });

  describe("init", () => {
    it("logs initialization message", async () => {
      const driver = await createDriver();

      await driver.init();

      expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("Initializing"), expect.any(String));
    });
  });
});
