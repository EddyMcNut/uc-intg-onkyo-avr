import * as uc from "@unfoldedcircle/integration-api";
import { avrStateManager } from "./state.js";
import crypto from "crypto";
import { OnkyoConfig, buildEntityId } from "./configManager.js";
import { EiscpDriver } from "./eiscp.js";
import { SelectAttributes } from "./selectEntity.js";
import { getCompatibleListeningModes, detectAudioFormatType } from "./listeningModeFilters.js";
import { eiscpMappings } from "./eiscp-mappings.js";
import log from "./loggers.js";

const integrationName = "receiver:";

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

const ALBUM_ART = ["spotify", "deezer", "tidal", "amazonmusic", "dts-play-fi"];
const SONG_INFO = ["spotify", "deezer", "tidal", "amazonmusic", "dts-play-fi", "airplay"];

export class OnkyoCommandReceiver {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private eiscpInstance: EiscpDriver;
  private avrPreset: string = "unknown";
  private lastImageHash: string = "";
  private currentTrackId: string = "";
  private zone: string = "";
  private driverVersion: string;

  constructor(driver: uc.IntegrationAPI, config: OnkyoConfig, eiscpInstance: EiscpDriver, driverVersion: string = "unknown") {
    this.driver = driver;
    this.config = config;
    this.eiscpInstance = eiscpInstance;
    this.zone = this.config.avrs && this.config.avrs.length > 0 ? this.config.avrs[0].zone || "main" : "main";
    this.driverVersion = driverVersion;
  }

  private async getImageHash(url: string): Promise<string> {
    try {
      const res = await fetch(url);
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return crypto.createHash("md5").update(buffer).digest("hex");
    } catch (err) {
      log.warn("%s Failed to fetch or hash image: %s", integrationName, err);
      return "";
    }
  }

  async maybeUpdateImage(entityId: string) {
    if (!this.config.albumArtURL || this.config.albumArtURL === "na") return;

    let imageUrl = `http://${this.config.ip}/${this.config.albumArtURL}`;
    let newHash = await this.getImageHash(imageUrl);
    let attempts = 0;

    while (newHash === this.lastImageHash && attempts < 3) {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 500));
      newHash = await this.getImageHash(imageUrl);
    }
    if (newHash !== this.lastImageHash) {
      this.lastImageHash = newHash;
      let newURL = `${imageUrl}?hash=${newHash}`; // this dummy quuery param forces refresh in UCR3
      this.driver.updateEntityAttributes(entityId, {
        [uc.MediaPlayerAttributes.MediaImageUrl]: newURL
      });
    }
  }

  setupEiscpListener() {
    const nowPlaying: { station?: string; artist?: string; album?: string; title?: string } = {};

    this.eiscpInstance.on("error", (err: Error) => {
      log.error("%s eiscp error: %s", integrationName, err);
    });
    this.eiscpInstance.on(
      "data",
      async (avrUpdates: { command: string; argument: string | number | Record<string, string>; zone: string; iscpCommand: string; host: string; port: number; model: string }) => {
        const eventZone = avrUpdates.zone || "main";
        const entityId = buildEntityId(avrUpdates.model, avrUpdates.host, eventZone);

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
                  [uc.SensorAttributes.Value]: "no data",
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
            log.info("%s [%s] volume set to: %s", integrationName, entityId, sliderValue);

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
            
            // Reset track info on source change to ensure fresh updates
            this.currentTrackId = "";
            nowPlaying.title = undefined;
            nowPlaying.artist = undefined;
            nowPlaying.album = undefined;
            nowPlaying.station = undefined;
            
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
              log.info("%s [%s] listening-mode '%s', re-query...", integrationName, entityId, listeningMode);
              this.eiscpInstance.command("listening-mode query");
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
          case "IFA": {
            const arg = avrUpdates.argument as Record<string, string> | undefined;
            const audioInputValue = arg?.audioInputValue ?? "";
            const audioOutputValue = arg?.audioOutputValue ?? "";

            const audioInputSensorId = `${entityId}_audio_input_sensor`;
            const audioOutputSensorId = `${entityId}_audio_output_sensor`;

            if (audioInputValue) {
              this.driver.updateEntityAttributes(audioInputSensorId, {
                [uc.SensorAttributes.State]: uc.SensorStates.On,
                [uc.SensorAttributes.Value]: audioInputValue
              });

              // Detect and track audio format type
              const audioFormatType = detectAudioFormatType(audioInputValue);
              const formatChanged = avrStateManager.setAudioFormat(entityId, audioFormatType, this.driver);

              // If audio format changed, update listening mode select entity options
              if (formatChanged) {
                const selectEntityId = `${entityId}_listening_mode`;
                const compatibleModes = getCompatibleListeningModes(audioFormatType);
                
                if (compatibleModes) {
                  // Get all listening modes from mappings
                  const lmdMappings = eiscpMappings.value_mappings.LMD;
                  const excludeKeys = ["up", "down", "movie", "music", "game", "query"];
                  const allModes = Object.keys(lmdMappings).filter(key => !excludeKeys.includes(key));
                  
                  // Filter to compatible modes and sort alphabetically
                  const filteredOptions = allModes.filter(mode => compatibleModes.includes(mode)).sort();
                  
                  log.info("%s [%s] updating listening mode options for format: %s (%d modes)", integrationName, entityId, audioFormatType, filteredOptions.length);
                  
                  // Update select entity with filtered options
                  // TypeScript doesn't recognize that options can be an array, but the API supports it
                  this.driver.updateEntityAttributes(selectEntityId, {
                    [SelectAttributes.Options]: filteredOptions as any
                  });
                }
              }
            }

            if (audioOutputValue) {
              this.driver.updateEntityAttributes(audioOutputSensorId, {
                [uc.SensorAttributes.State]: uc.SensorStates.On,
                [uc.SensorAttributes.Value]: audioOutputValue
              });
            }

            // log.info("%s [%s] IFA parsed input: %s | output: %s", integrationName, entityId, audioInputValue, audioOutputValue);
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
            // log.info("%s [%s] IFV parsed input: %s | output: %s", integrationName, entityId, videoInputValue, videoOutputValue);
            break;
          }
          case "DSN": {
            avrStateManager.setSource(entityId, "dab", this.eiscpInstance, eventZone, this.driver);
            nowPlaying.station = avrUpdates.argument.toString();
            nowPlaying.artist = "DAB Radio";
            log.info("%s [%s] DAB station set to: %s", integrationName, entityId, avrUpdates.argument.toString());
            break;
          }
          case "FLD": {
            const frontPanelText = avrUpdates.argument.toString();
            const currentSource = avrStateManager.getSource(entityId);
            const frontPanelDisplaySensorId = `${entityId}_front_panel_display_sensor`;

            // Handle FM-specific metadata
            if (currentSource === "fm") {
              nowPlaying.station = frontPanelText;
              nowPlaying.artist = "FM Radio";
            }

            // For NET source, only update if subSource changed (prevents scroll updates)
            if (currentSource === "net") {
              if (avrStateManager.getSubSource(entityId) !== frontPanelText.toLowerCase()) {
                avrStateManager.setSubSource(entityId, frontPanelText, this.eiscpInstance, eventZone, this.driver);
                this.driver.updateEntityAttributes(frontPanelDisplaySensorId, {
                  [uc.SensorAttributes.State]: uc.SensorStates.On,
                  [uc.SensorAttributes.Value]: frontPanelText
                });
                // Query metadata when switching to a new network service
                const hasSongInfo = SONG_INFO.some(name => frontPanelText.toLowerCase().includes(name));
                if (hasSongInfo) {
                  this.eiscpInstance.raw("NATQSTN"); // Query title
                  this.eiscpInstance.raw("NTIQSTN"); // Query artist  
                  this.eiscpInstance.raw("NALQSTN"); // Query album
                }
              }
            } else {
              // For all other sources, always update the sensor
              this.driver.updateEntityAttributes(frontPanelDisplaySensorId, {
                [uc.SensorAttributes.State]: uc.SensorStates.On,
                [uc.SensorAttributes.Value]: frontPanelText
              });
            }
            break;
          }
          case "NTM": {
            let [position, duration] = avrUpdates.argument.toString().split("/");
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.MediaPosition]: position || 0,
              [uc.MediaPlayerAttributes.MediaDuration]: duration || 0
            });
            break;
          }
          case "metadata": {
            const currentSubSource = avrStateManager.getSubSource(entityId);
            const hasSongInfo = SONG_INFO.some(name => currentSubSource.includes(name));
            if (hasSongInfo) {
              if (typeof avrUpdates.argument === "object" && avrUpdates.argument !== null) {
                nowPlaying.title = (avrUpdates.argument as Record<string, string>).title || "unknown";
                nowPlaying.album = (avrUpdates.argument as Record<string, string>).album || "unknown";
                nowPlaying.artist = (avrUpdates.argument as Record<string, string>).artist || "unknown";
              }
            }
            break;
          }
          default:
            break;
        }
        const entitySource = avrStateManager.getSource(entityId);
        const entitySubSource = avrStateManager.getSubSource(entityId);
        switch (entitySource) {
          case "net":
            let trackId = `${nowPlaying.title}|${nowPlaying.album}|${nowPlaying.artist}`;
            if (trackId !== this.currentTrackId) {
              this.currentTrackId = trackId;
              this.driver.updateEntityAttributes(entityId, {
                [uc.MediaPlayerAttributes.MediaArtist]: nowPlaying.artist + " (" + nowPlaying.album + ")" || "unknown",
                [uc.MediaPlayerAttributes.MediaTitle]: nowPlaying.title || "unknown",
                [uc.MediaPlayerAttributes.MediaAlbum]: nowPlaying.album || "unknown"
              });
              const hasAlbumArt = ALBUM_ART.some(name => entitySubSource.includes(name));
              if (hasAlbumArt) {
                await this.maybeUpdateImage(entityId);
              }else {
                // Clear image URL if source does not support album art
                this.driver.updateEntityAttributes(entityId, {
                  [uc.MediaPlayerAttributes.MediaImageUrl]: ""
                });
              }
            }
            break;
          case "tuner":
          case "fm":
          case "dab":
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.MediaArtist]: nowPlaying.artist || "unknown",
              [uc.MediaPlayerAttributes.MediaTitle]: nowPlaying.station || "unknown",
              [uc.MediaPlayerAttributes.MediaAlbum]: "",
              [uc.MediaPlayerAttributes.MediaImageUrl]: "",
              [uc.MediaPlayerAttributes.MediaPosition]: 0,
              [uc.MediaPlayerAttributes.MediaDuration]: 0
            });
            break;
          default:
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.MediaArtist]: "",
              [uc.MediaPlayerAttributes.MediaTitle]: "",
              [uc.MediaPlayerAttributes.MediaAlbum]: "",
              [uc.MediaPlayerAttributes.MediaImageUrl]: "",
              [uc.MediaPlayerAttributes.MediaPosition]: 0,
              [uc.MediaPlayerAttributes.MediaDuration]: 0
            });
            break;
        }
      }
    );
  }
}
