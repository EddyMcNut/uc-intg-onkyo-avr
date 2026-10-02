/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import { SelectAttributes } from "@unfoldedcircle/integration-api";
import EiscpDriver from "./eiscp.js";
import {
  ConfigManager,
  setConfigDir,
  OnkyoConfig,
  AvrConfig,
  buildEntityId,
  buildPhysicalAvrId,
  physicalAvrIdFromEntityId,
  DEFAULT_QUEUE_THRESHOLD,
  normalizeAvrConfig,
  resolveVolumeScale,
  INPUT_SOURCE_LIST_MANUAL
} from "./configManager.js";
import { CommandSender } from "./commandSender.js";
import { CommandReceiver } from "./commandReceiver.js";
import { ReconnectionManager } from "./reconnectionManager.js";
import { AvrStateManager } from "./avrState.js";
import { avrStateQueryService } from "./avrStateQuery.js";
import { initMediaBrowser } from "./mediaBrowser.js";
import log, { setLogLevel } from "./loggers.js";
import { logGeneratedCount } from "./simpleCommands.js";
import SetupHandler from "./setupHandler.js";
import EntityRegistrar from "./entityRegistrar.js";
import ConnectionManager from "./connectionManager.js";
import { SelectEntityHandler } from "./selectEntityHandler.js";
import { DIRAC_OPTION_LABELS, diracOptionToServiceKey } from "./diracSelect.js";
import { remoteEntityCommandHandler } from "./remoteEntityCommandHandler.js";
import SubscriptionHandler from "./subscriptionHandler.js";
import ConnectCoordinator from "./connectCoordinator.js";
import { AvrInstance, EiscpInstance, type AvrStateApi } from "./types.js";
import { resolveAutoVolumeScale } from "./volumeScaleResolver.js";
import { resolveInputSourceList } from "./inputSourceResolver.js";
import { setAvrInputs, clearAvrInputs, hasAvrInputs } from "./inputSourceStore.js";
import { findTunerPresetByName, getTunerPresetNames, setTunerPresets, tunerPresetCommandValue } from "./tunerPresetStore.js";
import { listNamedPresets } from "./avrInfoStore.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  private readonly avrStateApi: AvrStateApi = new AvrStateManager();
  private driverVersion: string = "unknown";

  // Handler extracted to separate module for clarity/testing
  private setupHandler?: InstanceType<typeof SetupHandler>;
  private entityRegistrar: EntityRegistrar;
  private listeningModeHandler: SelectEntityHandler;
  private inputSelectorHandler: SelectEntityHandler;
  private tunerPresetsHandler: SelectEntityHandler;
  private diracHandler: SelectEntityHandler;
  private remoteEntityCommandHandler: remoteEntityCommandHandler;
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
      log.warn("%s Could not read driver version in constructor:", integrationName, err);
    }

    // Ensure ConfigManager uses the Integration API config dir so the Integration Manager can back up and restore the same files
    try {
      const configDir = this.driver.getConfigDirPath();
      setConfigDir(configDir);
    } catch (err) {
      log.warn("%s Could not determine driver config directory, falling back to environment or CWD", integrationName, err);
    }

    // Now load config from the correct path and continue setup
    this.config = ConfigManager.load();
    if (this.config.logLevel) setLogLevel(this.config.logLevel);
    logGeneratedCount();

    // Create connection manager (needs reconnectionManager and query callback)
    this.connectionManager = new ConnectionManager(this.reconnectionManager, this.queryAllZonesState.bind(this), undefined, this.avrStateApi);

    // Initialize entity registrar before handing it to helper classes
    this.entityRegistrar = new EntityRegistrar(this.avrStateApi);

    // Initialize media browser with dependency injection
    initMediaBrowser(this.avrStateApi);

    // initialize helpers
    this.listeningModeHandler = new SelectEntityHandler(this.driver, this.connectionManager, this.avrInstances, "_listening_mode", "listening-mode", "Listening Mode", (avrEntry) => {
      const audioFormat = this.avrStateApi.getAudioFormat(avrEntry);
      return this.entityRegistrar.getListeningModeOptions(audioFormat !== "unknown" ? audioFormat : undefined, avrEntry);
    });
    this.inputSelectorHandler = new SelectEntityHandler(this.driver, this.connectionManager, this.avrInstances, "_input_selector", "input-selector", "Input Selector", (avrEntry) =>
      this.entityRegistrar.getInputSelectorOptions(avrEntry)
    );
    this.tunerPresetsHandler = new SelectEntityHandler(
      this.driver,
      this.connectionManager,
      this.avrInstances,
      "_tuner_presets",
      "preset",
      "Tuner Presets",
      (avrEntry) => this.entityRegistrar.getTunerPresetOptions(avrEntry),
      undefined,
      this.sendTunerPreset.bind(this)
    );
    this.diracHandler = new SelectEntityHandler(this.driver, this.connectionManager, this.avrInstances, "_dirac", "dirac", "Dirac", () => [...DIRAC_OPTION_LABELS], diracOptionToServiceKey);
    this.remoteEntityCommandHandler = new remoteEntityCommandHandler(this.driver, this.connectionManager, this.avrInstances, this.avrStateApi);
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
    log.info("%s Loaded config at startup: %o", integrationName, this.config);

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
          if (this.config.logLevel) setLogLevel(this.config.logLevel);
          this.registerAvailableEntities();
          await this.handleConnect();
          // A saved config can change what the AVR has to be asked for (a volume scale put back on
          // "auto", changed entity options), so collect the AVR info again for every AVR.
          await this.triggerAvrInfoQuery();
        },
        onConfigCleared: async () => {
          ConfigManager.clear();
          this.config = ConfigManager.load();
          if (this.config.logLevel) setLogLevel(this.config.logLevel);
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
      this.buildMediaPlayerRegistration(avrEntry, avrConfig, rawSend),

      // ── Sensor entities — conditional on createSensors flag ────────────────
      {
        enabled: (cfg) => cfg.createSensors !== false,
        create: () => this.entityRegistrar.createSensorEntities(avrEntry),
        disabledMessage: `${integrationName} [${avrEntry}] Sensor entities disabled by user preference`
      },

      // ── Remote entity — conditional on createRemoteEntity flag ─────────────
      {
        enabled: (cfg) => cfg.createRemoteEntity === true,
        create: () => {
          const handler = this.remoteEntityCommandHandler?.handle.bind(this.remoteEntityCommandHandler) ?? (async () => uc.StatusCodes.Ok);
          return this.entityRegistrar.createRemoteEntity(avrEntry, handler);
        },
        disabledMessage: `${integrationName} [${avrEntry}] Remote entity disabled by user preference`
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
            log.info("%s [%s] Loaded %d user-configured listeningModeOptions", integrationName, avrEntry, avrConfig.listeningModeOptions.length);
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
            log.info("%s [%s] Loaded %d user-configured inputSelectorOptions", integrationName, avrEntry, avrConfig.inputSelectorOptions.length);
          }
        },
        disabledMessage: `${integrationName} [${avrEntry}] Input Selector select entity disabled by user preference (none)`
      },

      // ── Tuner Presets select — conditional on createTunerPresets flag ──────
      {
        enabled: (cfg) => cfg.createTunerPresets !== false,
        create: () => {
          const handler = this.tunerPresetsHandler?.handle.bind(this.tunerPresetsHandler) ?? (async () => uc.StatusCodes.Ok);
          return this.entityRegistrar.createTunerPresetsSelectEntity(avrEntry, handler);
        },
        afterRegister: () => {
          // The station names arrive with the first NRI reply, so push whatever was collected so far.
          if (typeof this.driver.updateEntityAttributes === "function") {
            this.driver.updateEntityAttributes(`${avrEntry}_tuner_presets`, { [SelectAttributes.Options]: this.entityRegistrar.getTunerPresetOptions(avrEntry) });
          }
        },
        disabledMessage: `${integrationName} [${avrEntry}] Tuner Presets select entity disabled by user preference`
      },

      // ── Dirac select — conditional on createDiracSelectEntity flag ─────────
      {
        enabled: (cfg) => cfg.createDiracSelectEntity !== false,
        create: () => {
          const handler = this.diracHandler?.handle.bind(this.diracHandler) ?? (async () => uc.StatusCodes.Ok);
          return this.entityRegistrar.createDiracSelectEntity(avrEntry, handler);
        },
        disabledMessage: `${integrationName} [${avrEntry}] Dirac select entity disabled by user preference`
      }
    ];
  }

  // The media player carries the volume scale in its entity options, so it is registered on its own
  // whenever that scale changes, without rebuilding the other entities of the AVR.
  private buildMediaPlayerRegistration(avrEntry: string, avrConfig: AvrConfig, rawSend: (cmd: string) => Promise<void>): EntityRegistration {
    return {
      enabled: () => true,
      create: () => this.entityRegistrar.createMediaPlayerEntity(avrEntry, resolveVolumeScale(avrConfig.volumeScale), this.sharedCmdHandler.bind(this), rawSend),
      afterRegister: () => {
        if (typeof this.driver.updateEntityAttributes === "function") {
          this.driver.updateEntityAttributes(avrEntry, { [uc.MediaPlayerAttributes.SourceList]: this.entityRegistrar.getInputSelectorOptions(avrEntry) });
        }
      }
    };
  }

  private registerAvailableEntities(): void {
    log.info("%s Registering available entities from config", integrationName);
    if (!this.entityRegistrar) this.entityRegistrar = new EntityRegistrar(this.avrStateApi);
    for (const avrConfig of this.config.avrs!) {
      const avrEntry = buildEntityId(avrConfig.model, avrConfig.ip, avrConfig.zone);

      for (const registration of this.buildEntityRegistrations(avrEntry, avrConfig, this.createRawSend(avrConfig))) {
        if (!registration.enabled(avrConfig)) {
          if (registration.disabledMessage) log.info(registration.disabledMessage);
          continue;
        }
        const entities = [registration.create()].flat() as uc.Entity[];
        for (const entity of entities) {
          this.registerEntity(entity, avrEntry);
        }
        registration.afterRegister?.(entities);
      }
    }
  }

  /** Re-register a single media player, e.g. after the volume scale was resolved from the AVR. */
  private registerMediaPlayer(avrConfig: AvrConfig): void {
    const avrEntry = buildEntityId(avrConfig.model, avrConfig.ip, avrConfig.zone);
    const registration = this.buildMediaPlayerRegistration(avrEntry, avrConfig, this.createRawSend(avrConfig));
    const entities = [registration.create()].flat() as uc.Entity[];
    for (const entity of entities) {
      this.registerEntity(entity, avrEntry);
    }
    registration.afterRegister?.(entities);
  }

  /**
   * Re-register a single input selector, e.g. after the input source list was resolved from the AVR.
   * Its options are part of the entity definition, so a plain attribute update would not reach a
   * manager that has not instantiated it yet.
   */
  private registerInputSelector(avrConfig: AvrConfig): void {
    if (avrConfig.inputSelectorOptions === null) {
      return;
    }
    const avrEntry = buildEntityId(avrConfig.model, avrConfig.ip, avrConfig.zone);
    const handler = this.inputSelectorHandler?.handle.bind(this.inputSelectorHandler);
    const entities = [this.entityRegistrar.createInputSelectorSelectEntity(avrEntry, handler)] as uc.Entity[];
    for (const entity of entities) {
      this.registerEntity(entity, avrEntry);
    }
  }

  /**
   * Recall a tuner preset slot: the station name from the select entity is mapped back to the slot
   * number the AVR reported it in, and sent as `PRS<slot in hex>`.
   *
   * The raw command is used on purpose: `PRS` is documented as "Preset No. 1-40 in hexadecimal", so
   * the value has to be exactly that hex slot. Presets are a property of the AVR, not of a zone, so
   * the command is sent for the main zone.
   */
  private async sendTunerPreset(eiscp: EiscpInstance, avrEntry: string, _zone: string, option: string): Promise<void> {
    const physicalAVR = physicalAvrIdFromEntityId(avrEntry);
    const preset = physicalAVR ? findTunerPresetByName(physicalAVR, option) : undefined;
    if (!preset) {
      log.warn("%s Tuner preset '%s' is not one of the stations the AVR reported, nothing sent", integrationName, option);
      throw new Error(`Unknown tuner preset: ${option}`);
    }

    const value = tunerPresetCommandValue(preset.slot);
    log.debug("%s [%s] Selecting tuner preset '%s': slot %d (band %s) -> PRS%s", integrationName, physicalAVR, preset.name, preset.slot, preset.band, value);
    await eiscp.raw(`PRS${value}`);
  }

  private registerEntity(entity: uc.Entity, avrEntry: string): void {
    // Re-registration (e.g. after a config save) must replace the existing entity so updated
    // definitions take effect — addAvailableEntity silently keeps the old entity otherwise.
    const availablePool = this.driver.getAvailableEntities?.();
    if (availablePool && availablePool.contains(entity.id)) {
      log.info("%s [%s] Re-registering existing entity with updated definition: %s", integrationName, avrEntry, entity.id);
      availablePool.removeEntity(entity.id);
    }
    this.driver.addAvailableEntity(entity);
    log.info("%s [%s] Entity registered: %s", integrationName, avrEntry, entity.id);
  }

  private createRawSend(avrConfig: AvrConfig): (cmd: string) => Promise<void> {
    const physicalAVR = buildPhysicalAvrId(avrConfig.model, avrConfig.ip);
    return async (cmd: string): Promise<void> => {
      const conn = this.connectionManager.getPhysicalConnection(physicalAVR);
      await conn?.eiscp?.raw(cmd);
    };
  }

  /**
   * Ask every configured AVR for its info document (NRI), once per AVR.
   *
   * This is a deliberate collection on every setup save: the AVR info carries the presets, inputs,
   * services and the maximum display volume, all of which can be relevant to a config the user just
   * changed. It deliberately bypasses the staleness check of the regular state query.
   */
  private async triggerAvrInfoQuery(): Promise<void> {
    const queried = new Set<string>();
    for (const avrConfig of this.config.avrs ?? []) {
      const physicalAVR = buildPhysicalAvrId(avrConfig.model, avrConfig.ip);
      if (queried.has(physicalAVR)) {
        continue;
      }
      queried.add(physicalAVR);

      const eiscp = this.connectionManager?.getPhysicalConnection(physicalAVR)?.eiscp;
      if (!eiscp) {
        log.debug("%s [%s] Not connected, cannot collect the AVR info", integrationName, buildEntityId(avrConfig.model, avrConfig.ip, avrConfig.zone));
        continue;
      }

      log.info("%s [%s] Collecting the AVR info after the config was saved...", integrationName, physicalAVR);
      try {
        await eiscp.command({ zone: avrConfig.zone, command: "avr-info", args: "query" });
      } catch (err) {
        log.warn("%s [%s] Failed to collect the AVR info after the config was saved:", integrationName, physicalAVR, err);
      }
    }
  }

  /**
   * Act on what the AVR reported about itself: resolve the volume scale and the input source list
   * that were left on "auto".
   *
   * NRI describes the AVR as a whole and is answered on the main zone, so the single reply resolves
   * every configured zone of that AVR — each zone reading the volume scale the AVR reported for it,
   * while the inputs it reports are shared by all zones of that AVR.
   *
   * A resolved volume scale replaces "auto" in the config and is saved, so it behaves exactly like
   * a value the user entered: it is never determined again. An input source list that the AVR cannot
   * provide is saved as "manual" for the same reason: there is nothing left to resolve. The entities
   * carrying these settings are re-registered, since both are part of their entity options, and the
   * runtime configs are refreshed so they take effect from the next update on.
   */
  private handleAvrInfo(entityId: string): void {
    const physicalAVR = physicalAvrIdFromEntityId(entityId);
    if (!physicalAVR) {
      return;
    }

    const zones = (this.config.avrs ?? []).filter((avrConfig) => buildPhysicalAvrId(avrConfig.model, avrConfig.ip) === physicalAVR);
    if (zones.length === 0) {
      return;
    }

    // The input list belongs to the AVR, not to a single zone: it is stored once, and every zone of
    // this AVR has to rebuild the entities that list the inputs. The same holds for the tuner
    // presets, which are also AVR-wide.
    let inputsChanged = false;
    let inputsDecided = false;
    let presetsChanged = false;
    let presetsCollected = false;

    const resolvedZones: AvrConfig[] = [];
    let configChanged = false;
    for (const avrConfig of zones) {
      const zoneEntry = buildEntityId(avrConfig.model, avrConfig.ip, avrConfig.zone);
      let changed = false;

      const volumeResolution = resolveAutoVolumeScale(avrConfig, entityId);
      if (volumeResolution) {
        if (ConfigManager.patchAvr(avrConfig.ip, avrConfig.zone, { volumeScale: volumeResolution.scale })) {
          log.debug("%s [%s] Volume scale 'auto' resolved to 0-%d: %s", integrationName, zoneEntry, volumeResolution.scale, volumeResolution.reason);
          configChanged = true;
          changed = true;
        } else {
          log.warn("%s [%s] Could not store the resolved volume scale 0-%d in the config", integrationName, zoneEntry, volumeResolution.scale);
        }
      }

      const inputResolution = resolveInputSourceList(avrConfig, entityId);
      if (inputResolution) {
        if (inputResolution.mode === INPUT_SOURCE_LIST_MANUAL) {
          // Nothing to collect: fall back to the hardcoded list and remember that, so the AVR is not
          // asked to resolve it again on every NRI reply.
          if (ConfigManager.patchAvr(avrConfig.ip, avrConfig.zone, { inputSourceList: INPUT_SOURCE_LIST_MANUAL })) {
            log.debug("%s [%s] Input source list 'auto' reset to 'manual': %s", integrationName, zoneEntry, inputResolution.reason);
            configChanged = true;
            changed = true;
          } else {
            log.warn("%s [%s] Could not store the input source list reset to 'manual' in the config", integrationName, zoneEntry);
          }
          if (!inputsDecided) {
            inputsDecided = true;
            inputsChanged = hasAvrInputs(physicalAVR);
            clearAvrInputs(physicalAVR);
          }
        } else if (inputResolution.inputs && !inputsDecided) {
          inputsDecided = true;
          inputsChanged = setAvrInputs(physicalAVR, inputResolution.inputs);
          if (inputsChanged) {
            // The inputs changed, so the entities listing them have to be rebuilt.
            log.debug("%s [%s] Input source list 'auto' resolved: %s", integrationName, zoneEntry, inputResolution.reason);
          }
        }
      }

      if (avrConfig.createTunerPresets !== false && !presetsCollected) {
        presetsCollected = true;
        presetsChanged = setTunerPresets(physicalAVR, listNamedPresets(entityId));
        if (presetsChanged) {
          const names = getTunerPresetNames(physicalAVR);
          log.debug("%s [%s] Tuner presets collected from the AVR: %d station(s): %s", integrationName, zoneEntry, names.length, names.join(", "));
        }
      }

      if (changed || inputsChanged || presetsChanged) {
        resolvedZones.push(avrConfig);
      }
    }

    if (resolvedZones.length === 0) {
      return;
    }

    this.config = configChanged ? ConfigManager.load() : this.config;
    for (const resolvedZone of resolvedZones) {
      // Register and refresh with the value from the saved config, since that is what is persisted now.
      const updatedConfig = this.config.avrs?.find((a) => a.ip === resolvedZone.ip && a.zone === resolvedZone.zone) ?? resolvedZone;
      this.registerMediaPlayer(updatedConfig);
      this.registerInputSelector(updatedConfig);
      if (presetsChanged) {
        // Only the option list changed, so the existing select entity is updated instead of replaced:
        // replacing it would drop the station the user has selected.
        this.updateTunerPresetsOptions(updatedConfig);
      }
      this.refreshZoneRuntimeConfig(updatedConfig);
    }
  }

  /** Push the stations the AVR reported into the existing tuner presets select entity. */
  private updateTunerPresetsOptions(avrConfig: AvrConfig): void {
    const avrEntry = buildEntityId(avrConfig.model, avrConfig.ip, avrConfig.zone);
    const options = this.entityRegistrar.getTunerPresetOptions(avrEntry);
    log.debug("%s [%s] Updating Tuner Presets select with %d station(s)", integrationName, avrEntry, options.length);
    this.driver.updateEntityAttributes(`${avrEntry}_tuner_presets`, { [SelectAttributes.Options]: options });
  }

  /** Push a refreshed per-zone runtime config into the live command handlers after a config change. */
  private refreshZoneRuntimeConfig(avrConfig: AvrConfig): void {
    const avrEntry = buildEntityId(avrConfig.model, avrConfig.ip, avrConfig.zone);
    const avrSpecificConfig = this.createAvrSpecificConfig(avrConfig);

    const instance = this.avrInstances.get(avrEntry);
    if (instance) {
      instance.config = avrConfig;
      instance.commandSender.updateConfig(avrSpecificConfig);
    }
    const physicalConnection = this.connectionManager.getPhysicalConnection(buildPhysicalAvrId(avrConfig.model, avrConfig.ip));
    physicalConnection?.commandReceiver.updateConfig(avrSpecificConfig);
  }

  private setupDriverEvents() {
    this.driver.on(uc.Events.Connect, async () => {
      log.info(`${integrationName} ===== CONNECT EVENT RECEIVED =====`);
      log.info(`${integrationName} Driver version: ${this.driverVersion}`);
      await this.handleConnect();
    });
    this.driver.on(uc.Events.EnterStandby, async () => {
      log.info(`${integrationName} ===== ENTER STANDBY EVENT RECEIVED =====`);
      log.info(`${integrationName} Remote entering standby, disconnecting AVR(s) to save battery...`);

      // Clear all reconnect timers
      this.connectionManager.cancelAllScheduledReconnections();

      // Disconnect all physical AVRs
      this.connectionManager.disconnectAll();

      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
    });
    this.driver.on(uc.Events.ExitStandby, async () => {
      log.info(`${integrationName} ===== EXIT STANDBY EVENT RECEIVED =====`);
      await this.handleConnect();
    });
  }

  private async queryAvrState(avrEntry: string, eiscp: EiscpDriver, context: string): Promise<void> {
    if (!eiscp.connected) {
      log.warn(`${integrationName} [${avrEntry}] Cannot query AVR state (${context}), not connected`);
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
        if (!isInitialQuery && !this.avrStateApi.isEntityOn(avrEntry)) {
          log.debug("%s [%s] Skipping query for zone in standby (%s)", integrationName, avrEntry, context);
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
    if (this.config.logLevel) setLogLevel(this.config.logLevel);

    const hasInstances = await this.connectCoordinator.connect(
      this.config,
      (avrConfig) => (eiscpInstance) => {
        const avrSpecificConfig = this.createAvrSpecificConfig(avrConfig);
        return new CommandReceiver(this.driver, avrSpecificConfig, eiscpInstance, this.avrStateApi, this.driverVersion, this.handleAvrInfo.bind(this));
      },
      (avrSpecificConfig, eiscp, commandReceiver) => new CommandSender(this.driver, avrSpecificConfig, eiscp, this.avrStateApi, commandReceiver)
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
      log.info("%s Entities subscribed: %s", integrationName, entityIds.join(", "));

      // Push source list for MediaPlayer entities
      for (const entityId of entityIds) {
        if (this.avrInstances.has(entityId)) {
          if (typeof this.driver.updateEntityAttributes === "function") {
            this.driver.updateEntityAttributes(entityId, { [uc.MediaPlayerAttributes.SourceList]: this.entityRegistrar.getInputSelectorOptions(entityId) });
          }
        }
        await this.subscriptionHandler.handle(entityId);
      }
    });

    this.driver.on(uc.Events.UnsubscribeEntities, async (entityIds: string[]) => {
      for (const entityId of entityIds) {
        log.info("%s [%s] Unsubscribed entity", integrationName, entityId);
      }
    });
  }

  // Use the sender class for command handling
  private async sharedCmdHandler(entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }): Promise<uc.StatusCodes> {
    // Get the AVR instance for this entity
    const instance = this.avrInstances.get(entity.id);
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

// Auto-instantiate when run directly (not when imported, e.g. in tests)
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const driver = new OnkyoDriver();
  driver.init();
}
