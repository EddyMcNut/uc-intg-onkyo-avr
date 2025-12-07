import * as uc from "@unfoldedcircle/integration-api";
import { avrCurrentSource, setAvrCurrentSource } from "./state.js";
import crypto from "crypto";
import { OnkyoConfig } from "./configManager.js";
import { EiscpDriver } from "./eiscp.js";

const integrationName = "Onkyo-Integration (receiver):";

export class OnkyoCommandReceiver {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private eiscpInstance: EiscpDriver;
  private avrPreset: string = "unknown";
  private lastImageHash: string = "";
  private currentTrackId: string = "";
  private lastTrackId: string = "";
  private zone: string = "";

  constructor(driver: uc.IntegrationAPI, config: OnkyoConfig, eiscpInstance: EiscpDriver) {
    this.driver = driver;
    this.config = config;
    this.eiscpInstance = eiscpInstance;
    this.zone = this.config.avrs && this.config.avrs.length > 0 ? this.config.avrs[0].zone || "main" : "main";
  }

  private entitiesToArray(entities: any): any[] {
    const arr: any[] = [];
    if (entities && typeof entities === "object") {
      for (const key in entities) {
        if (Object.prototype.hasOwnProperty.call(entities, key)) {
          const ent = entities[key];
          if (ent && typeof ent === "object" && ent.name) {
            arr.push(ent);
          }
        }
      }
    }
    return arr;
  }

  private async getImageHash(url: string): Promise<string> {
    try {
      const res = await fetch(url);
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return crypto.createHash("md5").update(buffer).digest("hex");
    } catch (err) {
      console.warn("%s Failed to fetch or hash image: %s", integrationName, err);
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
      this.driver.updateEntityAttributes(entityId, {
        [uc.MediaPlayerAttributes.MediaImageUrl]: imageUrl
      });
    }
  }

  setupEiscpListener() {
    const nowPlaying: { station?: string; artist?: string; album?: string; title?: string } = {};

    this.eiscpInstance.on("error", (err: any) => {
      console.error("%s eiscp error: %s", integrationName, err);
    });
    this.eiscpInstance.on(
      "data",
      async (avrUpdates: { command: string; argument: string | number | Record<string, string>; zone: string; iscpCommand: string; host: string; port: number; model: string }) => {
        const eventZone = avrUpdates.zone || "main";
        const entityId = `${avrUpdates.model} ${avrUpdates.host} ${eventZone}`;

        // Get the entity for this specific AVR zone
        let entity = this.driver.getConfiguredEntities().getEntity(entityId);
        if (!entity) {
          // Try availableEntities as fallback using utility
          const availableEntitiesArr = this.entitiesToArray(this.driver.getAvailableEntities());
          for (const e of availableEntitiesArr) {
            if (e.id === entityId) {
              entity = e;
              break;
            }
          }
        }

        switch (avrUpdates.command) {
          case "system-power": {
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.State]: avrUpdates.argument === "on" ? uc.MediaPlayerStates.On : uc.MediaPlayerStates.Standby
            });
            console.log("%s [%s] power set to: %s", integrationName, entityId, entity?.attributes?.state);
            break;
          }
          case "audio-muting": {
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.Muted]: avrUpdates.argument === "on" ? true : false
            });
            console.log("%s [%s] audio-muting set to: %s", integrationName, entityId, entity?.attributes?.muted);
            break;
          }
          case "volume": {
            // EISCP protocol: 0-200 or 0-100 depending on model, AVR display: 0-volumeScale, Remote slider: 0-100
            const eiscpValue = Number(avrUpdates.argument);
            const volumeScale = this.config.volumeScale || 100;
            const useHalfDbSteps = this.config.useHalfDbSteps ?? true;

            // Convert: EISCP → AVR display scale (÷2 for 0.5 dB steps if enabled) → slider
            const avrDisplayValue = useHalfDbSteps ? Math.round(eiscpValue / 2) : eiscpValue;
            const sliderValue = Math.round((avrDisplayValue * 100) / volumeScale);

            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.Volume]: sliderValue
            });
            console.log("%s [%s] volume set to: %s", integrationName, entityId, sliderValue);
            break;
          }
          case "preset": {
            this.avrPreset = avrUpdates.argument.toString();
            console.log("%s [%s] preset set to: %s", integrationName, entityId, this.avrPreset);
            // this.eiscpInstance.command("input-selector query");
            break;
          }
          case "input-selector": {
            setAvrCurrentSource(avrUpdates.argument.toString(), this.eiscpInstance, eventZone, entityId, this.driver);
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.Source]: avrUpdates.argument.toString()
            });
            console.log("%s [%s] input-selector (source) set to: %s", integrationName, entityId, avrUpdates.argument.toString());
            switch (avrUpdates.argument.toString()) {
              case "dab":
                this.eiscpInstance.raw("DSNQSTN");
                break;
              case "fm":
                this.eiscpInstance.raw("RDS01");
                break;
              default:
                break;
            }
            break;
          }
          case "DSN": {
            setAvrCurrentSource("dab", this.eiscpInstance, eventZone, entityId, this.driver);
            nowPlaying.station = avrUpdates.argument.toString();
            nowPlaying.artist = "DAB Radio";
            console.log("%s [%s] DAB station set to: %s", integrationName, entityId, avrUpdates.argument.toString());
            break;
          }
          case "RDS": {
            setAvrCurrentSource("fm", this.eiscpInstance, eventZone, entityId, this.driver);
            nowPlaying.station = avrUpdates.argument.toString();
            nowPlaying.artist = "FM Radio";
            // console.log(`${integrationName} [${entityId}] RDS set to: ${String(avrUpdates.argument)}`);
            console.log("%s [%s] RDS set to: %s", integrationName, entityId, avrUpdates.argument.toString());
            break;
          }
          case "NTM": {
            let [position, duration] = avrUpdates.argument.toString().split("/");
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.MediaPosition]: position || "0",
              [uc.MediaPlayerAttributes.MediaDuration]: duration || "0"
            });
            break;
          }
          case "metadata": {
            setAvrCurrentSource("net", this.eiscpInstance, eventZone, entityId, this.driver);
            if (typeof avrUpdates.argument === "object" && avrUpdates.argument !== null) {
              nowPlaying.title = (avrUpdates.argument as Record<string, string>).title || "unknown";
              nowPlaying.album = (avrUpdates.argument as Record<string, string>).album || "unknown";
              nowPlaying.artist = (avrUpdates.argument as Record<string, string>).artist || "unknown";
            }
            break;
          }
          default:
            break;
        }
        switch (avrCurrentSource) {
          case "spotify":
          case "airplay":
          case "net":
            let trackId = `${nowPlaying.title}|${nowPlaying.album}|${nowPlaying.artist}`;
            if (trackId !== this.currentTrackId) {
              this.currentTrackId = trackId;
              this.driver.updateEntityAttributes(entityId, {
                [uc.MediaPlayerAttributes.MediaArtist]: nowPlaying.artist + " (" + nowPlaying.album + ")" || "unknown",
                [uc.MediaPlayerAttributes.MediaTitle]: nowPlaying.title || "unknown",
                [uc.MediaPlayerAttributes.MediaAlbum]: nowPlaying.album || "unknown"
              });
              await this.maybeUpdateImage(entityId);
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
              [uc.MediaPlayerAttributes.MediaPosition]: "",
              [uc.MediaPlayerAttributes.MediaDuration]: ""
            });
            break;
          default:
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.MediaArtist]: "",
              [uc.MediaPlayerAttributes.MediaTitle]: "",
              [uc.MediaPlayerAttributes.MediaAlbum]: "",
              [uc.MediaPlayerAttributes.MediaImageUrl]: "",
              [uc.MediaPlayerAttributes.MediaPosition]: "",
              [uc.MediaPlayerAttributes.MediaDuration]: ""
            });
            break;
        }
      }
    );
  }
}
