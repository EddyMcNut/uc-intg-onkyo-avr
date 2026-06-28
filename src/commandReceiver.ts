import * as uc from "@unfoldedcircle/integration-api";
import { SelectAttributes } from "@unfoldedcircle/integration-api";
import { OnkyoConfig, buildEntityId } from "./configManager.js";
import { EiscpDriver } from "./eiscp.js";
import { getCompatibleListeningModes } from "./listeningModeFilters.js";
import { classifyAudioFormat, formatAudioTypeName } from "./audioFormatClassifier.js";
import { eiscpMappings } from "./eiscp-mappings.js";
import log, { getLogLevel } from "./loggers.js";
import { ZoneAgnosticUpdateProcessor } from "./zoneAgnosticUpdateProcessor.js";
import { SENSOR_SUFFIXES } from "./sensorSuffixes.js";
import { AV_INFO_REQUERY_DELAY } from "./constants.js";
import type { AvrStateApi } from "./types.js";

const integrationName = "commandReceiver:";

type AvrUpdateEvent = {
  command: string;
  argument: string | number | Record<string, string>;
  zone: string;
  iscpCommand: string;
  host: string;
  port: number;
  model: string;
};

type ZoneAgnosticHandler = (avrUpdates: AvrUpdateEvent, entityId: string, eventZone: string) => Promise<void>;

// Extract metadata from union argument type for clarity; returns null if not an object
function extractMetadataArgument(arg: string | number | Record<string, string>): Record<string, string> | null {
  return typeof arg === "object" && arg !== null ? (arg as Record<string, string>) : null;
}

export class CommandReceiver {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private eiscpInstance: EiscpDriver;
  private avrPreset: string = "unknown";
  private driverVersion: string;
  private avrStateApi: AvrStateApi;
  private zoneAgnosticProcessor: ZoneAgnosticUpdateProcessor;
  private zoneAgnosticHandlers: Record<string, ZoneAgnosticHandler>;
  private avInfoRequeryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(driver: uc.IntegrationAPI, config: OnkyoConfig, eiscpInstance: EiscpDriver, avrStateApi: AvrStateApi, driverVersion: string = "unknown") {
    this.driver = driver;
    this.config = config;
    this.eiscpInstance = eiscpInstance;
    this.avrStateApi = avrStateApi;
    this.driverVersion = driverVersion;
    this.zoneAgnosticProcessor = new ZoneAgnosticUpdateProcessor(driver, config, eiscpInstance, avrStateApi);
    this.zoneAgnosticHandlers = {
      IFA: async (avrUpdates, entityId, eventZone) => {
        // IFA handler invokes audio format callback for listening mode updates when format changes
        await this.zoneAgnosticProcessor.handleIfa(entityId, eventZone, avrUpdates.argument as Record<string, string> | undefined, async (zoneEntityId, audioInputValue) => {
          await this.updateListeningModeOptionsForAudioFormat(zoneEntityId, audioInputValue);
        });
        const audioInputValue = (avrUpdates.argument as Record<string, string>)?.audioInputValue ?? "";
        this.maybeScheduleAvInfoRequery(audioInputValue, eventZone);
      },
      DSN: async (avrUpdates, entityId, eventZone) => {
        await this.zoneAgnosticProcessor.handleDsn(entityId, avrUpdates.argument.toString(), eventZone);
      },
      NLT: async (avrUpdates, entityId, eventZone) => {
        await this.zoneAgnosticProcessor.handleNlt(entityId, avrUpdates.argument.toString(), eventZone);
      },
      NST: async (avrUpdates, entityId) => {
        await this.zoneAgnosticProcessor.handleNst(entityId, avrUpdates.argument.toString());
      },
      NLT_CONTEXT: async (avrUpdates, entityId) => {
        await this.zoneAgnosticProcessor.handleNltContext(entityId, avrUpdates.argument.toString());
      },
      NLS: async (avrUpdates, entityId) => {
        await this.zoneAgnosticProcessor.handleNls(entityId, avrUpdates.argument.toString());
      },
      NLA: async (avrUpdates, entityId) => {
        await this.zoneAgnosticProcessor.handleNla(entityId, avrUpdates.argument.toString());
      },
      FLD: async (avrUpdates, entityId, eventZone) => {
        await this.zoneAgnosticProcessor.handleFld(entityId, avrUpdates.argument.toString(), eventZone);
      },
      NTM: async (avrUpdates, entityId) => {
        await this.zoneAgnosticProcessor.handleNtm(entityId, avrUpdates.argument.toString());
      },
      metadata: async (avrUpdates, entityId) => {
        const metadata = extractMetadataArgument(avrUpdates.argument);
        await this.zoneAgnosticProcessor.handleMetadata(entityId, metadata);
      }
    };
  }

  public updateConfig(config: OnkyoConfig): void {
    this.config = config;
    this.zoneAgnosticProcessor.updateConfig(config);
  }

  public abortTuneInPreload(entityId: string): boolean {
    return this.zoneAgnosticProcessor.abortTuneInPreload(entityId);
  }

  private async updateListeningModeOptionsForAudioFormat(zoneEntityId: string, audioInputValue: string): Promise<void> {
    const audioFormatType = formatAudioTypeName(classifyAudioFormat(audioInputValue));
    const formatChanged = this.avrStateApi.setAudioFormat(zoneEntityId, audioFormatType);

    if (!formatChanged) {
      return;
    }

    const selectEntityId = `${zoneEntityId}_listening_mode`;
    const compatibleModes = getCompatibleListeningModes(audioFormatType);
    if (!compatibleModes) {
      return;
    }

    const cfgAvr = this.config.avrs ? this.config.avrs.find((a) => buildEntityId(a.model, a.ip, a.zone) === zoneEntityId) : undefined;
    if (cfgAvr && Array.isArray(cfgAvr.listeningModeOptions) && cfgAvr.listeningModeOptions.length > 0) {
      log.info("%s [%s] using user-configured listeningModeOptions (%d entries)", integrationName, zoneEntityId, cfgAvr.listeningModeOptions.length);
      this.driver.updateEntityAttributes(selectEntityId, {
        [SelectAttributes.Options]: cfgAvr.listeningModeOptions
      });
      return;
    }

    const lmdMappings = eiscpMappings.value_mappings.LMD;
    const excludeKeys = ["up", "down", "movie", "music", "game", "query"];
    const allModes = Object.keys(lmdMappings).filter((key) => !excludeKeys.includes(key));
    const filteredOptions = allModes.filter((mode) => compatibleModes.includes(mode)).sort();

    log.info("%s [%s] updating listening mode options for format: %s (%d modes)", integrationName, zoneEntityId, audioFormatType, filteredOptions.length);
    this.driver.updateEntityAttributes(selectEntityId, {
      [SelectAttributes.Options]: filteredOptions
    });
  }

  // Schedule a delayed re-query so the sensor reflects the final stable value instead of staying stuck at UNKNOWN. Cancels the timer if a known format arrives before it fires.
  private maybeScheduleAvInfoRequery(audioInputValue: string, zone: string): void {
    const lower = audioInputValue.toLowerCase();
    const isTransient = lower === "unknown" || lower === "n/a" || lower === "---" || lower === "";

    if (!isTransient) {
      if (this.avInfoRequeryTimer) {
        clearTimeout(this.avInfoRequeryTimer);
        this.avInfoRequeryTimer = null;
      }
      return;
    }

    if (this.avInfoRequeryTimer) {
      clearTimeout(this.avInfoRequeryTimer);
    }

    this.avInfoRequeryTimer = setTimeout(async () => {
      this.avInfoRequeryTimer = null;
      try {
        log.info("%s [%s] re-querying AV info after transient format '%s'", integrationName, zone, audioInputValue);
        await this.eiscpInstance.command({ zone, command: "audio-information", args: "query" });
        await this.eiscpInstance.command({ zone, command: "video-information", args: "query" });
      } catch (err) {
        log.warn("%s Failed to re-query AV info after transient format: %s", integrationName, err);
      }
    }, AV_INFO_REQUERY_DELAY);
  }

  private async dispatchZoneAgnosticCommand(avrUpdates: AvrUpdateEvent, entityId: string, eventZone: string): Promise<boolean> {
    const handler = this.zoneAgnosticHandlers[avrUpdates.command];
    if (handler) {
      await handler(avrUpdates, entityId, eventZone);
      return true;
    }

    if (ZoneAgnosticUpdateProcessor.isZoneAgnosticCommand(avrUpdates.command)) {
      log.warn("%s [%s] command '%s' is declared zone-agnostic but has no dispatch handler", integrationName, entityId, avrUpdates.command);
      return true;
    }

    return false;
  }

  async maybeUpdateImage(entityId: string, force: boolean = false) {
    await this.zoneAgnosticProcessor.maybeUpdateImage(entityId, force);
  }

  private async handleSystemPower(avrUpdates: AvrUpdateEvent, entityId: string): Promise<void> {
    const powerState = avrUpdates.argument === "on" ? uc.MediaPlayerStates.On : uc.MediaPlayerStates.Standby;
    log.info("** Onkyo AVR custom integration version %s **", this.driverVersion);
    log.info("%s [%s] power set to: %s (log level: %s)", integrationName, entityId, powerState, getLogLevel());
    this.avrStateApi.setPowerState(entityId, avrUpdates.argument as string, this.driver);
    if (avrUpdates.argument !== "on") {
      for (const suffix of SENSOR_SUFFIXES) {
        this.driver.updateEntityAttributes(`${entityId}${suffix}`, {
          [uc.SensorAttributes.Value]: "no data"
        });
      }
    }
  }

  private async handleAudioMuting(avrUpdates: AvrUpdateEvent, entityId: string): Promise<void> {
    this.driver.updateEntityAttributes(entityId, {
      [uc.MediaPlayerAttributes.Muted]: avrUpdates.argument === "on"
    });
    const muteState = avrUpdates.argument === "on" ? "ON" : "OFF";
    this.driver.updateEntityAttributes(`${entityId}_mute_sensor`, {
      [uc.SensorAttributes.State]: uc.SensorStates.On,
      [uc.SensorAttributes.Value]: muteState
    });
    log.info("%s [%s] audio-muting set to: %s", integrationName, entityId, muteState);
  }

  private async handleVolume(avrUpdates: AvrUpdateEvent, entityId: string): Promise<void> {
    const eiscpValue = Number(avrUpdates.argument);
    const volumeScale = this.config.volumeScale ?? 100;
    const adjustVolumeDispl = this.config.adjustVolumeDispl ?? true;
    const volumeDisplay = String(this.config.volumeDisplay ?? "absolute").toLowerCase() === "relative" ? "relative" : "absolute";
    const avrDisplayValue = adjustVolumeDispl ? Math.round(eiscpValue / 2) : eiscpValue;
    const scaledValue = Math.round((avrDisplayValue * 100) / volumeScale);
    const volumeSensorValue = volumeDisplay === "relative" ? scaledValue - 82 : scaledValue;

    this.driver.updateEntityAttributes(entityId, {
      [uc.MediaPlayerAttributes.Volume]: volumeSensorValue
    });
    this.avrStateApi.setVolume(entityId, eiscpValue);
    this.driver.updateEntityAttributes(`${entityId}_volume_sensor`, {
      [uc.SensorAttributes.State]: uc.SensorStates.On,
      [uc.SensorAttributes.Value]: volumeDisplay === "relative" ? (avrDisplayValue <= 0 ? "-oo dB" : `${volumeSensorValue} dB`) : volumeSensorValue
    });
  }

  private async handlePreset(avrUpdates: AvrUpdateEvent, entityId: string): Promise<void> {
    this.avrPreset = avrUpdates.argument.toString();
    log.info("%s [%s] preset set to: %s", integrationName, entityId, this.avrPreset);
  }

  private async handleInputSelector(avrUpdates: AvrUpdateEvent, entityId: string, eventZone: string): Promise<void> {
    const source = avrUpdates.argument.toString().split(",")[0];
    this.avrStateApi.setSource(entityId, source, this.eiscpInstance, eventZone, this.driver);
    this.driver.updateEntityAttributes(entityId, {
      [uc.MediaPlayerAttributes.Source]: source
    });
    log.info("%s [%s] input-selector (source) set to: %s", integrationName, entityId, source);
    this.driver.updateEntityAttributes(`${entityId}_input_selector`, {
      [SelectAttributes.CurrentOption]: source
    });
    this.zoneAgnosticProcessor.resetZone(entityId);
    await this.zoneAgnosticProcessor.renderEntity(entityId);
    if (source === "dab") {
      this.eiscpInstance.raw("DSNQSTN");
    } else if (source === "fm") {
      this.eiscpInstance.raw("FLDQSTN");
    }
    this.driver.updateEntityAttributes(`${entityId}_source_sensor`, {
      [uc.SensorAttributes.State]: uc.SensorStates.On,
      [uc.SensorAttributes.Value]: source.toUpperCase()
    });
  }

  private async handleListeningMode(avrUpdates: AvrUpdateEvent, entityId: string, eventZone: string): Promise<void> {
    const listeningMode = Array.isArray(avrUpdates.argument) ? avrUpdates.argument[0] : (avrUpdates.argument as string);
    if (listeningMode === "undefined" || listeningMode === "unknown") {
      log.info("%s [%s] listening-mode '%s', keeping current value (no re-query)", integrationName, entityId, listeningMode);
      return;
    }
    log.info("%s [%s] listening-mode set to: %s", integrationName, entityId, listeningMode);
    this.driver.updateEntityAttributes(`${entityId}_listening_mode`, {
      [SelectAttributes.CurrentOption]: listeningMode
    });
    log.info("%s [%s] querying AV info after listening-mode update", integrationName, entityId);
    this.eiscpInstance.command({ zone: eventZone, command: "audio-information", args: "query" }).catch((err) => {
      log.debug("%s [%s] audio-information query failed: %s", integrationName, entityId, err instanceof Error ? err.message : String(err));
    });
    this.eiscpInstance.command({ zone: eventZone, command: "video-information", args: "query" }).catch((err) => {
      log.debug("%s [%s] video-information query failed: %s", integrationName, entityId, err instanceof Error ? err.message : String(err));
    });
  }

  private async handleIFV(avrUpdates: AvrUpdateEvent, entityId: string): Promise<void> {
    const arg = avrUpdates.argument as Record<string, string> | undefined;
    const videoInputValue = arg?.videoInputValue ?? "";
    const videoOutputValue = arg?.videoOutputValue ?? "";
    const videoOutputDisplay = arg?.outputDisplay ?? "";
    if (videoInputValue) {
      this.driver.updateEntityAttributes(`${entityId}_video_input_sensor`, {
        [uc.SensorAttributes.State]: uc.SensorStates.On,
        [uc.SensorAttributes.Value]: videoInputValue
      });
    }
    if (videoOutputValue) {
      this.driver.updateEntityAttributes(`${entityId}_video_output_sensor`, {
        [uc.SensorAttributes.State]: uc.SensorStates.On,
        [uc.SensorAttributes.Value]: videoOutputValue
      });
    }
    if (videoOutputDisplay) {
      this.driver.updateEntityAttributes(`${entityId}_output_display_sensor`, {
        [uc.SensorAttributes.State]: uc.SensorStates.On,
        [uc.SensorAttributes.Value]: videoOutputDisplay
      });
    }
  }

  private readonly eventHandlers: Record<string, (avrUpdates: AvrUpdateEvent, entityId: string, eventZone: string) => Promise<void>> = {
    "system-power": (u, e) => this.handleSystemPower(u, e),
    "audio-muting": (u, e) => this.handleAudioMuting(u, e),
    volume: (u, e) => this.handleVolume(u, e),
    preset: (u, e) => this.handlePreset(u, e),
    "input-selector": (u, e, z) => this.handleInputSelector(u, e, z),
    "listening-mode": (u, e, z) => this.handleListeningMode(u, e, z),
    IFV: (u, e) => this.handleIFV(u, e)
  };

  setupEiscpListener() {
    this.eiscpInstance.on("error", (err: Error) => {
      log.error("%s eiscp error: %s", integrationName, err);
    });
    this.eiscpInstance.on("data", async (avrUpdates: AvrUpdateEvent) => {
      const eventZone = avrUpdates.zone || "main";
      const entityId = buildEntityId(avrUpdates.model, avrUpdates.host, eventZone);

      const handler = this.eventHandlers[avrUpdates.command];
      if (handler) {
        await handler(avrUpdates, entityId, eventZone);
        await this.zoneAgnosticProcessor.renderEntity(entityId);
        return;
      }

      if (await this.dispatchZoneAgnosticCommand(avrUpdates, entityId, eventZone)) {
        await this.zoneAgnosticProcessor.renderEntity(entityId);
        return;
      }

      log.debug("%s [%s] Received unknown command type: '%s' with argument: %s", integrationName, entityId, avrUpdates.command, avrUpdates.argument);
      await this.zoneAgnosticProcessor.renderEntity(entityId);
    });
  }

  // Cleanup method to ensure no orphaned timers leak resources
  public cleanup(): void {
    if (this.avInfoRequeryTimer) {
      clearTimeout(this.avInfoRequeryTimer);
      this.avInfoRequeryTimer = null;
    }
  }
}
