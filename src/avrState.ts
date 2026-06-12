import * as uc from "@unfoldedcircle/integration-api";
import { physicalAvrIdFromEntityId } from "./configManager.js";
import { EiscpDriver } from "./eiscp.js";
import log from "./loggers.js";
import { delay } from "./utils.js";
import { ALBUM_ART, SONG_INFO } from "./constants.js";
import type { ICommandReceiver } from "./types.js";
import { resetTidalBrowseState } from "./tidalBrowserStore.js";

const integrationName = "avrState:";

/** State for a single AVR entity */
interface EntityState {
  source: string;
  subSource: string;
  playbackStatus: string;
  audioFormat: string;
  powerState: string;
  volume: number;
}

// Manages per-entity state (source, volume, power, etc.) — each AVR zone has independent state.
export class AvrStateManager {
  private states: Map<string, EntityState> = new Map();

  /** Get or create state for an entity */
  private getState(entityId: string): EntityState {
    let state = this.states.get(entityId);
    if (!state) {
      state = { source: "unknown", subSource: "unknown", playbackStatus: "unknown", audioFormat: "unknown", powerState: "unknown", volume: 0 };
      this.states.set(entityId, state);
    }
    return state;
  }

  /** Get current source for an entity */
  getSource(entityId: string): string {
    return this.getState(entityId).source;
  }

  /** Get current sub-source for an entity */
  getSubSource(entityId: string): string {
    return this.getState(entityId).subSource;
  }

  getVolume(entityId: string): number {
    return this.getState(entityId).volume;
  }

  /** Get current audio format for an entity */
  getAudioFormat(entityId: string): string {
    return this.getState(entityId).audioFormat;
  }

  /** Get current power state for an entity */
  getPowerState(entityId: string): string {
    return this.getState(entityId).powerState;
  }

  /** Get current playback status for an entity */
  getPlaybackStatus(entityId: string): string {
    return this.getState(entityId).playbackStatus;
  }

  /** Set audio format for an entity, returns true if changed */
  setAudioFormat(entityId: string, audioFormat: string): boolean {
    const state = this.getState(entityId);
    const normalizedFormat = audioFormat.toLowerCase();

    if (state.audioFormat !== normalizedFormat) {
      log.info("%s [%s] audio format changed from '%s' to '%s'", integrationName, entityId, state.audioFormat, audioFormat);
      state.audioFormat = normalizedFormat;
      return true;
    }
    return false;
  }

  /** Set power state for an entity, returns true if changed */
  setPowerState(entityId: string, powerState: string, driver?: uc.IntegrationAPI): boolean {
    const state = this.getState(entityId);
    const normalizedPowerState = powerState.toLowerCase();

    if (state.powerState !== normalizedPowerState) {
      log.info("%s [%s] power state changed from '%s' to '%s'", integrationName, entityId, state.powerState, powerState);
      state.powerState = normalizedPowerState;
      this.applyMediaPlayerState(entityId, driver);
      return true;
    }

    // Keep entity state in sync even if power event is duplicated.
    this.applyMediaPlayerState(entityId, driver);
    return false;
  }

  setVolume(entityId: string, volume: number): boolean {
    const state = this.getState(entityId);
    if (state.volume !== volume) {
      log.info("%s [%s] volume changed from '%s' to '%s'", integrationName, entityId, state.volume, volume);
      state.volume = volume;
      return true;
    }
    return false;
  }

  /** Check if entity is powered on */
  isEntityOn(entityId: string): boolean {
    const powerState = this.getState(entityId).powerState;
    return powerState === "on";
  }

  //Get all powered-on entities currently using the specified source.
  getEntitiesBySource(source: string): string[] {
    const normalizedSource = source.toLowerCase();
    const entities: string[] = [];

    for (const [entityId, state] of this.states.entries()) {
      if (state.source === normalizedSource && this.isEntityOn(entityId)) {
        entities.push(entityId);
      }
    }

    return entities;
  }

  //Get all powered-on entities currently using the specified source and sub-source.
  getEntitiesBySourceAndSubSource(source: string, subSource: string): string[] {
    const normalizedSource = source.toLowerCase();
    const normalizedSubSource = subSource.toLowerCase();
    const entities: string[] = [];

    for (const [entityId, state] of this.states.entries()) {
      if (state.source === normalizedSource && state.subSource === normalizedSubSource && this.isEntityOn(entityId)) {
        entities.push(entityId);
      }
    }

    return entities;
  }

  // Get all powered-on entities for the same physical AVR and source.
  getEntitiesByPhysicalAvrAndSource(physicalAvrId: string, source: string): string[] {
    const normalizedSource = source.toLowerCase();
    const entities: string[] = [];

    for (const [entityId, state] of this.states.entries()) {
      if (physicalAvrIdFromEntityId(entityId) === physicalAvrId && state.source === normalizedSource && this.isEntityOn(entityId)) {
        entities.push(entityId);
      }
    }

    return entities;
  }

  /** Set source for an entity, returns true if changed */
  setSource(entityId: string, source: string, eiscpInstance?: EiscpDriver, zone?: string, _driver?: uc.IntegrationAPI): boolean {
    const state = this.getState(entityId);
    const normalizedSource = source.toLowerCase();

    if (state.source !== normalizedSource) {
      log.info("%s [%s] source changed from '%s' to '%s'", integrationName, entityId, state.source, source);
      state.source = normalizedSource;
      state.playbackStatus = "unknown";
      this.applyMediaPlayerState(entityId, _driver);
      // state.subSource = "unknown"; // Reset sub-source on source change
      this.refreshAvrState(entityId, eiscpInstance, zone, _driver);
      return true;
    }

    this.applyMediaPlayerState(entityId, _driver);
    return false;
  }

  /** Set sub-source for an entity, returns true if changed */
  setSubSource(entityId: string, subSource: string, eiscpInstance?: EiscpDriver, zone?: string, _driver?: uc.IntegrationAPI): boolean {
    const state = this.getState(entityId);
    const normalizedSubSource = subSource.toLowerCase();

    if (state.subSource !== normalizedSubSource) {
      log.info("%s [%s] sub-source changed from '%s' to '%s'", integrationName, entityId, state.subSource, subSource);
      state.subSource = normalizedSubSource;
      state.playbackStatus = "unknown";
      this.applyMediaPlayerState(entityId, _driver);
      this.refreshAvrState(entityId, eiscpInstance, zone, _driver);
      return true;
    }

    this.applyMediaPlayerState(entityId, _driver);
    return false;
  }

  setPlaybackStatus(entityId: string, playbackStatus: string, driver?: uc.IntegrationAPI): boolean {
    const state = this.getState(entityId);
    const normalizedStatus = playbackStatus.toLowerCase();

    if (state.playbackStatus !== normalizedStatus) {
      state.playbackStatus = normalizedStatus;
      this.applyMediaPlayerState(entityId, driver);
      return true;
    }

    this.applyMediaPlayerState(entityId, driver);
    return false;
  }

  private resolveMediaPlayerState(entityId: string): uc.MediaPlayerStates {
    const state = this.getState(entityId);

    if (state.powerState !== "on") {
      if (state.powerState === "standby") {
        return uc.MediaPlayerStates.Standby;
      }
      return uc.MediaPlayerStates.Unknown;
    }

    if (state.source !== "net") {
      return uc.MediaPlayerStates.On;
    }

    // Explicit transport status from NST should override source/sub-source heuristics.
    if (state.playbackStatus === "paused") {
      return uc.MediaPlayerStates.Paused;
    }

    if (state.playbackStatus === "playing" || state.playbackStatus === "ff" || state.playbackStatus === "fr") {
      return uc.MediaPlayerStates.Playing;
    }

    const isPlayingService = ALBUM_ART.some((name) => state.subSource.includes(name));
    if (!isPlayingService) {
      return uc.MediaPlayerStates.On;
    }

    // Keep previous behavior for services that do not report explicit play status.
    return uc.MediaPlayerStates.Playing;
  }

  public applyMediaPlayerState(entityId: string, driver?: uc.IntegrationAPI): void {
    if (!driver) {
      return;
    }

    driver.updateEntityAttributes(entityId, {
      [uc.MediaPlayerAttributes.State]: this.resolveMediaPlayerState(entityId)
    });
  }

  /** Clear state for an entity (e.g., on disconnect) */
  clearState(entityId: string): void {
    this.states.delete(entityId);
  }

  /** Clear all state */
  clearAllState(): void {
    this.states.clear();
  }

  /** Query AVR state and clear media attributes on source change */
  async refreshAvrState(entityId: string, eiscpInstance?: EiscpDriver, zone?: string, driver?: uc.IntegrationAPI, queueThreshold?: number, commandReceiver?: ICommandReceiver): Promise<void> {
    if (!eiscpInstance || !zone || !driver || !entityId) {
      return;
    }

    // Use provided queueThreshold or fallback to default
    const threshold = queueThreshold ?? (typeof eiscpInstance.eiscpConfig?.sendDelay === "number" ? eiscpInstance.eiscpConfig.sendDelay : 250);

    log.info("%s [%s] querying volume for zone '%s'", integrationName, entityId, zone);
    await eiscpInstance.command({ zone, command: "volume", args: "query" });
    await eiscpInstance.command({ zone, command: "audio-muting", args: "query" });

    // Clear media attributes so they can be updated with new data
    // Prevents showing old data if new source does not deliver similar info
    driver.updateEntityAttributes(entityId, {
      [uc.MediaPlayerAttributes.MediaArtist]: "",
      [uc.MediaPlayerAttributes.MediaTitle]: "",
      [uc.MediaPlayerAttributes.MediaAlbum]: "",
      [uc.MediaPlayerAttributes.MediaImageUrl]: "",
      [uc.MediaPlayerAttributes.MediaPosition]: 0,
      [uc.MediaPlayerAttributes.MediaDuration]: 0
    });

    // Reset Audio/Video sensors
    log.info("%s [%s] querying AV-info for zone '%s'", integrationName, entityId, zone);
    await eiscpInstance.command({ zone, command: "audio-information", args: "query" });
    await eiscpInstance.command({ zone, command: "video-information", args: "query" });

    // To make sure the sensor also updates (in case a message is missed)
    await eiscpInstance.command({ zone, command: "input-selector", args: "query" });
    await delay(threshold * 3);
    await eiscpInstance.command({ zone, command: "listening-mode", args: "query" });
    await eiscpInstance.command({ zone, command: "fp-display", args: "query" });

    // Force refresh album art for network services that support it
    const currentSource = this.getSource(entityId);
    const currentSubSource = this.getSubSource(entityId);
    const hasAlbumArt = currentSource === "net";
    // const hasAlbumArt = ALBUM_ART.some((name) => currentSubSource.toLowerCase().includes(name));
    if (hasAlbumArt && commandReceiver) {
      log.info("%s [%s] forcing album art refresh for subsource '%s'", integrationName, entityId, currentSubSource);
      await commandReceiver.maybeUpdateImage(entityId, true);
    }

    // Requery metadata for network services that support it
    const hasSongInfo = SONG_INFO.some((name) => currentSubSource.toLowerCase().includes(name));
    if (hasSongInfo) {
      log.debug("%s [%s] requerying metadata for subsource '%s'", integrationName, entityId, currentSubSource);
      await eiscpInstance.raw("NATQSTN"); // Query artist
      await eiscpInstance.raw("NTIQSTN"); // Query title
      await eiscpInstance.raw("NALQSTN"); // Query album
      await eiscpInstance.raw("NSTQSTN"); // Query play/pause status
    }

    // For Tidal, reset the browse state and re-request the NLS list so the media browser stays fresh
    if (currentSubSource === "tidal") {
      log.info("%s [%s] refreshing Tidal browse state via NTCTOP + NTCSELECT", integrationName, entityId);
      resetTidalBrowseState(entityId);
      await eiscpInstance.raw("NTCTOP");
      await eiscpInstance.raw("NTCSELECT");
    }
  }
}

/** Singleton instance of the state manager */
export const avrStateManager = new AvrStateManager();
