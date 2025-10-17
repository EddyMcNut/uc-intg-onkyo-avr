import * as uc from "@unfoldedcircle/integration-api";
import { avrCurrentSource, setAvrCurrentSource } from "./state.js";
import crypto from "crypto";
import { OnkyoConfig } from "./configManager.js";
import { EiscpDriver } from "./eiscp.js";

const integrationName = "Onkyo-Integration (receiver): ";

export class OnkyoCommandReceiver {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private eiscpInstance: EiscpDriver;
  private avrPreset: string = "unknown";
  private lastImageHash: string = "";
  private currentTrackId: string = "";
  private lastTrackId: string = "";

  constructor(driver: uc.IntegrationAPI, config: OnkyoConfig, eiscpInstance: EiscpDriver) {
    this.driver = driver;
    this.config = config;
    this.eiscpInstance = eiscpInstance;
  }

  // Utility: Convert Entities collection to array
  private entitiesToArray(entities: any): any[] {
    const arr: any[] = [];
    if (entities && typeof entities === "object") {
      for (const key in entities) {
        if (Object.prototype.hasOwnProperty.call(entities, key)) {
          const ent = entities[key];
          // Heuristic: skip non-entity keys (e.g., methods)
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
      // Note: entityId not available in this utility function
      console.warn("%s Failed to fetch or hash image: %s", integrationName, err);
      return "";
    }
  }

  async maybeUpdateImage(entityId: string) {
    if (!this.config.albumArtURL || this.config.albumArtURL === "na") return;
    let imageUrl = `http://${this.config.ip}/${this.config.albumArtURL}`;
    if (this.lastTrackId !== this.currentTrackId) {
      this.lastTrackId = this.currentTrackId;
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
  }

  setupEiscpListener() {
    const nowPlaying: { station?: string; artist?: string; album?: string; title?: string } = {};

    this.eiscpInstance.on("error", (err: any) => {
      // Note: entityId not available in generic error handler
      console.error("%s eiscp error: %s", integrationName, err);
    });
    this.eiscpInstance.on(
      "data",
      async (avrUpdates: {
        command: string;
        argument: string | number | Record<string, string>;
        zone: string;
        iscpCommand: string;
        host: string;
        port: number;
        model: string;
      }) => {
        // Construct entity ID from model and host (matches the format used in onkyo.ts)
        const entityId = `${avrUpdates.model} ${avrUpdates.host}`;

        // Get the entity for this specific AVR
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
              [uc.MediaPlayerAttributes.State]:
                avrUpdates.argument === "on" ? uc.MediaPlayerStates.On : uc.MediaPlayerStates.Standby
            });
            entity = this.driver.getConfiguredEntities().getEntity(entityId);
            console.log("%s [%s] power set to: %s", integrationName, entityId, entity?.attributes?.state);
            break;
          }
          case "audio-muting": {
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.Muted]: avrUpdates.argument === "on" ? true : false
            });
            entity = this.driver.getConfiguredEntities().getEntity(entityId);
            console.log("%s [%s] audio-muting set to: %s", integrationName, entityId, entity?.attributes?.muted);
            break;
          }
          case "volume": {
            // AVR sends volume in its native scale (0-80 or 0-100)
            // eiscp.ts already converts hex to decimal
            const avrVolume = Number(avrUpdates.argument);
            // const volumeScale = this.config.volumeScale || 100;

            // // Scale AVR volume to 0-100 range for Remote slider
            // const sliderValue = Math.round((avrVolume * 100) / volumeScale);
            const sliderValue = avrVolume / 2;
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.Volume]: sliderValue
            });
            entity = this.driver.getConfiguredEntities().getEntity(entityId);
            console.log(
              "%s [%s] volume: avr=%d/%d, slider=%d",
              integrationName,
              entityId,
              avrVolume //,
              // volumeScale,
              // sliderValue
            );
            break;
          }
          case "preset": {
            this.avrPreset = avrUpdates.argument.toString();
            console.log("%s [%s] preset set to: %s", integrationName, entityId, this.avrPreset);
            this.eiscpInstance.command("input-selector query");
            break;
          }
          case "input-selector": {
            setAvrCurrentSource(avrUpdates.argument.toString());
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.Source]: avrUpdates.argument.toString()
            });
            entity = this.driver.getConfiguredEntities().getEntity(entityId);
            console.log(
              "%s [%s] input-selector (source) set to: %s",
              integrationName,
              entityId,
              avrUpdates.argument.toString()
            );
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
            setAvrCurrentSource("dab");
            nowPlaying.station = avrUpdates.argument.toString();
            nowPlaying.artist = "DAB Radio";
            console.log("%s [%s] DAB station set to: %s", integrationName, entityId, avrUpdates.argument.toString());
            break;
          }
          case "RDS": {
            setAvrCurrentSource("fm");
            nowPlaying.station = avrUpdates.argument.toString();
            nowPlaying.artist = "FM Radio";
            console.log("%s [%s] RDS set to: %s", integrationName, entityId, avrUpdates.argument.toString());
            break;
          }
          case "NTM": {
            let [position, duration] = avrUpdates.argument.toString().split("/");
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.MediaPosition]: position || "0",
              [uc.MediaPlayerAttributes.MediaDuration]: duration || "0"
            });
            entity = this.driver.getConfiguredEntities().getEntity(entityId);
            break;
          }
          case "metadata": {
            setAvrCurrentSource("net");
            if (typeof avrUpdates.argument === "object" && avrUpdates.argument !== null) {
              nowPlaying.title = (avrUpdates.argument as Record<string, string>).title || "unknown";
              nowPlaying.album = (avrUpdates.argument as Record<string, string>).album || "unknown";
              nowPlaying.artist = (avrUpdates.argument as Record<string, string>).artist || "unknown";
              entity = this.driver.getConfiguredEntities().getEntity(entityId);
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
            }
            await this.maybeUpdateImage(entityId);
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
