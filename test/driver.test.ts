import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
    obj.mockReturnValue = (v: any) => {
      obj._returnValue = v;
    };
    obj.mockReset = () => {
      obj._calls = [];
    };
    // expose for assertion
    const track = vi.fn();
    obj.__track = track;
    // Make fn delegate to track
    obj.fn = (...args: any[]) => {
      track(...args);
      return obj._returnValue;
    };
    obj.fn.mockReset = () => {
      track.mockReset();
      obj._calls = [];
    };
    return { obj, track };
  };

  return {
    eventHandlers: handlers,
    availableEntityIds: new Set<string>(),
    mockDriver: {
      init: vi.fn(),
      on: vi.fn((event: string, handler: (...args: any[]) => any) => {
        handlers[event] = handler;
      }),
      getConfigDirPath: vi.fn(() => "/fake/config/dir"),
      addAvailableEntity: vi.fn(),
      getAvailableEntities: vi.fn(() => ({
        contains: vi.fn((id: string) => h.availableEntityIds.has(id)),
        removeEntity: vi.fn((id: string) => h.availableEntityIds.delete(id))
      })),
      setDeviceState: vi.fn(),
      updateEntityAttributes: vi.fn()
    },
    mockAvrStateApi: {
      getAudioFormat: vi.fn(() => "unknown"),
      isEntityOn: vi.fn(() => true)
    },
    mockEntityRegistrar: {
      createMediaPlayerEntity: vi.fn((..._args: unknown[]) => ({ id: "mp_entity" })),
      createSensorEntities: vi.fn(() => [{ id: "sensor_1" }]),
      createListeningModeSelectEntity: vi.fn(() => ({ id: "lm_entity" })),
      createInputSelectorSelectEntity: vi.fn(() => ({ id: "is_entity" })),
      createTunerPresetsSelectEntity: vi.fn(() => ({ id: "tuner_presets_entity" })),
      createDiracSelectEntity: vi.fn(() => ({ id: "dirac_entity" })),
      createRemoteEntity: vi.fn(() => ({ id: "remote_entity" })),
      getListeningModeOptions: vi.fn(() => ["option1"]),
      getInputSelectorOptions: vi.fn(() => ["input1"]),
      getTunerPresetOptions: vi.fn(() => ["R10 80s", "NPO FunX", "STRKSTAD"])
    },
    mockConnectionManager: {
      getPhysicalConnection: vi.fn((_physicalAVR?: string): unknown => undefined),
      disconnectAll: vi.fn(),
      clearAllConnections: vi.fn(),
      cancelAllScheduledReconnections: vi.fn(),
      reconcilePhysicalConnections: vi.fn()
    },
    mockConnectCoordinator: {
      connect: vi.fn(),
      reconcile: vi.fn((..._args: unknown[]): string[] => [])
    },
    mockCommandSender: {
      sharedCmdHandler: vi.fn()
    },
    mockResolveAutoVolumeScale: vi.fn(),
    mockResolveInputSourceList: vi.fn(),
    mockSetAvrInputs: vi.fn((_inputs?: unknown) => true),
    mockClearAvrInputs: vi.fn(() => undefined),
    mockHasAvrInputs: vi.fn(() => false),
    mockSetupHost: { current: undefined as any },
    // The store the driver constructs (the mocked ConfigStore constructor returns it).
    mockConfigStore: {
      path: "/tmp/config.json",
      load: vi.fn((): any => ({ avrs: [], logLevel: "info" })),
      patchAvr: vi.fn((..._args: unknown[]) => true),
      clear: vi.fn(),
      get: vi.fn((): any => ({})),
      save: vi.fn(),
      addAvr: vi.fn()
    },
    mockLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    mockSetZoneEntitiesAvailability: vi.fn(),
    // Constructor arguments of the mocked classes, so tests can call the callbacks the driver hands out.
    ctorArgs: { connectionManager: [] as any[][], selectHandler: [] as any[][], commandReceiver: [] as any[][], commandSender: [] as any[][] }
  };
});

const {
  eventHandlers,
  mockDriver,
  mockAvrStateApi,
  mockEntityRegistrar,
  mockConnectionManager,
  mockConnectCoordinator,
  mockCommandSender,
  mockLog,
  mockResolveAutoVolumeScale,
  mockSetupHost,
  mockResolveInputSourceList,
  mockSetAvrInputs,
  mockClearAvrInputs,
  mockHasAvrInputs,
  mockConfigStore,
  mockSetZoneEntitiesAvailability,
  ctorArgs
} = h;

vi.mock("@unfoldedcircle/integration-api", () => ({
  IntegrationAPI: function () {
    return mockDriver;
  },
  Events: {
    Connect: "connect",
    EnterStandby: "enter-standby",
    ExitStandby: "exit-standby",
    Disconnect: "disconnect",
    SubscribeEntities: "subscribe-entities",
    UnsubscribeEntities: "unsubscribe-entities"
  },
  DeviceStates: { Connected: "connected", Disconnected: "disconnected" },
  MediaPlayerAttributes: { SourceList: "sourceList" },
  StatusCodes: { Ok: 0, NotFound: 1 },
  SelectAttributes: { Options: "options" }
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => JSON.stringify({ version: "2.0.0" }))
}));

vi.mock("../src/configManager.js", () => {
  const mockBuildId = vi.fn((m: string, ip: string, z: string) => `${m}_${ip}_${z}`);
  const mockBuildPhys = vi.fn((m: string, ip: string) => `${m}_${ip}`);
  return {
    ConfigStore: vi.fn(function () {
      return h.mockConfigStore;
    }),
    configPathFor: vi.fn(() => "/tmp/config.json"),
    EMPTY_CONFIG_SOURCE: { get: () => ({}) },
    buildEntityId: mockBuildId,
    buildPhysicalAvrId: mockBuildPhys,
    physicalAvrIdFromEntityId: vi.fn((id: string) => id.split("_").slice(0, 2).join("_")),
    DEFAULT_QUEUE_THRESHOLD: 100,
    normalizeAvrConfig: vi.fn((cfg: any) => ({ ...cfg, queueThreshold: cfg.queueThreshold ?? 100, volumeScale: cfg.volumeScale ?? 100, port: cfg.port ?? 60128 })),
    resolveVolumeScale: vi.fn((scale: any) => (typeof scale === "number" ? scale : 100))
  };
});

vi.mock("../src/loggers.js", () => ({ default: mockLog, setLogLevel: vi.fn() }));

vi.mock("../src/volumeScaleResolver.js", () => ({ resolveAutoVolumeScale: mockResolveAutoVolumeScale }));

vi.mock("../src/inputSourceResolver.js", () => ({ resolveInputSourceList: mockResolveInputSourceList }));

// The per-AVR input store (AvrContext.inputs), with set/has/clear routed to the mocks so the tests can control and check them.
vi.mock("../src/inputSourceStore.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/inputSourceStore.js")>();
  class InputSourceStore extends actual.InputSourceStore {
    override set(inputs: Parameters<typeof actual.InputSourceStore.prototype.set>[0]): boolean {
      return mockSetAvrInputs(inputs);
    }
    override has(): boolean {
      return mockHasAvrInputs();
    }
    override clear(): void {
      mockClearAvrInputs();
    }
  }
  return { ...actual, InputSourceStore };
});

// For modules used with `new`, provide a plain function that returns the mock instance
vi.mock("../src/eiscp.js", () => ({
  default: function () {
    return {};
  }
}));
vi.mock("../src/commandSender.js", () => ({
  CommandSender: function (...args: any[]) {
    h.ctorArgs.commandSender.push(args);
    return mockCommandSender;
  }
}));
vi.mock("../src/commandReceiver.js", () => ({
  CommandReceiver: function (...args: any[]) {
    h.ctorArgs.commandReceiver.push(args);
    return {};
  }
}));
vi.mock("../src/reconnectionManager.js", () => ({
  ReconnectionManager: function () {
    return { cancelAllScheduledReconnections: vi.fn() };
  }
}));
vi.mock("../src/avrState.js", () => ({
  AvrStateManager: function () {
    return mockAvrStateApi;
  }
}));
// The driver creates its own AvrStateQueryService; every instance is this one shared mock.
vi.mock("../src/avrStateQuery.js", () => {
  const avrStateQueryService = { queryAvrState: vi.fn(), recordQueries: vi.fn(), shouldQuery: vi.fn(() => true), recordQuery: vi.fn() };
  return {
    avrStateQueryService,
    AvrStateQueryService: function () {
      return avrStateQueryService;
    }
  };
});
// The driver creates its own MediaBrowser; a stub is enough here (browsing has its own tests).
vi.mock("../src/mediaBrowser.js", () => ({
  MediaBrowser: function (this: Record<string, unknown>, _avrStateApi: unknown, services: unknown) {
    this.services = services;
    this.browseMedia = vi.fn();
    this.isMediaBrowsingAvailable = vi.fn(() => false);
  }
}));
vi.mock("../src/setupHandler.js", () => ({
  default: function (host: any) {
    mockSetupHost.current = host;
    return { handle: vi.fn() };
  }
}));
vi.mock("../src/entityRegistrar.js", () => ({
  default: function () {
    return mockEntityRegistrar;
  }
}));
vi.mock("../src/connectionManager.js", () => ({
  default: function (...args: any[]) {
    h.ctorArgs.connectionManager.push(args);
    return mockConnectionManager;
  }
}));
vi.mock("../src/selectEntityHandler.js", () => ({
  SelectEntityHandler: function (...args: any[]) {
    h.ctorArgs.selectHandler.push(args);
    return { handle: vi.fn() };
  }
}));
vi.mock("../src/remoteEntityCommandHandler.js", () => ({
  remoteEntityCommandHandler: function () {
    return { handle: vi.fn() };
  }
}));
vi.mock("../src/subscriptionHandler.js", () => ({
  default: function () {
    return { handle: vi.fn() };
  }
}));
vi.mock("../src/connectCoordinator.js", () => ({
  default: function () {
    return mockConnectCoordinator;
  }
}));
vi.mock("../src/utils.js", () => ({ delay: vi.fn() }));
vi.mock("../src/entityAvailability.js", () => ({ setZoneEntitiesAvailability: h.mockSetZoneEntitiesAvailability }));

let OnkyoDriver: any;

beforeEach(() => {
  vi.clearAllMocks();
  h.availableEntityIds.clear();
  for (const list of Object.values(h.ctorArgs)) list.length = 0;
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
      mockConfigStore.load.mockReturnValueOnce({
        avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", createSensors: true, listeningModeOptions: ["mode1"], inputSelectorOptions: ["input1"] }],
        logLevel: "debug"
      });

      const driver = await createDriver();

      expect(driver.config.avrs).toHaveLength(1);
      expect(mockDriver.addAvailableEntity).toHaveBeenCalled();
    });

    it("handles readFileSync failure gracefully", async () => {
      const fs = await import("node:fs");
      (fs.readFileSync as any).mockImplementationOnce(() => {
        throw new Error("ENOENT");
      });

      const driver = await createDriver();

      expect(mockLog.warn).toHaveBeenCalled();
      expect(driver.driverVersion).toBe("unknown");
    });

    it("handles getConfigDirPath failure gracefully", async () => {
      mockDriver.getConfigDirPath.mockImplementationOnce(() => {
        throw new Error("no dir");
      });

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
      expect((avrStateQuery as unknown as { avrStateQueryService: Record<string, ReturnType<typeof vi.fn>> }).avrStateQueryService.queryAvrState).toHaveBeenCalledWith(
        avrEntry,
        eiscp,
        "zone2",
        "test",
        200
      );
    });

    it("uses defaults when instance config lacks values", async () => {
      const driver = await createDriver();
      const eiscp: any = { connected: true };
      const avrEntry = "avr_entry";
      driver.avrInstances.set(avrEntry, { config: {} });

      await driver.queryAvrState(avrEntry, eiscp, "test");

      const avrStateQuery = await import("../src/avrStateQuery.js");
      expect((avrStateQuery as unknown as { avrStateQueryService: Record<string, ReturnType<typeof vi.fn>> }).avrStateQueryService.queryAvrState).toHaveBeenCalledWith(
        avrEntry,
        eiscp,
        "main",
        "test",
        100
      );
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
      expect((avrStateQuery as unknown as { avrStateQueryService: Record<string, ReturnType<typeof vi.fn>> }).avrStateQueryService.recordQueries).toHaveBeenCalledWith(["z1", "z2"]);
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
      mockConfigStore.load.mockReturnValueOnce({
        avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", createSensors: true, listeningModeOptions: ["mode1"], inputSelectorOptions: ["input1"] }],
        logLevel: "info"
      });

      const driver = await createDriver();

      expect(mockDriver.addAvailableEntity).toHaveBeenCalled();
      expect(mockEntityRegistrar.createMediaPlayerEntity).toHaveBeenCalled();
      expect(mockEntityRegistrar.createSensorEntities).toHaveBeenCalled();
    });

    it("skips disabled entity types", async () => {
      mockConfigStore.load.mockReturnValueOnce({
        avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", createSensors: false, listeningModeOptions: null, inputSelectorOptions: null }],
        logLevel: "info"
      });

      mockEntityRegistrar.createMediaPlayerEntity.mockReturnValueOnce({ id: "mp" });

      const driver = await createDriver();

      expect(mockEntityRegistrar.createSensorEntities).not.toHaveBeenCalled();
      expect(mockEntityRegistrar.createListeningModeSelectEntity).toHaveBeenCalled();
      expect(mockEntityRegistrar.createInputSelectorSelectEntity).toHaveBeenCalled();
    });

    it("registers remote entity when createRemoteEntity is true", async () => {
      mockConfigStore.load.mockReturnValueOnce({
        avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", createRemoteEntity: true }],
        logLevel: "info"
      });

      const driver = await createDriver();

      expect(mockEntityRegistrar.createRemoteEntity).toHaveBeenCalled();
      expect(mockDriver.addAvailableEntity).toHaveBeenCalledWith({ id: "remote_entity" });
    });

    it("skips remote entity when createRemoteEntity is false or absent", async () => {
      mockConfigStore.load.mockReturnValueOnce({
        avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", createRemoteEntity: false }],
        logLevel: "info"
      });

      const driver = await createDriver();

      expect(mockEntityRegistrar.createRemoteEntity).not.toHaveBeenCalled();
    });

    it("replaces an already registered entity so updated definitions take effect", async () => {
      mockConfigStore.load.mockReturnValueOnce({
        avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", createRemoteEntity: true }],
        logLevel: "info"
      });

      const pool = { contains: vi.fn(() => true), removeEntity: vi.fn() };
      mockDriver.getAvailableEntities.mockReturnValue(pool);

      const driver = await createDriver();

      expect(pool.removeEntity).toHaveBeenCalledWith("remote_entity");
      expect(mockDriver.addAvailableEntity).toHaveBeenCalledWith({ id: "remote_entity" });
    });
  });

  describe("handleAvrInfo with an auto volume scale", () => {
    const autoConfig = {
      avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", volumeScale: "auto", createSensors: false, listeningModeOptions: null, inputSelectorOptions: null }],
      logLevel: "info"
    };

    async function createDriverWithAutoScale() {
      mockConfigStore.load.mockReturnValue(autoConfig);
      return createDriver();
    }

    it("stores the resolved scale, re-registers the media player and refreshes the runtime config", async () => {
      const { resolveAutoVolumeScale } = await import("../src/volumeScaleResolver.js");
      (resolveAutoVolumeScale as any).mockReturnValue({ scale: 80, reason: "AVR reports a maximum display volume of 80" });

      const driver = await createDriverWithAutoScale();
      mockConfigStore.patchAvr.mockReturnValue(true);
      mockConfigStore.load.mockReturnValue({
        ...autoConfig,
        avrs: [{ ...autoConfig.avrs[0], volumeScale: 80 }]
      });
      const commandSender = { sharedCmdHandler: vi.fn(), updateConfig: vi.fn() };
      driver.avrInstances.set("TX-RZ50_1.2.3.4_main", { config: autoConfig.avrs[0], commandSender });
      const commandReceiver = { updateConfig: vi.fn() };
      mockConnectionManager.getPhysicalConnection.mockReturnValue({ eiscp: {}, commandReceiver });
      mockEntityRegistrar.createMediaPlayerEntity.mockClear();

      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      expect(mockConfigStore.patchAvr).toHaveBeenCalledWith("1.2.3.4", "main", { volumeScale: 80 });
      expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining("Volume scale 'auto' resolved"), "driver:", "TX-RZ50_1.2.3.4_main", 80, "AVR reports a maximum display volume of 80");
      // The media player is rebuilt with the resolved scale, the other entities are not touched.
      expect(mockEntityRegistrar.createMediaPlayerEntity).toHaveBeenCalledTimes(1);
      expect(mockEntityRegistrar.createMediaPlayerEntity.mock.calls[0][1]).toBe(80);
      expect(mockEntityRegistrar.createSensorEntities).not.toHaveBeenCalled();
      // Volume is scaled correctly from the next update on.
      expect(commandSender.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ volumeScale: 80 }));
      expect(commandReceiver.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ volumeScale: 80 }));
    });

    it("resolves every zone of the AVR, since NRI is answered on the main zone", async () => {
      const multiZoneConfig = {
        avrs: [
          { model: "TX-RZ50", ip: "1.2.3.4", zone: "main", volumeScale: "auto", createSensors: false },
          { model: "TX-RZ50", ip: "1.2.3.4", zone: "zone2", volumeScale: "auto", createSensors: false },
          { model: "TX-RZ50", ip: "1.2.3.4", zone: "zone3", volumeScale: 100, createSensors: false }
        ],
        logLevel: "info"
      };
      const { resolveAutoVolumeScale } = await import("../src/volumeScaleResolver.js");
      // Each zone reads the volume scale the AVR reported for that zone.
      (resolveAutoVolumeScale as any).mockImplementation((avrConfig: any) =>
        avrConfig.zone === "zone2"
          ? { scale: 80, reason: "AVR reports a maximum display volume of 80" }
          : avrConfig.volumeScale === "auto"
            ? { scale: 100, reason: "AVR does not report a maximum display volume" }
            : undefined
      );

      mockConfigStore.load.mockReturnValue(multiZoneConfig);
      const driver = await createDriver();
      mockConfigStore.patchAvr.mockReturnValue(true);
      mockConfigStore.load.mockReturnValue({
        ...multiZoneConfig,
        avrs: multiZoneConfig.avrs.map((avr) => (avr.zone === "zone2" ? { ...avr, volumeScale: 80 } : avr.zone === "main" ? { ...avr, volumeScale: 100 } : avr))
      });
      mockEntityRegistrar.createMediaPlayerEntity.mockClear();

      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      expect(mockConfigStore.patchAvr).toHaveBeenCalledWith("1.2.3.4", "main", { volumeScale: 100 });
      expect(mockConfigStore.patchAvr).toHaveBeenCalledWith("1.2.3.4", "zone2", { volumeScale: 80 });
      // The manual zone3 scale is left untouched, so only the two resolved zones are re-registered.
      expect(mockConfigStore.patchAvr).not.toHaveBeenCalledWith("1.2.3.4", "zone3", expect.anything());
      expect(mockEntityRegistrar.createMediaPlayerEntity).toHaveBeenCalledTimes(2);
      expect(mockEntityRegistrar.createMediaPlayerEntity.mock.calls.map((call) => call[1])).toEqual([100, 80]);
    });

    it("leaves a manual scale alone", async () => {
      const { resolveAutoVolumeScale } = await import("../src/volumeScaleResolver.js");
      (resolveAutoVolumeScale as any).mockReturnValue(undefined);

      const driver = await createDriverWithAutoScale();
      mockEntityRegistrar.createMediaPlayerEntity.mockClear();

      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      expect(mockConfigStore.patchAvr).not.toHaveBeenCalled();
      expect(mockEntityRegistrar.createMediaPlayerEntity).not.toHaveBeenCalled();
    });

    it("warns and keeps the current entities when the config cannot be patched", async () => {
      const { resolveAutoVolumeScale } = await import("../src/volumeScaleResolver.js");
      (resolveAutoVolumeScale as any).mockReturnValue({ scale: 100, reason: "AVR does not report a maximum display volume" });

      const driver = await createDriverWithAutoScale();
      mockConfigStore.patchAvr.mockReturnValue(false);
      mockEntityRegistrar.createMediaPlayerEntity.mockClear();

      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("Could not store the resolved volume scale"), "driver:", "TX-RZ50_1.2.3.4_main", 100);
      expect(mockEntityRegistrar.createMediaPlayerEntity).not.toHaveBeenCalled();
    });

    it("ignores AVR info for an entity that is not configured", async () => {
      const driver = await createDriverWithAutoScale();

      driver.handleAvrInfo("TX-NR860 5.6.7.8_main");

      expect(mockConfigStore.patchAvr).not.toHaveBeenCalled();
    });
  });

  describe("handleAvrInfo with an auto input source list", () => {
    const autoConfig = {
      avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", volumeScale: 100, useAvrReportedInputs: true, createSensors: false }],
      logLevel: "info"
    };
    const collectedInputs = [
      { id: "10", name: "BD/DVD" },
      { id: "01", name: "CBL/SAT" }
    ];

    async function createDriverWithAutoInputList(saved = autoConfig) {
      mockConfigStore.load.mockReturnValue(saved);
      return createDriver();
    }

    // The volume scale is resolved independently, so it must not leak in from the tests above.
    beforeEach(() => {
      mockResolveAutoVolumeScale.mockReturnValue(undefined);
    });

    it("stores the collected inputs and re-registers the input selector", async () => {
      mockResolveInputSourceList.mockReturnValue({ inputs: collectedInputs, reason: "AVR reports 2 input(s)" });
      mockSetAvrInputs.mockReturnValue(true);
      const driver = await createDriverWithAutoInputList();
      mockEntityRegistrar.createMediaPlayerEntity.mockClear();
      mockEntityRegistrar.createInputSelectorSelectEntity.mockClear();

      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      // The setting itself stays "auto": the collected inputs are kept in memory only.
      expect(mockSetAvrInputs).toHaveBeenCalledWith(collectedInputs);
      expect(mockConfigStore.patchAvr).not.toHaveBeenCalled();
      expect(mockEntityRegistrar.createInputSelectorSelectEntity).toHaveBeenCalledTimes(1);
      expect(mockEntityRegistrar.createMediaPlayerEntity).toHaveBeenCalledTimes(1);
      expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining("Input source list 'auto' resolved"), "driver:", "TX-RZ50_1.2.3.4_main", "AVR reports 2 input(s)");
    });

    it("re-registers the input selector of every zone of the AVR", async () => {
      mockResolveInputSourceList.mockReturnValue({ inputs: collectedInputs, reason: "AVR reports 2 input(s)" });
      // The list is stored once per AVR, so only the first zone reports a change.
      mockSetAvrInputs.mockReturnValue(true);
      const driver = await createDriverWithAutoInputList({
        ...autoConfig,
        avrs: [autoConfig.avrs[0], { ...autoConfig.avrs[0], zone: "zone2" }]
      });
      mockEntityRegistrar.createMediaPlayerEntity.mockClear();
      mockEntityRegistrar.createInputSelectorSelectEntity.mockClear();

      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      expect(mockSetAvrInputs).toHaveBeenCalledTimes(1);
      expect(mockEntityRegistrar.createInputSelectorSelectEntity).toHaveBeenCalledTimes(2);
      expect(mockEntityRegistrar.createMediaPlayerEntity).toHaveBeenCalledTimes(2);
      // The inputs are device-wide, so the resolution is logged once.
      expect(mockLog.debug).toHaveBeenCalledTimes(1);
    });

    it("does not re-register the entities when the collected inputs did not change", async () => {
      mockResolveInputSourceList.mockReturnValue({ inputs: collectedInputs, reason: "AVR reports 2 input(s)" });
      mockSetAvrInputs.mockReturnValue(false);
      const driver = await createDriverWithAutoInputList();
      mockEntityRegistrar.createMediaPlayerEntity.mockClear();
      mockEntityRegistrar.createInputSelectorSelectEntity.mockClear();

      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      expect(mockSetAvrInputs).toHaveBeenCalled();
      expect(mockEntityRegistrar.createInputSelectorSelectEntity).not.toHaveBeenCalled();
      expect(mockEntityRegistrar.createMediaPlayerEntity).not.toHaveBeenCalled();
    });

    it("stores 'manual' and forgets the inputs when the AVR reports none", async () => {
      mockResolveInputSourceList.mockReturnValue({ reason: "AVR reports no input sources, so integration mappings are used" });
      mockHasAvrInputs.mockReturnValue(true);
      const driver = await createDriverWithAutoInputList();
      mockConfigStore.patchAvr.mockReturnValue(true);
      mockEntityRegistrar.createInputSelectorSelectEntity.mockClear();

      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      expect(mockConfigStore.patchAvr).toHaveBeenCalledWith("1.2.3.4", "main", { useAvrReportedInputs: false });
      expect(mockClearAvrInputs).toHaveBeenCalledTimes(1);
      expect(mockLog.debug).toHaveBeenCalledWith("%s [%s] AVR-reported input names disabled: %s", "driver:", "TX-RZ50_1.2.3.4_main", "AVR reports no input sources, so integration mappings are used");
      expect(mockEntityRegistrar.createInputSelectorSelectEntity).toHaveBeenCalledTimes(1);
    });

    it("leaves a manual input source list alone", async () => {
      mockResolveInputSourceList.mockReturnValue(undefined);
      const driver = await createDriverWithAutoInputList({ ...autoConfig, avrs: [{ ...autoConfig.avrs[0], useAvrReportedInputs: false }] });
      mockEntityRegistrar.createInputSelectorSelectEntity.mockClear();

      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      expect(mockConfigStore.patchAvr).not.toHaveBeenCalled();
      expect(mockClearAvrInputs).not.toHaveBeenCalled();
      expect(mockEntityRegistrar.createInputSelectorSelectEntity).not.toHaveBeenCalled();
    });
  });

  describe("handleAvrInfo with tuner presets", () => {
    const presetsConfig = {
      avrs: [
        { model: "TX-RZ50", ip: "1.2.3.4", zone: "main", volumeScale: 100, createSensors: false },
        { model: "TX-RZ50", ip: "1.2.3.4", zone: "zone2", volumeScale: 100, createSensors: false }
      ],
      logLevel: "info"
    };

    // A NRI payload with two DAB stations and one FM station, like the AVR reports them.
    const presetPayload = [
      `<?xml version="1.0" encoding="UTF-8" ?><response><device><model>TX-RZ50</model>`,
      `<zonelist count="2"><zone id="1" value="1" name="Main" volmax="100" /><zone id="2" value="2" name="Zone2" volmax="100" /></zonelist>`,
      `<presetlist count="4">`,
      `<preset id="01" band="2" freq="0" name="R10 80s   " />`,
      `<preset id="0c" band="2" freq="0" name="NPO FunX  " />`,
      `<preset id="0d" band="0" freq="0" name="" />`,
      `<preset id="1c" band="1" freq="107.20" name="STRKSTAD " /></presetlist>`,
      `</device></response>`
    ].join("");

    async function createDriverWithPresets(saved = presetsConfig) {
      mockConfigStore.load.mockReturnValue(saved);
      const { parseAvrInfo } = await import("../src/avrInfoStore.js");
      const driver = await createDriver();
      // The driver owns its registry; seed the AVR info there, as an NRI reply would.
      (driver as any).avrContexts.forEntity("TX-RZ50_1.2.3.4_main").avrInfo.set(parseAvrInfo(presetPayload));
      return driver;
    }

    beforeEach(() => {
      mockResolveAutoVolumeScale.mockReturnValue(undefined);
      mockResolveInputSourceList.mockReturnValue(undefined);
      mockEntityRegistrar.getTunerPresetOptions.mockReturnValue(["R10 80s", "NPO FunX", "STRKSTAD"]);
      mockDriver.updateEntityAttributes.mockClear();
    });

    it("collects the stations the AVR reported and updates the select of every zone", async () => {
      const driver = await createDriverWithPresets();

      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      // Only the named slots are offered, in slot order, on every zone of the AVR.
      for (const zone of ["main", "zone2"]) {
        expect(mockDriver.updateEntityAttributes).toHaveBeenCalledWith(`TX-RZ50_1.2.3.4_${zone}_tuner_presets`, {
          options: ["R10 80s", "NPO FunX", "STRKSTAD"]
        });
      }
      expect(mockLog.debug).toHaveBeenCalledWith("%s [%s] Tuner presets collected from the AVR: %d station(s): %s", "driver:", "TX-RZ50_1.2.3.4_main", 3, "NPO FunX, R10 80s, STRKSTAD");
      expect(mockLog.debug).toHaveBeenCalledWith("%s [%s] Updating Tuner Presets select with %d station(s)", "driver:", "TX-RZ50_1.2.3.4_main", 3);
    });

    it("refreshes the select when NRI repeats, even when stations did not change", async () => {
      const driver = await createDriverWithPresets();
      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");
      mockDriver.updateEntityAttributes.mockClear();
      mockEntityRegistrar.getTunerPresetOptions.mockReturnValue([]);

      // The AVR repeats its whole state on every NRI reply, so this arrives regularly.
      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      expect(mockDriver.updateEntityAttributes).toHaveBeenCalledWith("TX-RZ50_1.2.3.4_main_tuner_presets", {
        options: []
      });
    });

    it("clears the stations when the AVR reports none", async () => {
      const avrInfoStore = { ...(await import("../src/avrInfoStore.js")), ...(await import("./helpers/avrInfo.js")) } as any;
      const driver = await createDriverWithPresets();
      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      // A payload without a preset list must not leave the old stations standing.
      avrInfoStore.setAvrInfo(
        "TX-RZ50_1.2.3.4_main",
        avrInfoStore.parseAvrInfo(
          `<?xml version="1.0" encoding="UTF-8" ?><response><device><model>TX-RZ50</model><zonelist count="1"><zone id="1" value="1" name="Main" /></zonelist></device></response>`
        )
      );
      mockDriver.updateEntityAttributes.mockClear();
      mockEntityRegistrar.getTunerPresetOptions.mockReturnValue([]);

      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      expect(mockDriver.updateEntityAttributes).toHaveBeenCalledWith("TX-RZ50_1.2.3.4_main_tuner_presets", { options: [] });
    });

    it("does not collect anything when the user turned the entity off", async () => {
      const driver = await createDriverWithPresets({
        ...presetsConfig,
        avrs: presetsConfig.avrs.map((avr) => ({ ...avr, createTunerPresets: false }))
      });

      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      expect(mockDriver.updateEntityAttributes).not.toHaveBeenCalledWith(expect.stringContaining("_tuner_presets"), expect.anything());
      // The rest of the reply is still processed.
      expect(mockResolveInputSourceList).toHaveBeenCalled();
    });

    it("sends PRS with the slot of the selected station", async () => {
      const driver = await createDriverWithPresets();
      const raw = vi.fn().mockResolvedValue(undefined);
      (driver as any).avrContexts.get("TX-RZ50_1.2.3.4").tunerPresets.set([
        { slot: 1, name: "R10 80s", band: "2", freq: "0" },
        { slot: 12, name: "NPO FunX", band: "2", freq: "0" },
        { slot: 28, name: "STRKSTAD", band: "1", freq: "107.20" }
      ]);

      await (driver as any).sendTunerPreset({ raw }, "TX-RZ50_1.2.3.4_main", "main", "NPO FunX");

      expect(raw).toHaveBeenCalledWith("PRS0C");
      expect(mockLog.debug).toHaveBeenCalledWith("%s [%s] Selecting tuner preset '%s': slot %d (band %s) -> PRS%s", "driver:", "TX-RZ50_1.2.3.4", "NPO FunX", 12, "2", "0C");
    });

    it("does not send anything for a station the AVR never reported", async () => {
      const driver = await createDriverWithPresets();
      const raw = vi.fn().mockResolvedValue(undefined);

      await expect((driver as any).sendTunerPreset({ raw }, "TX-RZ50_1.2.3.4_main", "main", "Made up station")).rejects.toThrow();
      expect(raw).not.toHaveBeenCalled();
      expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("is not one of the stations the AVR reported"), "driver:", "Made up station");
    });
  });

  describe("config save", () => {
    const savedConfig = {
      avrs: [
        { model: "TX-RZ50", ip: "1.2.3.4", zone: "main", volumeScale: "auto", createSensors: false },
        { model: "TX-RZ50", ip: "1.2.3.4", zone: "zone2", volumeScale: "auto", createSensors: false }
      ],
      logLevel: "info"
    };

    it("collects the AVR info again for every AVR", async () => {
      mockConfigStore.load.mockReturnValue(savedConfig);
      const driver = await createDriver();
      await driver.handleDriverSetup({ command: "start" } as any);

      const command = vi.fn();
      mockConnectionManager.getPhysicalConnection.mockImplementation((_physicalAVR?: string) => ({ eiscp: { command, connected: true } }));

      await mockSetupHost.current.onConfigSaved();

      // NRI is a device-wide document: one query per AVR, not per zone.
      expect(command).toHaveBeenCalledTimes(1);
      expect(command).toHaveBeenCalledWith({ zone: "main", command: "avr-info", args: "query" });
    });

    it("does not fail when an AVR is not connected", async () => {
      mockConfigStore.load.mockReturnValue(savedConfig);
      const driver = await createDriver();
      await driver.handleDriverSetup({ command: "start" } as any);
      mockConnectionManager.getPhysicalConnection.mockReturnValue(undefined);

      await expect(mockSetupHost.current.onConfigSaved()).resolves.not.toThrow();
    });

    it("removes stale zone entities from the available entity pool", async () => {
      const oldZone = "TX-RZ50_1.2.3.4_zone2";
      const staleIds = [oldZone, `${oldZone}_source_sensor`, `${oldZone}_input_selector`, `${oldZone}_remote`];
      staleIds.forEach((id) => h.availableEntityIds.add(id));
      mockDriver.getAvailableEntities.mockImplementation(() => ({
        contains: vi.fn((id: string) => h.availableEntityIds.has(id)),
        removeEntity: vi.fn((id: string) => h.availableEntityIds.delete(id))
      }));

      mockConfigStore.load.mockReturnValueOnce({
        avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "zone2" }],
        logLevel: "info"
      });
      const driver = await createDriver();
      mockConnectCoordinator.reconcile.mockReset().mockReturnValue([oldZone]);
      mockConfigStore.load.mockReturnValue({
        avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main" }],
        logLevel: "info"
      });
      await driver.handleDriverSetup({ command: "start" } as any);

      await mockSetupHost.current.onConfigSaved();

      expect(mockConnectCoordinator.reconcile).toHaveBeenCalled();
      for (const id of staleIds) expect(h.availableEntityIds.has(id)).toBe(false);
    });
  });

  describe("init", () => {
    it("logs initialization message", async () => {
      const driver = await createDriver();

      await driver.init();

      expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("Initializing"), expect.any(String));
    });

    it("connects persisted AVRs during initialization", async () => {
      mockConfigStore.load.mockReturnValue({
        avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main" }],
        logLevel: "info"
      });

      const driver = await createDriver();
      mockConnectCoordinator.connect.mockClear();

      await driver.init();

      expect(mockConnectCoordinator.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe("select entity option providers", () => {
    const handlerFor = (suffix: string) => ctorArgs.selectHandler.find((args) => args[3] === suffix)!;

    it("offers listening modes for the current audio format, or all of them when it is unknown", async () => {
      await createDriver();
      const options = handlerFor("_listening_mode")[6];

      mockAvrStateApi.getAudioFormat.mockReturnValueOnce("unknown");
      expect(options("TX-RZ50_1.2.3.4_main")).toEqual(["option1"]);
      expect(mockEntityRegistrar.getListeningModeOptions).toHaveBeenLastCalledWith(undefined, "TX-RZ50_1.2.3.4_main");

      mockAvrStateApi.getAudioFormat.mockReturnValueOnce("dolby atmos");
      options("TX-RZ50_1.2.3.4_main");
      expect(mockEntityRegistrar.getListeningModeOptions).toHaveBeenLastCalledWith("dolby atmos", "TX-RZ50_1.2.3.4_main");
    });

    it("offers the input sources and tuner presets of the zone, and recalls presets by slot", async () => {
      const driver = await createDriver();

      expect(handlerFor("_input_selector")[6]("TX-RZ50_1.2.3.4_main")).toEqual(["input1"]);
      expect(mockEntityRegistrar.getInputSelectorOptions).toHaveBeenCalledWith("TX-RZ50_1.2.3.4_main");

      const tunerPresets = handlerFor("_tuner_presets");
      expect(tunerPresets[6]("TX-RZ50_1.2.3.4_main")).toEqual(["R10 80s", "NPO FunX", "STRKSTAD"]);
      // The option is sent as a preset slot by the driver, not as a mapped command value.
      (driver as any).avrContexts.get("TX-RZ50_1.2.3.4").tunerPresets.set([{ slot: 3, name: "R10 80s", band: "2", freq: "0" }]);
      const raw = vi.fn().mockResolvedValue(undefined);
      await tunerPresets[8]({ raw }, "TX-RZ50_1.2.3.4_main", "main", "R10 80s");
      expect(raw).toHaveBeenCalledWith("PRS03");
    });

    it("offers the fixed Dirac options", async () => {
      await createDriver();
      const { DIRAC_OPTION_LABELS } = await import("../src/diracSelect.js");

      expect(handlerFor("_dirac")[6]()).toEqual([...DIRAC_OPTION_LABELS]);
    });
  });

  describe("AVR availability", () => {
    it("greys out the entities of every configured zone of the AVR that lost its connection", async () => {
      mockConfigStore.load.mockReturnValue({
        avrs: [
          { model: "TX-RZ50", ip: "1.2.3.4", zone: "main", createSensors: false },
          { model: "TX-RZ50", ip: "1.2.3.4", zone: "zone2", createSensors: false },
          { model: "TX-NR860", ip: "5.6.7.8", zone: "main", createSensors: false }
        ],
        logLevel: "info"
      });
      await createDriver();
      const onAvailability = ctorArgs.connectionManager[0][6];

      onAvailability("TX-RZ50_1.2.3.4", false);

      expect(mockSetZoneEntitiesAvailability).toHaveBeenCalledWith(mockDriver, ["TX-RZ50_1.2.3.4_main", "TX-RZ50_1.2.3.4_zone2"], false, mockAvrStateApi);
    });
  });

  describe("raw send", () => {
    it("sends over the current connection of the AVR, and does nothing without one", async () => {
      const driver = await createDriver();
      const send = (driver as any).createRawSend({ model: "TX-RZ50", ip: "1.2.3.4", zone: "zone2" });
      const raw = vi.fn().mockResolvedValue(undefined);

      mockConnectionManager.getPhysicalConnection.mockReturnValueOnce({ eiscp: { raw } });
      await send("PWR01");
      mockConnectionManager.getPhysicalConnection.mockReturnValueOnce(undefined);
      await expect(send("PWR00")).resolves.toBeUndefined();

      expect(mockConnectionManager.getPhysicalConnection).toHaveBeenCalledWith("TX-RZ50_1.2.3.4");
      expect(raw).toHaveBeenCalledTimes(1);
      expect(raw).toHaveBeenCalledWith("PWR01");
    });
  });

  describe("setup host", () => {
    it("forgets every AVR and disconnects when the config is cleared", async () => {
      mockConfigStore.load.mockReturnValue({ avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", createSensors: false }], logLevel: "info" });
      const driver = await createDriver();
      await driver.handleDriverSetup({ command: "start" } as any);
      driver.avrInstances.set("TX-RZ50_1.2.3.4_main", {});
      mockConfigStore.load.mockReturnValue({});

      await mockSetupHost.current.onConfigCleared();

      expect(mockConnectCoordinator.reconcile).toHaveBeenCalledWith({ avrs: [] });
      expect(mockConfigStore.clear).toHaveBeenCalled();
      expect(driver.config).toEqual({});
      expect(driver.avrInstances.size).toBe(0);
      expect(mockConnectionManager.clearAllConnections).toHaveBeenCalled();
      expect(mockDriver.setDeviceState).toHaveBeenCalledWith("disconnected");
    });

    it("probes input sources through the setup probe", async () => {
      const driver = await createDriver();
      await driver.handleDriverSetup({ command: "start" } as any);
      const query = vi.spyOn((driver as any).setupInputSourceProbe, "query").mockResolvedValue([{ id: "10", name: "BD/DVD" }]);

      await expect(mockSetupHost.current.queryInputSources({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128 })).resolves.toEqual([{ id: "10", name: "BD/DVD" }]);
      expect(query).toHaveBeenCalledWith("TX-RZ50", "1.2.3.4", 60128);
    });

    it("creates the setup handler once and passes it every message", async () => {
      const driver = await createDriver();
      await driver.handleDriverSetup({ command: "start" } as any);
      const first = driver.setupHandler;
      await driver.handleDriverSetup({ command: "next" } as any);

      expect(driver.setupHandler).toBe(first);
      expect(first.handle).toHaveBeenCalledTimes(2);
    });
  });

  describe("AVR info collection after connecting", () => {
    const config = { avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", createSensors: false }], logLevel: "info" };

    afterEach(() => {
      vi.useRealTimers();
    });

    it("asks again after 10 and 30 seconds, and a new save restarts that schedule", async () => {
      vi.useFakeTimers();
      mockConfigStore.load.mockReturnValue(config);
      const driver = await createDriver();
      await driver.handleDriverSetup({ command: "start" } as any);
      const command = vi.fn().mockResolvedValue(undefined);
      mockConnectionManager.getPhysicalConnection.mockReturnValue({ eiscp: { command, connected: true } });

      await mockSetupHost.current.onConfigSaved();
      expect(command).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5_000);
      // A second save within the first 10 seconds replaces the pending retries instead of adding to them.
      await mockSetupHost.current.onConfigSaved();
      expect(command).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(10_000);
      expect(command).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(command).toHaveBeenCalledTimes(4);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(command).toHaveBeenCalledTimes(4);
    });

    it("warns when the AVR info query fails", async () => {
      mockConfigStore.load.mockReturnValue(config);
      const driver = await createDriver();
      const error = new Error("socket closed");
      mockConnectionManager.getPhysicalConnection.mockReturnValue({ eiscp: { command: vi.fn().mockRejectedValue(error), connected: true } });

      await driver.triggerAvrInfoQuery();

      expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("Failed to collect the AVR info"), "driver:", "TX-RZ50_1.2.3.4", error);
    });

    it("reports connected and wires each connection to a command receiver and sender", async () => {
      vi.useFakeTimers();
      mockConfigStore.load.mockReturnValue(config);
      const driver = await createDriver();
      mockConnectCoordinator.connect.mockResolvedValueOnce(true);

      await driver.handleConnect();

      expect(mockDriver.setDeviceState).toHaveBeenCalledWith("connected");
      const [, receiverFactory, senderFactory] = mockConnectCoordinator.connect.mock.calls[0];
      const eiscp = { connected: true };
      const receiver = receiverFactory(config.avrs[0])(eiscp);
      const receiverArgs = ctorArgs.commandReceiver[0];
      expect(receiverArgs[0]).toBe(mockDriver);
      expect(receiverArgs[1].avrs[0]).toMatchObject({ ip: "1.2.3.4", zone: "main" });
      expect(receiverArgs[2]).toBe(eiscp);
      expect(receiverArgs[7]).toBe("2.0.0");
      // The receiver reports NRI replies back to the driver.
      expect(typeof receiverArgs[8]).toBe("function");

      const avrSpecificConfig = driver.createAvrSpecificConfig(config.avrs[0]);
      expect(senderFactory(avrSpecificConfig, eiscp, receiver)).toBe(mockCommandSender);
      expect(ctorArgs.commandSender[0].slice(0, 5)).toEqual([mockDriver, avrSpecificConfig, eiscp, mockAvrStateApi, receiver]);
    });
  });

  describe("handleAvrInfo entity refresh", () => {
    beforeEach(() => {
      mockConnectionManager.getPhysicalConnection.mockReturnValue(undefined);
      mockResolveAutoVolumeScale.mockReturnValue(undefined);
      mockResolveInputSourceList.mockReturnValue(undefined);
    });

    it("also re-registers the remote entity of a zone that has one", async () => {
      const config = { avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", volumeScale: "auto", createSensors: false, createRemoteEntity: true }], logLevel: "info" };
      mockConfigStore.load.mockReturnValue(config);
      const driver = await createDriver();
      mockResolveAutoVolumeScale.mockReturnValue({ scale: 80, reason: "AVR reports a maximum display volume of 80", discovered: true });
      mockConfigStore.patchAvr.mockReturnValue(true);
      mockEntityRegistrar.createRemoteEntity.mockClear();

      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      expect(mockConfigStore.patchAvr).toHaveBeenCalledWith("1.2.3.4", "main", { volumeScale: 80, volumeScaleDiscovered: true });
      expect(mockEntityRegistrar.createRemoteEntity).toHaveBeenCalledTimes(1);
    });

    it("stores the volume scale and the input switch in one write", async () => {
      const config = { avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", volumeScale: "auto", useAvrReportedInputs: true, createSensors: false }], logLevel: "info" };
      mockConfigStore.load.mockReturnValue(config);
      const driver = await createDriver();
      mockResolveAutoVolumeScale.mockReturnValue({ scale: 100, reason: "default", discovered: false });
      mockResolveInputSourceList.mockReturnValue({ reason: "AVR reports no input sources" });
      mockConfigStore.patchAvr.mockReturnValue(true);

      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      expect(mockConfigStore.patchAvr).toHaveBeenCalledTimes(1);
      expect(mockConfigStore.patchAvr).toHaveBeenCalledWith("1.2.3.4", "main", { volumeScale: 100, volumeScaleDiscovered: false, useAvrReportedInputs: false });
    });

    it("logs an error when the input switch cannot be stored", async () => {
      const config = { avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", volumeScale: 100, useAvrReportedInputs: true, createSensors: false }], logLevel: "info" };
      mockConfigStore.load.mockReturnValue(config);
      const driver = await createDriver();
      mockResolveInputSourceList.mockReturnValue({ reason: "AVR reports no input sources" });
      mockHasAvrInputs.mockReturnValue(false);
      mockConfigStore.patchAvr.mockReturnValue(false);
      mockEntityRegistrar.createMediaPlayerEntity.mockClear();

      driver.handleAvrInfo("TX-RZ50_1.2.3.4_main");

      expect(mockLog.error).toHaveBeenCalledWith("%s [%s] Could not disable AVR-reported input names in the config", "driver:", "TX-RZ50_1.2.3.4_main");
      // Nothing changed, so the entities are left as they are.
      expect(mockEntityRegistrar.createMediaPlayerEntity).not.toHaveBeenCalled();
    });
  });
});
