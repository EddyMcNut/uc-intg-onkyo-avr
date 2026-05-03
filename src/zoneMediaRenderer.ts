import * as uc from "@unfoldedcircle/integration-api";
import crypto from "crypto";
import { avrStateManager } from "./avrState.js";
import { OnkyoConfig } from "./configManager.js";
import log from "./loggers.js";
import { delay } from "./utils.js";
import { ZoneAgnosticMediaStateStore } from "./zoneAgnosticMediaState.js";

const integrationName = "zoneAgnosticUpdateProcessor:";

export class ZoneMediaRenderer {
  constructor(
    private readonly driver: uc.IntegrationAPI,
    private config: OnkyoConfig,
    private readonly mediaStateStore: ZoneAgnosticMediaStateStore
  ) {}

  public updateConfig(config: OnkyoConfig): void {
    this.config = config;
  }

  async maybeUpdateImage(entityId: string, force: boolean = false): Promise<void> {
    if (!this.config.albumArtURL || this.config.albumArtURL === "na") {
      return;
    }

    if(force) {
      log.info("%s forcing image update obsolete?", entityId);
    }

    const sharedState = this.mediaStateStore.getSharedAvrMediaState(entityId);
    const physicalAvrId = this.mediaStateStore.getPhysicalAvrId(entityId);

    const imageUrl = `http://${this.config.ip}/${this.config.albumArtURL}`;
    const previousHash = sharedState.lastImageHash;

    let newHash = await this.getImageHash(imageUrl);
    let attempts = 0;
    while (newHash === previousHash && attempts < 3) {
      attempts += 1;
      await delay(500);
      newHash = await this.getImageHash(imageUrl);
    }

    if (newHash !== previousHash) {
      sharedState.lastImageHash = newHash;
      sharedState.currentImageUrl = `${imageUrl}?hash=${newHash}`;
    }

    if (sharedState.currentImageUrl) {
      const netZones = avrStateManager.getEntitiesByPhysicalAvrAndSource(physicalAvrId, "net");
      for (const zoneEntityId of netZones) {
        this.driver.updateEntityAttributes(zoneEntityId, {
          [uc.MediaPlayerAttributes.MediaImageUrl]: sharedState.currentImageUrl
        });
      }
    }
  }

  async renderZoneMedia(entityId: string, forceUpdate: boolean): Promise<void> {
    const entitySource = avrStateManager.getSource(entityId);
    const zoneNowPlaying = this.mediaStateStore.getNowPlaying(entityId, entitySource);
    const sharedState = this.mediaStateStore.getSharedAvrMediaState(entityId);

    switch (entitySource) {
      case "net": {
        const trackId = `${zoneNowPlaying.title}|${zoneNowPlaying.album}|${zoneNowPlaying.artist}`;
        const previousTrackId = this.mediaStateStore.getCurrentTrackId(entityId);
        const trackChanged = trackId !== previousTrackId;

        if (trackChanged || forceUpdate) {
          this.mediaStateStore.setCurrentTrackId(entityId, trackId);
          this.driver.updateEntityAttributes(entityId, {
            [uc.MediaPlayerAttributes.MediaArtist]: `${zoneNowPlaying.artist || "unknown"} (${zoneNowPlaying.album || "unknown"})`,
            [uc.MediaPlayerAttributes.MediaTitle]: zoneNowPlaying.title || "unknown",
            [uc.MediaPlayerAttributes.MediaAlbum]: zoneNowPlaying.album || "unknown"
          });

          if (sharedState.currentImageUrl) {
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.MediaImageUrl]: sharedState.currentImageUrl
            });
          }

          if (forceUpdate || !sharedState.currentImageUrl) {
            await this.maybeUpdateImage(entityId, forceUpdate);
          }
        }
        break;
      }
      case "tuner":
      case "fm":
      case "dab": {
        this.driver.updateEntityAttributes(entityId, {
          [uc.MediaPlayerAttributes.MediaArtist]: zoneNowPlaying.artist || "unknown",
          [uc.MediaPlayerAttributes.MediaTitle]: zoneNowPlaying.station || "unknown",
          [uc.MediaPlayerAttributes.MediaAlbum]: "",
          [uc.MediaPlayerAttributes.MediaImageUrl]: "",
          [uc.MediaPlayerAttributes.MediaPosition]: 0,
          [uc.MediaPlayerAttributes.MediaDuration]: 0
        });
        break;
      }
      default: {
        this.driver.updateEntityAttributes(entityId, {
          [uc.MediaPlayerAttributes.MediaArtist]: "",
          [uc.MediaPlayerAttributes.MediaTitle]: "",
          [uc.MediaPlayerAttributes.MediaAlbum]: "",
          [uc.MediaPlayerAttributes.MediaImageUrl]: "",
          [uc.MediaPlayerAttributes.MediaPosition]: 0,
          [uc.MediaPlayerAttributes.MediaDuration]: 0
        });
      }
    }
  }

  private async getImageHash(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return crypto.createHash("md5").update(buffer).digest("hex");
    } catch (err) {
      log.warn("%s failed to fetch/hash image: %s", integrationName, err);
      return "";
    }
  }
}
