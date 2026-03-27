import * as uc from "@unfoldedcircle/integration-api";
import { avrStateManager } from "./avrState.js";
import { OnkyoConfig, buildEntityId } from "./configManager.js";
import { EiscpDriver } from "./eiscp.js";
import { SelectAttributes } from "./selectEntity.js";
import { getCompatibleListeningModes, detectAudioFormatType } from "./listeningModeFilters.js";
import { eiscpMappings } from "./eiscp-mappings.js";
import log from "./loggers.js";
import { ZoneAgnosticUpdateProcessor } from "./zoneAgnosticUpdateProcessor.js";

const integrationName = "commandReceiver:";

const SENSOR_SUFFIXES = [
  "_mute_sensor",
  "_volume_sensor",
  "_source_sensor",
  "_audio_input_sensor",
  "_audio_output_sensor",
  "_video_input_sensor",
  "_video_output_sensor",
  "_output_display_sensor",
  "_front_panel_display_sensor"
];

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

export class CommandReceiver {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private eiscpInstance: EiscpDriver;
  private avrPreset: string = "unknown";
  private zone: string = "";
  private driverVersion: string;
  private zoneAgnosticProcessor: ZoneAgnosticUpdateProcessor;
  private zoneAgnosticHandlers: Record<string, ZoneAgnosticHandler>;

  constructor(driver: uc.IntegrationAPI, config: OnkyoConfig, eiscpInstance: EiscpDriver, driverVersion: string = "unknown") {
    this.driver = driver;
    this.config = config;
    this.eiscpInstance = eiscpInstance;
    this.zone = this.config.avrs && this.config.avrs.length > 0 ? this.config.avrs[0].zone || "main" : "main";
    this.driverVersion = driverVersion;
    this.zoneAgnosticProcessor = new ZoneAgnosticUpdateProcessor(driver, config, eiscpInstance);
    this.zoneAgnosticHandlers = {
      IFA: async (avrUpdates, entityId, eventZone) => {
        await this.zoneAgnosticProcessor.handleIfa(entityId, eventZone, avrUpdates.argument as Record<string, string> | undefined, async (zoneEntityId, audioInputValue) => {
          await this.updateListeningModeOptionsForAudioFormat(zoneEntityId, audioInputValue);
        });
      },
      DSN: async (avrUpdates, entityId, eventZone) => {
        await this.zoneAgnosticProcessor.handleDsn(entityId, avrUpdates.argument.toString(), eventZone);
      },
      NLT: async (avrUpdates, entityId, eventZone) => {
        await this.zoneAgnosticProcessor.handleNlt(entityId, avrUpdates.argument.toString(), eventZone);
      },
      FLD: async (avrUpdates, entityId, eventZone) => {
        await this.zoneAgnosticProcessor.handleFld(entityId, avrUpdates.argument.toString(), eventZone);
      },
      NTM: async (avrUpdates, entityId) => {
        await this.zoneAgnosticProcessor.handleNtm(entityId, avrUpdates.argument.toString());
      },
      metadata: async (avrUpdates, entityId) => {
        const metadata = typeof avrUpdates.argument === "object" && avrUpdates.argument !== null ? (avrUpdates.argument as Record<string, string>) : null;
        await this.zoneAgnosticProcessor.handleMetadata(entityId, metadata);
      }
    };
  }

  private async updateListeningModeOptionsForAudioFormat(zoneEntityId: string, audioInputValue: string): Promise<void> {
    const audioFormatType = detectAudioFormatType(audioInputValue);
    const formatChanged = avrStateManager.setAudioFormat(zoneEntityId, audioFormatType);

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

  /** Get config for external access (e.g., from avrState) */
  public getConfig(): OnkyoConfig {
    return this.config;
  }

  async maybeUpdateImage(entityId: string, force: boolean = false) {
    await this.zoneAgnosticProcessor.maybeUpdateImage(entityId, force);
  }

  setupEiscpListener() {
    this.eiscpInstance.on("error", (err: Error) => {
      log.error("%s eiscp error: %s", integrationName, err);
    });
    this.eiscpInstance.on(
      "data",
      async (avrUpdates: AvrUpdateEvent) => {
        const eventZone = avrUpdates.zone || "main";
        const entityId = buildEntityId(avrUpdates.model, avrUpdates.host, eventZone);

        if (await this.dispatchZoneAgnosticCommand(avrUpdates, entityId, eventZone)) {
          await this.zoneAgnosticProcessor.renderEntity(entityId, false);
          return;
        }

        switch (avrUpdates.command) {
          case "system-power": {
            const powerState = avrUpdates.argument === "on" ? uc.MediaPlayerStates.On : uc.MediaPlayerStates.Standby;
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.State]: powerState
            });
            log.info("** Onkyo AVR custom integration version %s **", this.driverVersion);
            log.info("%s [%s] power set to: %s", integrationName, entityId, powerState);

            // Track power state in state manager
            avrStateManager.setPowerState(entityId, avrUpdates.argument as string);

            // When AVR is off, set all sensor states to standby
            if (avrUpdates.argument !== "on") {
              for (const suffix of SENSOR_SUFFIXES) {
                this.driver.updateEntityAttributes(`${entityId}${suffix}`, {
                  [uc.SensorAttributes.Value]: "no data"
                });
              }
            }
            break;
          }
          case "audio-muting": {
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.Muted]: avrUpdates.argument === "on" ? true : false
            });
            const muteSensorId = `${entityId}_mute_sensor`;
            const muteState = avrUpdates.argument === "on" ? "ON" : "OFF";
            this.driver.updateEntityAttributes(muteSensorId, {
              [uc.SensorAttributes.State]: uc.SensorStates.On,
              [uc.SensorAttributes.Value]: muteState
            });
            log.info("%s [%s] audio-muting set to: %s", integrationName, entityId, muteState);
            break;
          }
          case "volume": {
            // EISCP protocol: 0-200 or 0-100 depending on model, AVR display: 0-volumeScale, Remote slider: 0-100
            const eiscpValue = Number(avrUpdates.argument);
            const volumeScale = this.config.volumeScale || 100;
            const adjustVolumeDispl = this.config.adjustVolumeDispl ?? true;

            // Convert: EISCP → AVR display scale (÷2 for 0.5 dB steps if enabled) → slider
            const avrDisplayValue = adjustVolumeDispl ? Math.round(eiscpValue / 2) : eiscpValue;
            const sliderValue = Math.round((avrDisplayValue * 100) / volumeScale);

            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.Volume]: sliderValue
            });
            avrStateManager.setVolume(entityId, eiscpValue);
            // log.info("%s [%s] volume set to: %s", integrationName, entityId, sliderValue);

            // Update volume sensor
            const volumeSensorId = `${entityId}_volume_sensor`;
            this.driver.updateEntityAttributes(volumeSensorId, {
              [uc.SensorAttributes.State]: uc.SensorStates.On,
              [uc.SensorAttributes.Value]: sliderValue
            });
            break;
          }
          case "preset": {
            this.avrPreset = avrUpdates.argument.toString();
            log.info("%s [%s] preset set to: %s", integrationName, entityId, this.avrPreset);
            // this.eiscpInstance.command("input-selector query");
            break;
          }
          case "input-selector": {
            let source = avrUpdates.argument.toString().split(",")[0];
            avrStateManager.setSource(entityId, source, this.eiscpInstance, eventZone, this.driver);
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.Source]: source
            });
            log.info("%s [%s] input-selector (source) set to: %s", integrationName, entityId, source);
            // Mirror the current value into the input-selector select entity
            const inputSelectorEntityId = `${entityId}_input_selector`;
            this.driver.updateEntityAttributes(inputSelectorEntityId, {
              [SelectAttributes.CurrentOption]: source
            });

            // Reset zone metadata on source change to avoid stale media details.
            this.zoneAgnosticProcessor.resetZone(entityId);
            await this.zoneAgnosticProcessor.renderEntity(entityId, true);

            switch (source) {
              case "dab":
                this.eiscpInstance.raw("DSNQSTN");
                break;
              case "fm":
                this.eiscpInstance.raw("RDS01");
                break;
              default:
                break;
            }
            // Update source sensor
            const sourceSensorId = `${entityId}_source_sensor`;
            this.driver.updateEntityAttributes(sourceSensorId, {
              [uc.SensorAttributes.State]: uc.SensorStates.On,
              [uc.SensorAttributes.Value]: source.toUpperCase()
            });
            break;
          }
          case "listening-mode": {
            // Handle both string and array (take first element if array)
            const listeningMode = Array.isArray(avrUpdates.argument) ? avrUpdates.argument[0] : (avrUpdates.argument as string);
            if (listeningMode === "undefined" || listeningMode === "unknown") {
              log.info("%s [%s] listening-mode '%s', keeping current value (no re-query)", integrationName, entityId, listeningMode);
            } else {
              log.info("%s [%s] listening-mode set to: %s", integrationName, entityId, listeningMode);
              // Update the listening mode select entity
              const selectEntityId = `${entityId}_listening_mode`;
              this.driver.updateEntityAttributes(selectEntityId, {
                [SelectAttributes.CurrentOption]: listeningMode
              });
            }
            break;
          }
          case "IFV": {
            const arg = avrUpdates.argument as Record<string, string> | undefined;
            const videoInputValue = arg?.videoInputValue ?? "";
            const videoOutputValue = arg?.videoOutputValue ?? "";
            const videoOutputDisplay = arg?.outputDisplay ?? "";

            const videoInputSensorId = `${entityId}_video_input_sensor`;
            const videoOutputSensorId = `${entityId}_video_output_sensor`;
            const videoOutputDisplaySensorId = `${entityId}_output_display_sensor`;

            if (videoInputValue) {
              this.driver.updateEntityAttributes(videoInputSensorId, {
                [uc.SensorAttributes.State]: uc.SensorStates.On,
                [uc.SensorAttributes.Value]: videoInputValue
              });
            }

            if (videoOutputValue) {
              this.driver.updateEntityAttributes(videoOutputSensorId, {
                [uc.SensorAttributes.State]: uc.SensorStates.On,
                [uc.SensorAttributes.Value]: videoOutputValue
              });
            }

            if (videoOutputDisplay) {
              this.driver.updateEntityAttributes(videoOutputDisplaySensorId, {
                [uc.SensorAttributes.State]: uc.SensorStates.On,
                [uc.SensorAttributes.Value]: videoOutputDisplay
              });
            }
            break;
          }
          default:
            break;
        }
        await this.zoneAgnosticProcessor.renderEntity(entityId, false);
      }
    );
  }
}