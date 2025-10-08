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
      console.warn("%s Failed to fetch or hash image: %s", integrationName, err);
      return "";
    }
  }

  async maybeUpdateImage() {
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
        this.driver.updateEntityAttributes(globalThis.selectedAvr, {
          [uc.MediaPlayerAttributes.MediaImageUrl]: imageUrl
        });
      }
    }
  }

  setupEiscpListener() {
    const nowPlaying: { station?: string; artist?: string; album?: string; title?: string } = {};

    this.eiscpInstance.on("error", (err: any) => {
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
        // Legacy: allow updates even if entity is not in configuredEntities
        let entity = this.driver.getConfiguredEntities().getEntity(globalThis.selectedAvr);
        if (!entity) {
          // Try availableEntities as fallback using utility
          const availableEntitiesArr = this.entitiesToArray(this.driver.getAvailableEntities());
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
            this.eiscpInstance.command("input-selector query");
            break;
          }
          case "input-selector": {
            setAvrCurrentSource(avrUpdates.argument.toString());
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.Source]: avrUpdates.argument.toString()
            });
            entity = this.driver.getConfiguredEntities().getEntity(globalThis.selectedAvr);
            console.log("%s input-selector (source) set to: %s", integrationName, avrUpdates.argument.toString());
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
            console.log("%s DAB station set to: %s", integrationName, avrUpdates.argument.toString());
            break;
          }
          case "RDS": {
            setAvrCurrentSource("fm");
            nowPlaying.station = avrUpdates.argument.toString();
            nowPlaying.artist = "FM Radio";
            console.log("%s RDS set to: %s", integrationName, avrUpdates.argument.toString());
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
            setAvrCurrentSource("net");
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
            let trackId = `${nowPlaying.title}|${nowPlaying.album}|${nowPlaying.artist}`;
            if (trackId !== this.currentTrackId) {
              this.currentTrackId = trackId;
              this.driver.updateEntityAttributes(globalThis.selectedAvr, {
                [uc.MediaPlayerAttributes.MediaArtist]: nowPlaying.artist + " (" + nowPlaying.album + ")" || "unknown",
                [uc.MediaPlayerAttributes.MediaTitle]: nowPlaying.title || "unknown",
                [uc.MediaPlayerAttributes.MediaAlbum]: nowPlaying.album || "unknown"
              });
            }
            await this.maybeUpdateImage();
            break;
          case "tuner":
          case "fm":
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
