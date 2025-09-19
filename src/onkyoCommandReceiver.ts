// Utility: Convert Entities collection to array
function entitiesToArray(entities: any): any[] {
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
import * as uc from "@unfoldedcircle/integration-api";
// import { EiscpDriver } from "./eiscp.js";
import OnkyoDriver from "./onkyo.js";
import { avrCurrentSource, setAvrCurrentSource } from "./state.js";
// import fetch from "node-fetch";
import crypto from "crypto";
import { OnkyoConfig } from "./configManager.js";
import { log } from "console";

const integrationName = "Onkyo-Integration: ";

export class OnkyoCommandReceiver {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private avrPreset: string = "unknown";
  private lastImageHash: string = "";
  private lastTrackId: string = "";
  private lastImageCheck: number = 0;

  constructor(driver: uc.IntegrationAPI, config: OnkyoConfig) {
    this.driver = driver;
    this.config = config;
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

  async maybeUpdateImage(nowPlaying: { title?: string; album?: string; artist?: string }) {
    const trackId = `${nowPlaying.title}|${nowPlaying.album}|${nowPlaying.artist}`;
    // Use config instead of static property
    if (!this.config.albumArtURL || this.config.albumArtURL === "na") return;
    const imageUrl = `http://${this.config.ip}/${this.config.albumArtURL}`;
    const now = Date.now();
    if (trackId !== this.lastTrackId || now - this.lastImageCheck > 5000) {
      // 5s throttle
      this.lastTrackId = trackId;
      this.lastImageCheck = now;
      const newHash = await this.getImageHash(imageUrl);
      if (newHash && this.lastImageHash !== newHash) {
        this.lastImageHash = newHash;
        this.driver.updateEntityAttributes(globalThis.selectedAvr, {
          [uc.MediaPlayerAttributes.MediaImageUrl]: imageUrl
        });
      }
    }
  }

  setupEiscpListener(eiscp: any) {
    const nowPlaying: { station?: string; artist?: string; album?: string; title?: string } = {};

    eiscp.on("error", (err: any) => {
      console.error("%s eiscp error: %s", integrationName, err);
    });
    eiscp.on(
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
        // Legacy: allow updates even if entity is not in configuredEntities
        let entity = this.driver.getConfiguredEntities().getEntity(globalThis.selectedAvr);
        if (!entity) {
          // Try availableEntities as fallback using utility
          const availableEntitiesArr = entitiesToArray(this.driver.getAvailableEntities());
          for (const e of availableEntitiesArr) {
            if (e.name === globalThis.selectedAvr) {
              entity = e;
              break;
            }
          }
        }

        switch (avrUpdates.command) {
          case "system-power": {
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.State]:
                avrUpdates.argument === "on" ? uc.MediaPlayerStates.On : uc.MediaPlayerStates.Standby
            });
            entity = this.driver.getConfiguredEntities().getEntity(globalThis.selectedAvr);
            console.log("%s power set to: %s", integrationName, entity?.attributes?.state);
            break;
          }
          case "audio-muting": {
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.Muted]: avrUpdates.argument === "on" ? true : false
            });
            entity = this.driver.getConfiguredEntities().getEntity(globalThis.selectedAvr);
            console.log("%s audio-muting set to: %s", integrationName, entity?.attributes?.muted);
            break;
          }
          case "volume": {
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.Volume]: avrUpdates.argument.toString()
            });
            entity = this.driver.getConfiguredEntities().getEntity(globalThis.selectedAvr);
            console.log("%s volume set to: %s", integrationName, entity?.attributes?.volume);
            break;
          }
          case "preset": {
            this.avrPreset = avrUpdates.argument.toString();
            console.log("%s preset set to: %s", integrationName, this.avrPreset);
            break;
          }
          case "input-selector": {
            setAvrCurrentSource(avrUpdates.argument.toString());
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.Source]: avrUpdates.argument.toString()
            });
            entity = this.driver.getConfiguredEntities().getEntity(globalThis.selectedAvr);
            console.log("%s input-selector (source) set to: %s", integrationName, avrUpdates.argument.toString());
            break;
          }
          case "DSN": {
            setAvrCurrentSource("dab");
            nowPlaying.station = avrUpdates.argument.toString();
            nowPlaying.artist = "DAB Radio";
            console.log("%s DAB station set to: %s", integrationName, avrUpdates.argument.toString());
            break;
          }
          case "NTM": {
            let [position, duration] = avrUpdates.argument.toString().split("/");
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.MediaPosition]: position || "0",
              [uc.MediaPlayerAttributes.MediaDuration]: duration || "0"
            });
            entity = this.driver.getConfiguredEntities().getEntity(globalThis.selectedAvr);
            break;
          }
          case "metadata": {
            if (typeof avrUpdates.argument === "object" && avrUpdates.argument !== null) {
              nowPlaying.title = (avrUpdates.argument as Record<string, string>).title || "unknown";
              nowPlaying.album = (avrUpdates.argument as Record<string, string>).album || "unknown";
              nowPlaying.artist = (avrUpdates.argument as Record<string, string>).artist || "unknown";
              entity = this.driver.getConfiguredEntities().getEntity(globalThis.selectedAvr);
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
            const trackId = `${nowPlaying.title}|${nowPlaying.album}|${nowPlaying.artist}`;
            if (trackId !== this.lastTrackId) {
              this.lastTrackId = trackId;
              this.driver.updateEntityAttributes(globalThis.selectedAvr, {
                [uc.MediaPlayerAttributes.MediaArtist]: nowPlaying.artist + " (" + nowPlaying.album + ")" || "unknown",
                [uc.MediaPlayerAttributes.MediaTitle]: nowPlaying.title || "unknown",
                [uc.MediaPlayerAttributes.MediaAlbum]: nowPlaying.album || "unknown"
              });
            }
            await this.maybeUpdateImage(nowPlaying);
            break;
          case "dab":
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.MediaArtist]: nowPlaying.artist || "unknown",
              [uc.MediaPlayerAttributes.MediaTitle]: nowPlaying.station || "unknown",
              [uc.MediaPlayerAttributes.MediaAlbum]: "",
              [uc.MediaPlayerAttributes.MediaImageUrl]: "",
              [uc.MediaPlayerAttributes.MediaPosition]: "",
              [uc.MediaPlayerAttributes.MediaDuration]: ""
            });
            break;
          default:
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
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
