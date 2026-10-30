import * as uc from "@unfoldedcircle/integration-api";
import crypto from "crypto";
import { IntegrationConfig } from "./configManager.js";
import type { AvrStateApi } from "./types.js";
import log from "./loggers.js";
import { delay } from "./utils.js";
import { createTunerArtwork } from "./serviceThumbnails.js";
import { ZoneAgnosticMediaStateStore } from "./zoneAgnosticMediaState.js";

const logSource = "zoneMediaRenderer:";

export class ZoneMediaRenderer {
  private readonly imageHashInFlight = new Map<string, Promise<string>>();
  private readonly imageUpdateInFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly driver: uc.IntegrationAPI,
    private config: IntegrationConfig,
    private readonly mediaStateStore: ZoneAgnosticMediaStateStore,
    private readonly avrStateApi: AvrStateApi
  ) {}

  public updateConfig(config: IntegrationConfig): void {
    this.config = config;
  }

  async maybeUpdateImage(entityId: string): Promise<void> {
    if (!this.config.albumArtURL || this.config.albumArtURL === "na") {
      return;
    }

    const physicalAvrId = this.mediaStateStore.getPhysicalAvrId(entityId);
    const existingRequest = this.imageUpdateInFlight.get(physicalAvrId);
    if (existingRequest) {
      await existingRequest;
      return;
    }

    const request = this.updateImage(entityId, physicalAvrId);
    this.imageUpdateInFlight.set(physicalAvrId, request);
    try {
      await request;
    } finally {
      if (this.imageUpdateInFlight.get(physicalAvrId) === request) {
        this.imageUpdateInFlight.delete(physicalAvrId);
      }
    }
  }

  private async updateImage(entityId: string, physicalAvrId: string): Promise<void> {

    const sharedState = this.mediaStateStore.getSharedAvrMediaState(entityId);

    const imageUrl = `http://${this.config.ip}/${this.config.albumArtURL}`;
    const previousHash = sharedState.lastImageHash;

    log.debug("%s [%s] collecting album art from %s", logSource, entityId, imageUrl);
    let newHash = await this.getImageHash(imageUrl, entityId);
    let attempts = 0;
    while (newHash === previousHash && attempts < 3) {
      attempts += 1;
      await delay(500);
      // Some AVR web servers briefly serve the previous jacket after the
      // metadata event and cache HEAD responses. A cache-busting probe lets
      // the next track's artwork become visible without waiting for another
      // unrelated update event.
      newHash = await this.getImageHash(`${imageUrl}${imageUrl.includes("?") ? "&" : "?"}_=${Date.now()}`, entityId);
    }

    if (newHash !== previousHash) {
      sharedState.lastImageHash = newHash;
      sharedState.currentImageUrl = `${imageUrl}?hash=${newHash}`;
      log.debug("%s [%s] album art URL updated to %s", logSource, entityId, sharedState.currentImageUrl);
    } else {
      log.debug("%s [%s] album art unchanged (hash %s)", logSource, entityId, newHash || "empty");
    }

    if (sharedState.currentImageUrl) {
      const netZones = this.avrStateApi.getEntitiesByPhysicalAvrAndSource(physicalAvrId, "net");
      for (const zoneEntityId of netZones) {
        this.driver.updateEntityAttributes(zoneEntityId, {
          [uc.MediaPlayerAttributes.MediaImageUrl]: sharedState.currentImageUrl
        });
      }
    }
  }

  async renderZoneMedia(entityId: string, forceUpdate: boolean): Promise<void> {
    const entitySource = this.avrStateApi.getSource(entityId);
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
            await this.maybeUpdateImage(entityId);
          }
        }
        break;
      }
      case "tuner":
      case "fm":
      case "am":
      case "dab": {
        this.driver.updateEntityAttributes(entityId, {
          [uc.MediaPlayerAttributes.MediaArtist]: zoneNowPlaying.artist || "Tuner",
          [uc.MediaPlayerAttributes.MediaTitle]: zoneNowPlaying.station || "Tuner",
          [uc.MediaPlayerAttributes.MediaAlbum]: "",
          [uc.MediaPlayerAttributes.MediaImageUrl]: createTunerArtwork(),
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

  private async getImageHash(url: string, entityId: string): Promise<string> {
    const existingRequest = this.imageHashInFlight.get(url);
    if (existingRequest) {
      return existingRequest;
    }

    const request = this.fetchImageHash(url, entityId);
    this.imageHashInFlight.set(url, request);
    try {
      return await request;
    } finally {
      if (this.imageHashInFlight.get(url) === request) {
        this.imageHashInFlight.delete(url);
      }
    }
  }

  private async fetchImageHash(url: string, entityId: string): Promise<string> {
    // Fast path: cheap conditional check via HTTP headers so an unchanged image is never
    // fully re-downloaded. Most AVR web servers expose an ETag or Last-Modified header.
    try {
      const headResponse = await fetch(url, { method: "HEAD" });
      log.debug("%s [%s] album art HEAD %s -> HTTP %s", logSource, entityId, url, headResponse.status);
      const etag = headResponse.headers.get("etag");
      const lastModified = headResponse.headers.get("last-modified");
      const token = etag ?? lastModified;
      if (token) {
        return token;
      }
    } catch {
      // AVR may not support HEAD — fall through to a streaming body hash.
    }

    try {
      const response = await fetch(url);
      log.debug("%s [%s] album art GET %s -> HTTP %s", logSource, entityId, url, response.status);
      if (!response.ok) {
        return "";
      }
      const body = response.body;
      if (!body) {
        return "";
      }
      // Stream the body into the hash instead of buffering the whole image in memory.
      const hash = crypto.createHash("md5");
      const reader = body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          hash.update(value);
        }
      }
      return hash.digest("hex");
    } catch (err) {
      log.warn("%s failed to fetch/hash image: %s", logSource, err);
      return "";
    }
  }
}
