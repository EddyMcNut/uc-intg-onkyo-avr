import * as uc from "@unfoldedcircle/integration-api";
import eiscp from "./eiscp.js";
import { avrCurrentSource, setAvrCurrentSource } from "./state.js";

const integrationName = "Onkyo-Integration: ";

export class OnkyoCommandReceiver {
  private driver: uc.IntegrationAPI;
  private avrPreset: string = "unknown";

  constructor(driver: uc.IntegrationAPI) {
    this.driver = driver;
  }

  setupEiscpListener() {
    const nowPlaying: { station?: string; artist?: string; album?: string; title?: string } = {};

    eiscp.on("error", (err: any) => {
      console.error("%s eiscp error: %s", integrationName, err);
    });
    eiscp.on(
      "data",
      (avrUpdates: {
        command: string;
        argument: string | number | Record<string, string>;
        zone: string;
        iscpCommand: string;
        host: string;
        port: number;
        model: string;
      }) => {
        const entity = this.driver.getConfiguredEntities().getEntity(globalThis.selectedAvr);
        if (!entity) {
          console.warn("%s Entity not found for: %s", integrationName, globalThis.selectedAvr);
          return;
        }
        switch (avrUpdates.command) {
          case "system-power":
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.State]:
                avrUpdates.argument === "on" ? uc.MediaPlayerStates.On : uc.MediaPlayerStates.Standby
            });
            console.log("%s power set to: %s", integrationName, entity.attributes?.state);
            break;
          case "audio-muting":
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.Muted]: avrUpdates.argument === "on" ? true : false
            });
            console.log("%s audio-muting set to: %s", integrationName, entity.attributes?.muted);
            break;
          case "volume":
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.Volume]: avrUpdates.argument.toString()
            });
            console.log("%s volume set to: %s", integrationName, entity.attributes?.volume);
            break;
          case "preset":
            this.avrPreset = avrUpdates.argument.toString();
            console.log("%s preset set to: %s", integrationName, this.avrPreset);
            break;
          case "input-selector":
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.Source]: avrUpdates.argument.toString()
            });
            setAvrCurrentSource(avrUpdates.argument.toString());
            console.log("%s input-selector (source) set to: %s", integrationName, avrUpdates.argument.toString());
            break;
          // case "NTM":
          //   let [position, duration] = avrUpdates.argument.toString().split("/");
          //   if (entity.attributes?.media_position !== position) {
          //     this.driver.updateEntityAttributes(globalThis.selectedAvr, {
          //       [uc.MediaPlayerAttributes.MediaPosition]: position || "0",
          //       [uc.MediaPlayerAttributes.MediaDuration]: duration || "0"
          //     });
          //   }
          //   break;
          case "metadata":
            if (typeof avrUpdates.argument === "object" && avrUpdates.argument !== null) {
              nowPlaying.title = (avrUpdates.argument as Record<string, string>).title || "unknown";
              nowPlaying.album = (avrUpdates.argument as Record<string, string>).album || "unknown";
              nowPlaying.artist = (avrUpdates.argument as Record<string, string>).artist || "unknown";
            }
            break;
          default:
            break;
        }
        if (avrCurrentSource === "spotify") {
          this.driver.updateEntityAttributes(globalThis.selectedAvr, {
            [uc.MediaPlayerAttributes.MediaArtist]: nowPlaying.artist + " (" + nowPlaying.album + ")" || "unknown",
            [uc.MediaPlayerAttributes.MediaTitle]: nowPlaying.title || "unknown",
            [uc.MediaPlayerAttributes.MediaAlbum]: nowPlaying.album || "unknown",
            [uc.MediaPlayerAttributes.MediaImageUrl]: "http://192.168.2.103/album_art.cgi"
          });
        } else {
          this.driver.updateEntityAttributes(globalThis.selectedAvr, {
            [uc.MediaPlayerAttributes.MediaArtist]: "",
            [uc.MediaPlayerAttributes.MediaTitle]: "",
            [uc.MediaPlayerAttributes.MediaAlbum]: "",
            [uc.MediaPlayerAttributes.MediaImageUrl]: "",
            [uc.MediaPlayerAttributes.MediaPosition]: "",
            [uc.MediaPlayerAttributes.MediaDuration]: ""
          });
        }
      }
    );
  }
}
