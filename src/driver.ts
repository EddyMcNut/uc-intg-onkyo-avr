/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import EiscpDriver from "./eiscp.js";
import { ConfigManager, setConfigDir, OnkyoConfig, AvrConfig, AVR_DEFAULTS, buildEntityId, buildPhysicalAvrId, DEFAULT_QUEUE_THRESHOLD, parseBoolean } from "./configManager.js";
import { CommandSender } from "./commandSender.js";
import { CommandReceiver } from "./commandReceiver.js";
import { ReconnectionManager } from "./reconnectionManager.js";
import { SelectAttributes } from "./selectEntity.js";
import { avrStateManager } from "./avrState.js";
import log from "./loggers.js";
import SetupHandler from "./setupHandler.js";
import EntityRegistrar from "./entityRegistrar.js";
import ConnectionManager from "./connectionManager.js";
import AvrInstanceManager from "./avrInstanceManager.js";
import ListeningModeHandler from "./listeningModeHandler.js";
import SubscriptionHandler from "./subscriptionHandler.js";
const integrationName = "driver:";

/** Parsed setup data with concrete types (after validation/conversion) */
interface ParsedSetupData {
  queueThreshold: number;
  albumArtURL: string;
  volumeScale: number;
  adjustVolumeDispl: boolean;
  createSensors: boolean;
  netMenuDelay: number;
}

export default class OnkyoDriver {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private remoteInStandby: boolean = false; // Track Remote standby state
  private reconnectionManager: ReconnectionManager = new ReconnectionManager();
  private connectionManager: import("./connectionManager.js").default;
  private avrInstanceManager: import("./avrInstanceManager.js").default = new AvrInstanceManager();
  private connectCoordinator?: import("./connectCoordinator.js").default;
  private driverVersion: string = "unknown";
  private lastSetupData: ParsedSetupData = {
    queueThreshold: AVR_DEFAULTS.queueThreshold,
    albumArtURL: AVR_DEFAULTS.albumArtURL,
    volumeScale: AVR_DEFAULTS.volumeScale,
    adjustVolumeDispl: true,
    createSensors: AVR_DEFAULTS.createSensors,
    netMenuDelay: AVR_DEFAULTS.netMenuDelay
  };

  // Handler extracted to separate module for clarity/testing
  private setupHandler?: InstanceType<typeof SetupHandler>;
  private entityRegistrar: EntityRegistrar;
  private listeningModeHandler: ListeningModeHandler;
  private subscriptionHandler: SubscriptionHandler;

  constructor() {
    this.driver = new uc.IntegrationAPI();
    // Initialize driver first so we can determine the correct config directory
    this.driver.init("driver.json", this.handleDriverSetup.bind(this));

    // Read driver version early so it's available when creating command receivers
    try {
      const fs = require("fs");
      const path = require("path");
      const driverJsonPath = path.resolve(process.cwd(), "driver.json");
      const driverJsonRaw = fs.readFileSync(driverJsonPath, "utf-8");
      const driverJson = JSON.parse(driverJsonRaw);
      this.driverVersion = driverJson.version || "unknown";
    } catch (err) {
      log.warn("%s Could not read driver version in constructor:", integrationName, err);
    }

    // Ensure ConfigManager uses the Integration API config dir so the Integration
    // Manager can back up and restore the same files
    try {
      const configDir = this.driver.getConfigDirPath();
      setConfigDir(configDir);
    } catch (err) {
      log.warn("%s Could not determine driver config directory, falling back to environment or CWD", integrationName, err);
    }

    // Now load config from the correct path and continue setup
    this.config = ConfigManager.load();

    // Create connection manager (needs reconnectionManager and query callback)
    this.connectionManager = new ConnectionManager(this.reconnectionManager, this.queryAllZonesState.bind(this), () => this.driverVersion);

    // Initialize entity registrar before handing it to helper classes
    this.entityRegistrar = new EntityRegistrar();

    // initialize helpers
    this.listeningModeHandler = new ListeningModeHandler(this.driver, this.connectionManager, this.avrInstanceManager, this.entityRegistrar);
    this.subscriptionHandler = new SubscriptionHandler(this.connectionManager, this.avrInstanceManager);

    // Instance manager already created as a property; create connect coordinator lazily when needed
    this.setupDriverEvents();
    this.setupEventHandlers();
    log.info("%s Loaded config at startup: %o", integrationName, this.config);

    // Register entities from config at startup (like Python integrations do)
    // This ensures entities survive reboots - they're registered before Connect event
    if (this.config.avrs && this.config.avrs.length > 0) {
      this.registerAvailableEntities();
    }
    if (this.config.avrs && this.config.avrs.length > 0) {
      this.registerAvailableEntities();
    }
  }

  private async handleDriverSetup(msg: uc.SetupDriver): Promise<uc.SetupAction> {
    // Delegate to the extracted SetupHandler to keep OnkyoDriver focused on runtime behavior
    if (!this.setupHandler) {
      const host = {
        driver: this.driver,
        getConfigDirPath: () => (this.driver.getConfigDirPath ? this.driver.getConfigDirPath() : undefined),
        onConfigSaved: async () => {
          this.config = ConfigManager.load();
          this.registerAvailableEntities();
          await this.handleConnect();
        },
        onConfigCleared: async () => {
          ConfigManager.clear();
          this.config = ConfigManager.load();
          this.avrInstanceManager.clearInstances();
          this.connectionManager.clearAllConnections();
          await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
        },
        log
      };
      this.setupHandler = new SetupHandler(host);
    }
    return this.setupHandler.handle(msg);
  }

  private registerAvailableEntities(): void {
    log.info("%s Registering available entities from config", integrationName);
    if (!this.entityRegistrar) this.entityRegistrar = new EntityRegistrar();
    for (const avrConfig of this.config.avrs!) {
      const avrEntry = buildEntityId(avrConfig.model, avrConfig.ip, avrConfig.zone);
      const mediaPlayerEntity = this.entityRegistrar.createMediaPlayerEntity(avrEntry, avrConfig.volumeScale ?? 100, this.sharedCmdHandler.bind(this));
      this.driver.addAvailableEntity(mediaPlayerEntity);
      log.info("%s [%s] Media player entity registered as available", integrationName, avrEntry);

      // Register sensor entities only if createSensors is enabled (defaults to true for backward compatibility)
      if (avrConfig.createSensors !== false) {
        const sensorEntities = this.entityRegistrar.createSensorEntities(avrEntry);
        for (const sensor of sensorEntities) {
          this.driver.addAvailableEntity(sensor);
          log.info("%s [%s] Sensor entity registered: %s", integrationName, avrEntry, sensor.id);
        }
      } else {
        log.info("%s [%s] Sensor entities disabled by user preference", integrationName, avrEntry);
      }

      // Register Listening Mode select entity.  In unit tests we sometimes
      // use a partial driver-like object that doesn't initialize the
      // handler, so fall back gracefully to a no-op to avoid exceptions.
      const lmHandler =
        this.listeningModeHandler?.handle.bind(this.listeningModeHandler) ||
        (async () => uc.StatusCodes.Ok);
      const listeningModeEntity = this.entityRegistrar.createListeningModeSelectEntity(avrEntry, lmHandler);
      this.driver.addAvailableEntity(listeningModeEntity);
      log.info("%s [%s] Listening Mode select entity registered", integrationName, avrEntry);

      // Ensure the runtime select-entity options reflect any (re)configured per-AVR list immediately
      // If the Integration API supports updating attributes at runtime,
      // set the select-entity options immediately from saved config.
      const options = this.entityRegistrar.getListeningModeOptions(undefined, avrEntry);
      // Always refresh the listening-mode select options at registration time from
      // the current persisted config. Previously we only updated when a
      // non-empty user-configured list existed which could leave stale options
      // visible in other activities after reconfigure. Ensure we always call
      // updateEntityAttributes so both running and available activity views
      // receive the updated options (including empty arrays).
      if (typeof this.driver.updateEntityAttributes === "function") {
        // `options` is a string[]; augmentation above allows us to pass it
        // directly without casting.
        this.driver.updateEntityAttributes(`${avrEntry}_listening_mode`, {
          [SelectAttributes.Options]: options
        });
      }

      // Log when a user-configured list is present so operators can verify at boot
      if (Array.isArray(avrConfig.listeningModeOptions) && avrConfig.listeningModeOptions.length > 0) {
        log.info("%s [%s] Loaded %d user-configured listeningModeOptions", integrationName, avrEntry, avrConfig.listeningModeOptions.length);
      }
    }
  }

  private setupDriverEvents() {
    this.driver.on(uc.Events.Connect, async () => {
      log.info(`${integrationName} ===== CONNECT EVENT RECEIVED =====`);
      // Log current version from driver.json
      try {
        const fs = await import("fs");
        const path = await import("path");
        const driverJsonPath = path.resolve(process.cwd(), "driver.json");
        const driverJsonRaw = fs.readFileSync(driverJsonPath, "utf-8");
        const driverJson = JSON.parse(driverJsonRaw);
        this.driverVersion = driverJson.version || "unknown";
        log.info(`${integrationName} Driver version: ${this.driverVersion}`);
      } catch (err) {
        log.warn(`${integrationName} Could not read driver version from driver.json:`, err);
      }
      await this.handleConnect();
    });
    this.driver.on(uc.Events.EnterStandby, async () => {
      log.info(`${integrationName} ===== ENTER STANDBY EVENT RECEIVED =====`);
      this.remoteInStandby = true;
      log.info(`${integrationName} Remote entering standby, disconnecting AVR(s) to save battery...`);

      // Clear all reconnect timers
      this.connectionManager.cancelAllScheduledReconnections();

      // Disconnect all physical AVRs
      this.connectionManager.disconnectAll();

      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
    });
    this.driver.on(uc.Events.ExitStandby, async () => {
      log.info(`${integrationName} ===== EXIT STANDBY EVENT RECEIVED =====`);
      this.remoteInStandby = false;
      await this.handleConnect();
    });
  }

  /**
   * Create Listening Mode select entity
   */

  /**
   * Handle Listening Mode select entity commands
   */
  // listening mode behavior now extracted to ListeningModeHandler

  private async queryAvrState(avrEntry: string, eiscp: EiscpDriver, context: string): Promise<void> {
    if (!eiscp.connected) {
      log.warn(`${integrationName} [${avrEntry}] Cannot query AVR state (${context}), not connected`);
      return;
    }

    // avoid duplicate queries within short timeframe
    if (!avrStateManager.shouldQuery(avrEntry)) {
      log.debug(`${integrationName} [${avrEntry}] Skipping repeated state query (${context})`);
      return;
    }
    avrStateManager.recordQuery(avrEntry);

    // Extract zone from avrEntry (format: "model ip zone")
    const instance = this.avrInstanceManager.getInstance(avrEntry);
    const zone = instance?.config.zone || "main";
    const queueThreshold = instance?.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;

    // Delegate to state manager for the actual query logic
    await avrStateManager.queryAvrState(avrEntry, eiscp, zone, context, queueThreshold);
  }

  /** Query state for all zones of a physical AVR */
  private async queryAllZonesState(physicalAVR: string, eiscp: EiscpDriver, context: string): Promise<void> {
    const queried: string[] = [];
    let firstZone = true;
    for (const [avrEntry, instance] of this.avrInstanceManager.entries()) {
      const entryPhysicalAVR = buildPhysicalAvrId(instance.config.model, instance.config.ip);
      if (entryPhysicalAVR === physicalAVR) {
        // For non-initial queries, only query zones that are powered on
        // Initial queries (after connection) will query all zones to get power state
        const isInitialQuery = context.includes("after reconnection") || context.includes("after connection");
        if (!isInitialQuery && !avrStateManager.isEntityOn(avrEntry)) {
          log.debug("%s [%s] Skipping query for zone in standby (%s)", integrationName, avrEntry, context);
          continue;
        }

        const queueThreshold = instance.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;
        // Wait between zones (except first) to give AVR time to process
        if (!firstZone) {
          await new Promise((resolve) => setTimeout(resolve, queueThreshold));
        }
        firstZone = false;

        // record before asking to avoid duplicates when subscription handler fires
        queried.push(avrEntry);
        await this.queryAvrState(avrEntry, eiscp, context);
      }
    }
    if (queried.length > 0) {
      avrStateManager.recordQueries(queried);
    }
  }

  /** Create OnkyoConfig for a specific AVR zone */
  private createAvrSpecificConfig(avrConfig: AvrConfig): OnkyoConfig {
    // Defensive coercion/normalization for runtime config values
    const queueThreshold = (() => {
      const v = avrConfig.queueThreshold ?? AVR_DEFAULTS.queueThreshold;
      const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
      return isNaN(n) || n < 0 ? DEFAULT_QUEUE_THRESHOLD : n;
    })();

    const albumArtURL = typeof avrConfig.albumArtURL === "string" && avrConfig.albumArtURL.trim() !== "" ? avrConfig.albumArtURL.trim() : AVR_DEFAULTS.albumArtURL;

    const volumeScale = (() => {
      const v = typeof avrConfig.volumeScale === "number" ? avrConfig.volumeScale : parseInt(String(avrConfig.volumeScale ?? ""), 10);
      return v === 80 || v === 100 ? v : AVR_DEFAULTS.volumeScale;
    })();

    const adjustVolumeDispl = parseBoolean(avrConfig.adjustVolumeDispl, AVR_DEFAULTS.adjustVolumeDispl);
    const createSensors = parseBoolean(avrConfig.createSensors, AVR_DEFAULTS.createSensors);

    const netMenuDelay = (() => {
      const v = typeof avrConfig.netMenuDelay === "number" ? avrConfig.netMenuDelay : parseInt(String(avrConfig.netMenuDelay ?? ""), 10);
      return isNaN(v) || v < 0 ? AVR_DEFAULTS.netMenuDelay : v;
    })();

    const port = (() => {
      const p = typeof avrConfig.port === "number" ? avrConfig.port : parseInt(String(avrConfig.port ?? ""), 10);
      return isNaN(p) || p < 1 || p > 65535 ? AVR_DEFAULTS.port : p;
    })();

    return {
      avrs: [
        {
          model: avrConfig.model,
          ip: avrConfig.ip,
          port: port,
          zone: avrConfig.zone,
          queueThreshold,
          albumArtURL,
          volumeScale,
          adjustVolumeDispl,
          createSensors,
          netMenuDelay,
          // Preserve user-configured listening mode options so command receivers
          // and runtime logic can honour them after restart.
          listeningModeOptions: Array.isArray((avrConfig as any).listeningModeOptions)
            ? (avrConfig as any).listeningModeOptions.map((s: string) => s.trim())
            : undefined
        }
      ],
      queueThreshold,
      albumArtURL,
      volumeScale,
      adjustVolumeDispl,
      // Backward compatibility fields for existing code
      model: avrConfig.model,
      ip: avrConfig.ip,
      port: port
    };
  }

  private async handleConnect() {
    // Reload config to get latest AVR list
    this.config = ConfigManager.load();

    // Connect to all configured AVRs
    if (!this.config.avrs || this.config.avrs.length === 0) {
      log.info("%s No AVRs configured", integrationName);
      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
      return;
    }

    // STEP 1: Create physical connections (one per unique IP)
    const uniqueAvrs = new Map<string, AvrConfig>();
    for (const avrConfig of this.config.avrs) {
      const physicalAVR = buildPhysicalAvrId(avrConfig.model, avrConfig.ip);
      if (!uniqueAvrs.has(physicalAVR)) {
        uniqueAvrs.set(physicalAVR, avrConfig);
      }
    }

    // Track which AVRs have already been queried (to avoid duplicate queries)
    const alreadyQueriedAvrs = new Set<string>();

    for (const [physicalAVR, avrConfig] of uniqueAvrs) {
      // Check if we already have a physical connection to this AVR
      let physicalConnection = this.connectionManager.getPhysicalConnection(physicalAVR);

      if (!physicalConnection) {
        // Need to create a new physical connection
        const avrSpecificConfig = this.createAvrSpecificConfig(avrConfig);
        const physicalConn = await this.connectionManager.createAndConnect(physicalAVR, avrConfig, (eiscpInstance) => {
          // Create command receiver using Onkyo-specific class and the driver context
          const commandReceiver = new CommandReceiver(this.driver, avrSpecificConfig, eiscpInstance, this.driverVersion);
          return commandReceiver;
        });
        physicalConnection = physicalConn;
      } else if (!physicalConnection.eiscp.connected) {
        // Physical connection exists but is disconnected, try to reconnect
        log.info("%s [%s] TCP connection lost, reconnecting to AVR...", integrationName, physicalAVR);

        const result = await this.connectionManager.attemptReconnection(physicalAVR);

        if (result.success) {
          // Cancel any scheduled reconnection since we're now connected
          this.connectionManager.cancelScheduledReconnection(physicalAVR);

          // Query state for all zones after successful reconnection
          await this.queryAllZonesState(physicalAVR, physicalConnection.eiscp, "after reconnection in handleConnect");
          alreadyQueriedAvrs.add(physicalAVR);
        }
      }
    }

    // STEP 2: Create zone instances for all zones
    // NOTE: We need physical connections created first (even if they failed to connect)
    // because zone instances reference the shared eiscp from physical connection
    for (const avrConfig of this.config.avrs) {
      const physicalAVR = buildPhysicalAvrId(avrConfig.model, avrConfig.ip);
      const avrEntry = buildEntityId(avrConfig.model, avrConfig.ip, avrConfig.zone);

      // Skip if zone instance already exists
      if (this.avrInstanceManager.hasInstance(avrEntry)) {
        log.info("%s [%s] Zone instance already exists", integrationName, avrEntry);
        continue;
      }

      // Get the physical connection (it should exist from Phase 1, even if connection failed)
      const physicalConnection = this.connectionManager.getPhysicalConnection(physicalAVR);

      if (!physicalConnection) {
        // This shouldn't happen since Phase 1 creates physicalConnection objects even on failure
        // But if it does, we can't create zone instance without the shared eiscp
        log.warn("%s [%s] Cannot create zone instance - no physical connection object exists", integrationName, avrEntry);
        continue;
      }

      // Create per-zone config and command sender via AvrInstanceManager
      await this.avrInstanceManager.ensureZoneInstances(
        [avrConfig],
        (p) => this.connectionManager.getPhysicalConnection(p),
        this.createAvrSpecificConfig.bind(this),
        (avrSpecificConfig, eiscp) => new CommandSender(this.driver, avrSpecificConfig, eiscp)
      );

      const created = this.avrInstanceManager.getInstance(avrEntry);
      if (created && (created.commandSender as any)?.eiscp?.connected) {
        log.info("%s [%s] Zone connected and available", integrationName, avrEntry);
      }
    }

    // Query state for all connected AVRs (skip those already queried during reconnection)
    const queriedPhysicalAvrs = new Set<string>();
    for (const [avrEntry, instance] of this.avrInstanceManager.entries()) {
      const physicalAVR = buildPhysicalAvrId(instance.config.model, instance.config.ip);

      // Skip if this AVR was already queried during reconnection in Step 1
      if (alreadyQueriedAvrs.has(physicalAVR)) {
        continue;
      }

      const physicalConnection = this.connectionManager.getPhysicalConnection(physicalAVR);
      if (physicalConnection) {
        const queueThreshold = instance.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;
        // If we already queried a zone for this physical AVR, wait before next zone
        if (queriedPhysicalAvrs.has(physicalAVR)) {
          await new Promise((resolve) => setTimeout(resolve, queueThreshold));
        }
        queriedPhysicalAvrs.add(physicalAVR);
        await this.queryAvrState(avrEntry, physicalConnection.eiscp, "after connection");
      }
    }

    // If we have any zone instances, consider the driver connected
    const hasInstances = !!Array.from(this.avrInstanceManager.entries()).length;
    if (hasInstances) {
      await this.driver.setDeviceState(uc.DeviceStates.Connected);
    } else {
      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
    }
  }

  private async setupEventHandlers() {
    this.driver.on(uc.Events.Disconnect, async () => {
      // Clean up all reconnect timers when integration disconnects
      this.reconnectionManager.cancelAllScheduledReconnections();
      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
    });

    this.driver.on(uc.Events.SubscribeEntities, async (entityIds: string[]) => {
      log.info("%s Entities subscribed: %s", integrationName, entityIds.join(", "));

      // Clear standby flag when entities are subscribed
      this.remoteInStandby = false;

      // Delegate each subscription to handler
      for (const entityId of entityIds) {
        await this.subscriptionHandler.handle(entityId);
      }
    });

    this.driver.on(uc.Events.UnsubscribeEntities, async (entityIds: string[]) => {
      for (const entityId of entityIds) {
        log.info("%s [%s] Unsubscribed entity", integrationName, entityId);
      }
    });
  }

  // subscription handling moved to SubscriptionHandler

  // Use the sender class for command handling
  private async sharedCmdHandler(entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }): Promise<uc.StatusCodes> {
    // Get the AVR instance for this entity
    const instance = this.avrInstanceManager.getInstance(entity.id);
    if (!instance) {
      log.error("%s [%s] No AVR instance found for entity", integrationName, entity.id);
      return uc.StatusCodes.NotFound;
    }
    return instance.commandSender.sharedCmdHandler(entity, cmdId, params);
  }

  async init() {
    log.info("%s Initializing...", integrationName);
  }
}
