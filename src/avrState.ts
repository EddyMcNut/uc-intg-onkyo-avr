import * as uc from "@unfoldedcircle/integration-api";
import { buildPhysicalAvrId } from "./configManager.js";
import { EiscpDriver } from "./eiscp.js";
import log from "./loggers.js";
import { delay } from "./utils.js";
import { ALBUM_ART, SONG_INFO } from "./constants.js";
import type { CommandReceiver } from "./commandReceiver.js";

const integrationName = "avrState:";

/** State for a single AVR entity */
interface EntityState {
  source: string;
  subSource: string;
  audioFormat: string;
  powerState: string;
  volume: number;
}

/**
 * Manages per-entity state for AVR sources. 
 * Each entity (AVR zone) has its own independent source tracking.
 */
class AvrStateManager {
  private states: Map<string, EntityState> = new Map();
  // reuse the existing state map to also track last query timestamps
  private lastQueries: Map<string, number> = new Map();
  private readonly QUERY_TTL = 5000; // ms

  /** Get or create state for an entity */
  private getState(entityId: string): EntityState {
    let state = this.states.get(entityId);
    if (!state) {
      state = { source: "unknown", subSource: "unknown", audioFormat: "unknown", powerState: "unknown", volume: 0 };
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
    const avrDisplayValue = this.getState(entityId).volume;
    return avrDisplayValue;
  }

  /** Get current audio format for an entity */
  getAudioFormat(entityId: string): string {
    return this.getState(entityId).audioFormat;
  }

  /** Get current power state for an entity */
  getPowerState(entityId: string): string {
    return this.getState(entityId).powerState;
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
  setPowerState(entityId: string, powerState: string): boolean {
    const state = this.getState(entityId);
    const normalizedPowerState = powerState.toLowerCase();

    if (state.powerState !== normalizedPowerState) {
      log.info("%s [%s] power state changed from '%s' to '%s'", integrationName, entityId, state.powerState, powerState);
      state.powerState = normalizedPowerState;
      return true;
    }
    return false;
  }

  setVolume(entityId: string, volume: number): boolean {
    const state = this.getState(entityId);
    if (state.volume !== volume) {
      // log.info("%s [%s] volume changed from '%s' to '%s'", integrationName, entityId, state.volume, volume);
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
      const [model, host] = entityId.split(" ");
      if (!model || !host) {
        continue;
      }

      if (buildPhysicalAvrId(model, host) === physicalAvrId && state.source === normalizedSource && this.isEntityOn(entityId)) {
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
      // state.subSource = "unknown"; // Reset sub-source on source change
      this.refreshAvrState(entityId, eiscpInstance, zone, _driver);
      return true;
    }
    return false;
  }

  /** Set sub-source for an entity, returns true if changed */
  setSubSource(entityId: string, subSource: string, eiscpInstance?: EiscpDriver, zone?: string, _driver?: uc.IntegrationAPI): boolean {
    const state = this.getState(entityId);
    const normalizedSubSource = subSource.toLowerCase();

    if (state.subSource !== normalizedSubSource) {
      log.info("%s [%s] sub-source changed from '%s' to '%s'", integrationName, entityId, state.subSource, subSource);
      state.subSource = normalizedSubSource;
      this.refreshAvrState(entityId, eiscpInstance, zone, _driver);
      return true;
    }
    return false;
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
  async refreshAvrState(
    entityId: string,
    eiscpInstance?: EiscpDriver,
    zone?: string,
    driver?: uc.IntegrationAPI,
    queueThreshold?: number,
    commandReceiver?: CommandReceiver
  ): Promise<void> {
    if (!eiscpInstance || !zone || !driver || !entityId) {
      return;
    }

    // Use provided queueThreshold or fallback to default
    const threshold = queueThreshold ?? (typeof eiscpInstance["config"]?.send_delay === "number" ? eiscpInstance["config"].send_delay : 250);

    log.info("%s [%s] querying volume for zone '%s'", integrationName, entityId, zone);
    await eiscpInstance.command({ zone, command: "volume", args: "query" });

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
    }
  }

  public shouldQuery(entityId: string): boolean {
    const last = this.lastQueries.get(entityId) || 0;
    return Date.now() - last > this.QUERY_TTL;
  }

  /** Record that we just queried the given entity. */
  public recordQuery(entityId: string): void {
    this.lastQueries.set(entityId, Date.now());
  }

  /** Record multiple queries at once (used by batch operations). */
  public recordQueries(avrEntries: Iterable<string>): void {
    const now = Date.now();
    for (const e of avrEntries) {
      this.lastQueries.set(e, now);
    }
  }

  async queryAvrState(entityId: string, eiscpInstance: EiscpDriver, zone: string, context: string, queueThreshold?: number): Promise<void> {
    if (!eiscpInstance || !zone || !entityId) return;

    if (!this.shouldQuery(entityId)) {
      log.debug(`${integrationName} [%s] skipping redundant query (%s)`, entityId, context);
      return;
    }
    this.recordQuery(entityId);
    if (!eiscpInstance || !zone || !entityId) return;

    const threshold = queueThreshold ?? (typeof eiscpInstance["config"]?.send_delay === "number" ? eiscpInstance["config"].send_delay : 250);

    log.info(`${integrationName} [%s] Querying AVR state for zone %s (%s)...`, entityId, zone, context);
    try {
      await eiscpInstance.command({ zone, command: "system-power", args: "query" });
      await delay(threshold);
      await eiscpInstance.command({ zone, command: "input-selector", args: "query" });
      await delay(threshold);
      await eiscpInstance.command({ zone, command: "volume", args: "query" });
      await delay(threshold);
      await eiscpInstance.command({ zone, command: "audio-muting", args: "query" });
      await delay(threshold);
      await eiscpInstance.command({ zone, command: "listening-mode", args: "query" });
      await delay(threshold * 3);
      await eiscpInstance.command({ zone, command: "fp-display", args: "query" });
    } catch (err) {
      log.warn(`${integrationName} [%s] Failed to query AVR state (%s):`, entityId, context, err);
    }
  }
}

/** Singleton instance of the state manager */
export const avrStateManager = new AvrStateManager();
