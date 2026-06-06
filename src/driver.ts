/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import { SelectAttributes } from "@unfoldedcircle/integration-api";
import EiscpDriver from "./eiscp.js";
import { ConfigManager, setConfigDir, OnkyoConfig, AvrConfig, buildEntityId, buildPhysicalAvrId, DEFAULT_QUEUE_THRESHOLD, normalizeAvrConfig } from "./configManager.js";
import { CommandSender } from "./commandSender.js";
import { CommandReceiver } from "./commandReceiver.js";
import { ReconnectionManager } from "./reconnectionManager.js";
import { avrStateManager } from "./avrState.js";
import { avrStateQueryService } from "./avrStateQuery.js";
import log from "./loggers.js";
import SetupHandler from "./setupHandler.js";
import EntityRegistrar from "./entityRegistrar.js";
import ConnectionManager from "./connectionManager.js";
import { SelectEntityHandler } from "./selectEntityHandler.js";
import SubscriptionHandler from "./subscriptionHandler.js";
import ConnectCoordinator from "./connectCoordinator.js";
import { AvrInstance } from "./types.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { delay } from "./utils.js";

const integrationName = "driver:";

// Descriptor for registering one group of entities for an AVR zone. OCP: add a type by appending to buildEntityRegistrations() — the loop never changes.
interface EntityRegistration {
  /** Return true when this entity group should be registered for the given AVR. */
  enabled: (cfg: AvrConfig) => boolean;
  /** Build and return the entity or entities to register. */
  create: () => uc.Entity | uc.Entity[];
  /** Called after all entities in the group have been added. Optional. */
  afterRegister?: (entities: uc.Entity[]) => void;
  /** Logged when `enabled` returns false. Omit for groups that are always enabled. */
  disabledMessage?: string;
}

export default class OnkyoDriver {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private reconnectionManager: ReconnectionManager = new ReconnectionManager();
  private connectionManager: import("./connectionManager.js").default;
  private readonly avrInstances = new Map<string, AvrInstance>();
  private driverVersion: string = "unknown";

  // Handler extracted to separate module for clarity/testing
  private setupHandler?: InstanceType<typeof SetupHandler>;
  private entityRegistrar: EntityRegistrar;
  private listeningModeHandler: SelectEntityHandler;
  private inputSelectorHandler: SelectEntityHandler;
  private subscriptionHandler: SubscriptionHandler;
  private connectCoordinator: ConnectCoordinator;

  constructor() {
    this.driver = new uc.IntegrationAPI();
    // Initialize driver first so we can determine the correct config directory
    this.driver.init("driver.json", this.handleDriverSetup.bind(this));

    // Read driver version early so it's available when creating command receivers
    try {
      const driverJsonPath = resolve(process.cwd(), "driver.json");
      const driverJsonRaw = readFileSync(driverJsonPath, "utf-8");
      const driverJson = JSON.parse(driverJsonRaw);
      this.driverVersion = driverJson.version || "unknown";
    } catch (err) {
      // log.warn("%s Could not read driver version in constructor:", integrationName, err);
    }

    // Ensure ConfigManager uses the Integration API config dir so the Integration Manager can back up and restore the same files
    try {
      const configDir = this.driver.getConfigDirPath();
      setConfigDir(configDir);
    } catch (err) {
      // log.warn("%s Could not determine driver config directory, falling back to environment or CWD", integrationName, err);
    }

    // Now load config from the correct path and continue setup
    this.config = ConfigManager.load();

    // Create connection manager (needs reconnectionManager and query callback)
    this.connectionManager = new ConnectionManager(this.reconnectionManager, this.queryAllZonesState.bind(this));

    // Initialize entity registrar before handing it to helper classes
    this.entityRegistrar = new EntityRegistrar();

    // initialize helpers
    this.listeningModeHandler = new SelectEntityHandler(this.driver, this.connectionManager, this.avrInstances, "_listening_mode", "listening-mode", "Listening Mode", (avrEntry) => {
      const audioFormat = avrStateManager.getAudioFormat(avrEntry);
      return this.entityRegistrar.getListeningModeOptions(audioFormat !== "unknown" ? audioFormat : undefined, avrEntry);
    });
    this.inputSelectorHandler = new SelectEntityHandler(this.driver, this.connectionManager, this.avrInstances, "_input_selector", "input-selector", "Input Selector", (avrEntry) =>
      this.entityRegistrar.getInputSelectorOptions(avrEntry)
    );
    this.subscriptionHandler = new SubscriptionHandler(this.connectionManager, this.avrInstances);

    // Create connect coordinator — orchestrates physical connections, zone instances, and initial queries
    this.connectCoordinator = new ConnectCoordinator(
      this.connectionManager,
      this.avrInstances,
      this.queryAvrState.bind(this),
      this.queryAllZonesState.bind(this),
      this.createAvrSpecificConfig.bind(this)
    );
    this.setupDriverEvents();
    this.setupEventHandlers();
    // log.info("%s Loaded config at startup: %o", integrationName, this.config);

    // Register entities from config at startup (like Python integrations do) This ensures entities survive reboots - they're registered before Connect event
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
          this.avrInstances.clear();
          this.connectionManager.clearAllConnections();
          await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
        },
        log
      };
      this.setupHandler = new SetupHandler(host);
    }
    return this.setupHandler.handle(msg);
  }

  // Build entity-registration descriptors for one AVR zone. OCP: append to add types — the loop is closed.
  private buildEntityRegistrations(avrEntry: string, avrConfig: AvrConfig, rawSend: (cmd: string) => Promise<void>): EntityRegistration[] {
    return [
      // ── Media player — always registered ───────────────────────────────────
      {
        enabled: () => true,
        create: () => this.entityRegistrar.createMediaPlayerEntity(avrEntry, avrConfig.volumeScale ?? 100, this.sharedCmdHandler.bind(this), rawSend)
      },

      // ── Sensor entities — conditional on createSensors flag ────────────────
      {
        enabled: (cfg) => cfg.createSensors !== false,
        create: () => this.entityRegistrar.createSensorEntities(avrEntry),
        disabledMessage: `${integrationName} [${avrEntry}] Sensor entities disabled by user preference`
      },

      // ── Listening Mode select — conditional on listeningModeOptions ─────────
      {
        enabled: (cfg) => cfg.listeningModeOptions !== null,
        create: () => {
          const handler = this.listeningModeHandler?.handle.bind(this.listeningModeHandler) ?? (async () => uc.StatusCodes.Ok);
          return this.entityRegistrar.createListeningModeSelectEntity(avrEntry, handler);
        },
        afterRegister: () => {
          const options = this.entityRegistrar.getListeningModeOptions(undefined, avrEntry);
          if (typeof this.driver.updateEntityAttributes === "function") {
            this.driver.updateEntityAttributes(`${avrEntry}_listening_mode`, { [SelectAttributes.Options]: options });
          }
          if (Array.isArray(avrConfig.listeningModeOptions) && avrConfig.listeningModeOptions.length > 0) {
            // log.info("%s [%s] Loaded %d user-configured listeningModeOptions", integrationName, avrEntry, avrConfig.listeningModeOptions.length);
          }
        },
        disabledMessage: `${integrationName} [${avrEntry}] Listening Mode select entity disabled by user preference (none)`
      },

      // ── Input Selector select — conditional on inputSelectorOptions ─────────
      {
        enabled: (cfg) => cfg.inputSelectorOptions !== null,
        create: () => {
          const handler = this.inputSelectorHandler?.handle.bind(this.inputSelectorHandler) ?? (async () => uc.StatusCodes.Ok);
          return this.entityRegistrar.createInputSelectorSelectEntity(avrEntry, handler);
        },
        afterRegister: () => {
          const isOptions = this.entityRegistrar.getInputSelectorOptions(avrEntry);
          if (typeof this.driver.updateEntityAttributes === "function") {
            this.driver.updateEntityAttributes(`${avrEntry}_input_selector`, { [SelectAttributes.Options]: isOptions });
          }
          if (Array.isArray(avrConfig.inputSelectorOptions) && avrConfig.inputSelectorOptions.length > 0) {
            // log.info("%s [%s] Loaded %d user-configured inputSelectorOptions", integrationName, avrEntry, avrConfig.inputSelectorOptions.length);
          }
        },
        disabledMessage: `${integrationName} [${avrEntry}] Input Selector select entity disabled by user preference (none)`
      }
    ];
  }

  private registerAvailableEntities(): void {
    // log.info("%s Registering available entities from config", integrationName);
    if (!this.entityRegistrar) this.entityRegistrar = new EntityRegistrar();
    for (const avrConfig of this.config.avrs!) {
      const avrEntry = buildEntityId(avrConfig.model, avrConfig.ip, avrConfig.zone);
      const physicalAVR = buildPhysicalAvrId(avrConfig.model, avrConfig.ip);
      const rawSend = async (cmd: string): Promise<void> => {
        const conn = this.connectionManager.getPhysicalConnection(physicalAVR);
        await conn?.eiscp?.raw(cmd);
      };

      for (const registration of this.buildEntityRegistrations(avrEntry, avrConfig, rawSend)) {
        if (!registration.enabled(avrConfig)) {
          if (registration.disabledMessage) // log.info(registration.disabledMessage);
          continue;
        }
        const entities = [registration.create()].flat() as uc.Entity[];
        for (const entity of entities) {
          this.driver.addAvailableEntity(entity);
          // log.info("%s [%s] Entity registered: %s", integrationName, avrEntry, entity.id);
        }
        registration.afterRegister?.(entities);
      }
    }
  }

  private setupDriverEvents() {
    this.driver.on(uc.Events.Connect, async () => {
      // log.info(`${integrationName} ===== CONNECT EVENT RECEIVED =====`);
      // Log current version from driver.json
      try {
        const driverJsonPath = resolve(process.cwd(), "driver.json");
        const driverJsonRaw = readFileSync(driverJsonPath, "utf-8");
        const driverJson = JSON.parse(driverJsonRaw);
        this.driverVersion = driverJson.version || "unknown";
        // log.info(`${integrationName} Driver version: ${this.driverVersion}`);
      } catch (err) {
        // log.warn(`${integrationName} Could not read driver version from driver.json:`, err);
      }
      await this.handleConnect();
    });
    this.driver.on(uc.Events.EnterStandby, async () => {
      // log.info(`${integrationName} ===== ENTER STANDBY EVENT RECEIVED =====`);
      // log.info(`${integrationName} Remote entering standby, disconnecting AVR(s) to save battery...`);

      // Clear all reconnect timers
      this.connectionManager.cancelAllScheduledReconnections();

      // Disconnect all physical AVRs
      this.connectionManager.disconnectAll();

      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
    });
    this.driver.on(uc.Events.ExitStandby, async () => {
      // log.info(`${integrationName} ===== EXIT STANDBY EVENT RECEIVED =====`);
      await this.handleConnect();
    });
  }

  private async queryAvrState(avrEntry: string, eiscp: EiscpDriver, context: string): Promise<void> {
    if (!eiscp.connected) {
      // log.warn(`${integrationName} [${avrEntry}] Cannot query AVR state (${context}), not connected`);
      return;
    }

    const instance = this.avrInstances.get(avrEntry);
    const zone = instance?.config.zone || "main";
    const queueThreshold = instance?.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;

    // Delegate to query service (includes its own debounce guard)
    await avrStateQueryService.queryAvrState(avrEntry, eiscp, zone, context, queueThreshold);
  }

  /** Query state for all zones of a physical AVR */
  private async queryAllZonesState(physicalAVR: string, eiscp: EiscpDriver, context: string): Promise<void> {
    const queried: string[] = [];
    let firstZone = true;
    for (const [avrEntry, instance] of this.avrInstances) {
      const entryPhysicalAVR = buildPhysicalAvrId(instance.config.model, instance.config.ip);
      if (entryPhysicalAVR === physicalAVR) {
        // For non-initial queries, only query zones that are powered on Initial queries (after connection) will query all zones to get power state
        const isInitialQuery = context.includes("after reconnection") || context.includes("after connection");
        if (!isInitialQuery && !avrStateManager.isEntityOn(avrEntry)) {
          // log.debug("%s [%s] Skipping query for zone in standby (%s)", integrationName, avrEntry, context);
          continue;
        }

        const queueThreshold = instance.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;
        // Wait between zones (except first) to give AVR time to process
        if (!firstZone) {
          await delay(queueThreshold);
        }
        firstZone = false;

        // record before asking to avoid duplicates when subscription handler fires
        queried.push(avrEntry);
        await this.queryAvrState(avrEntry, eiscp, context);
      }
    }
    if (queried.length > 0) {
      avrStateQueryService.recordQueries(queried);
    }
  }

  // Create OnkyoConfig for a specific AVR zone. OCP: field coercion lives in normalizeAvrConfig — this method never changes.
  private createAvrSpecificConfig(avrConfig: AvrConfig): OnkyoConfig {
    const n = normalizeAvrConfig(avrConfig);
    return {
      avrs: [{ ...n }],
      queueThreshold: n.queueThreshold,
      albumArtURL: n.albumArtURL,
      volumeScale: n.volumeScale,
      volumeDisplay: n.volumeDisplay,
      adjustVolumeDispl: n.adjustVolumeDispl,
      // Backward compatibility fields for existing code
      model: n.model,
      ip: n.ip,
      port: n.port
    };
  }

  private async handleConnect() {
    // Reload config to get latest AVR list
    this.config = ConfigManager.load();

    const hasInstances = await this.connectCoordinator.connect(
      this.config,
      (avrConfig) => (eiscpInstance) => {
        const avrSpecificConfig = this.createAvrSpecificConfig(avrConfig);
        return new CommandReceiver(this.driver, avrSpecificConfig, eiscpInstance, this.driverVersion);
      },
      (avrSpecificConfig, eiscp, commandReceiver) => new CommandSender(this.driver, avrSpecificConfig, eiscp, commandReceiver)
    );

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
      // log.info("%s Entities subscribed: %s", integrationName, entityIds.join(", "));

      // Delegate each subscription to handler
      for (const entityId of entityIds) {
        await this.subscriptionHandler.handle(entityId);
      }
    });

    this.driver.on(uc.Events.UnsubscribeEntities, async (entityIds: string[]) => {
      for (const entityId of entityIds) {
        // log.info("%s [%s] Unsubscribed entity", integrationName, entityId);
      }
    });
  }

  // Use the sender class for command handling
  private async sharedCmdHandler(entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }): Promise<uc.StatusCodes> {
    // Get the AVR instance for this entity
    const instance = this.avrInstances.get(entity.id);
    if (!instance) {
      // log.error("%s [%s] No AVR instance found for entity", integrationName, entity.id);
      return uc.StatusCodes.NotFound;
    }
    return instance.commandSender.sharedCmdHandler(entity, cmdId, params);
  }

  async init() {
    // log.info("%s Initializing...", integrationName);
  }
}
