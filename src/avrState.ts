import * as uc from "@unfoldedcircle/integration-api";
import { EiscpDriver } from "./eiscp.js";
import log from "./loggers.js";

const integrationName = "avrState:";

/** State for a single AVR entity */
interface EntityState {
  source: string;
  subSource: string;
  audioFormat: string;
  powerState: string;
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
      state = { source: "unknown", subSource: "unknown", audioFormat: "unknown", powerState: "unknown" };
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

  /** Check if entity is powered on */
  isEntityOn(entityId: string): boolean {
    const powerState = this.getState(entityId).powerState;
    return powerState === "on";
  }

  /** Set source for an entity, returns true if changed */
  setSource(entityId: string, source: string, eiscpInstance?: EiscpDriver, zone?: string, _driver?: uc.IntegrationAPI): boolean {
    const state = this.getState(entityId);
    const normalizedSource = source.toLowerCase();

    if (state.source !== normalizedSource) {
      log.info("%s [%s] source changed from '%s' to '%s'", integrationName, entityId, state.source, source);
      state.source = normalizedSource;
      state.subSource = "unknown"; // Reset sub-source on source change
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
  async refreshAvrState(entityId: string, eiscpInstance?: EiscpDriver, zone?: string, driver?: uc.IntegrationAPI, queueThreshold?: number): Promise<void> {
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
    await new Promise((resolve) => setTimeout(resolve, threshold * 3));
    await eiscpInstance.command({ zone, command: "listening-mode", args: "query" });
    await eiscpInstance.command({ zone, command: "fp-display", args: "query" });
  }

  /** Query AVR system & general state: power, input, volume, muting, listening mode, fp-display */
  /**
   * Determine whether enough time has passed since the last state query for
   * this entity.  Public because callers outside the state manager (e.g.
   * SubscriptionHandler) need to consult it.
   */
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
      await new Promise((resolve) => setTimeout(resolve, threshold));
      await eiscpInstance.command({ zone, command: "input-selector", args: "query" });
      await new Promise((resolve) => setTimeout(resolve, threshold));
      await eiscpInstance.command({ zone, command: "volume", args: "query" });
      await new Promise((resolve) => setTimeout(resolve, threshold));
      await eiscpInstance.command({ zone, command: "audio-muting", args: "query" });
      await new Promise((resolve) => setTimeout(resolve, threshold));
      await eiscpInstance.command({ zone, command: "listening-mode", args: "query" });
      await new Promise((resolve) => setTimeout(resolve, threshold * 3));
      await eiscpInstance.command({ zone, command: "fp-display", args: "query" });
    } catch (err) {
      log.warn(`${integrationName} [%s] Failed to query AVR state (%s):`, entityId, context, err);
    }
  }
}

/** Singleton instance of the state manager */
export const avrStateManager = new AvrStateManager();
