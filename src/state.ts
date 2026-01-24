import * as uc from "@unfoldedcircle/integration-api";
import { EiscpDriver } from "./eiscp.js";
import log from "./loggers.js";

const integrationName = "Onkyo-Integration (state):";

/** State for a single AVR entity */
interface EntityState {
  source: string;
  subSource: string;
}

/**
 * Manages per-entity state for AVR sources.
 * Each entity (AVR zone) has its own independent source tracking.
 */
class AvrStateManager {
  private states: Map<string, EntityState> = new Map();

  /** Get or create state for an entity */
  private getState(entityId: string): EntityState {
    let state = this.states.get(entityId);
    if (!state) {
      state = { source: "unknown", subSource: "unknown" };
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

  /** Set source for an entity, returns true if changed */
  setSource(
    entityId: string,
    source: string,
    eiscpInstance?: EiscpDriver,
    zone?: string,
    driver?: uc.IntegrationAPI
  ): boolean {
    const state = this.getState(entityId);
    const normalizedSource = source.toLowerCase();
    
    if (state.source !== normalizedSource) {
      log.info("%s [%s] source changed from '%s' to '%s'", integrationName, entityId, state.source, source);
      state.source = normalizedSource;
      state.subSource = "unknown"; // Reset sub-source on source change
      this.refreshAvrState(entityId, eiscpInstance, zone, driver);
      return true;
    }
    return false;
  }

  /** Set sub-source for an entity, returns true if changed */
  setSubSource(
    entityId: string,
    subSource: string,
    eiscpInstance?: EiscpDriver,
    zone?: string,
    driver?: uc.IntegrationAPI
  ): boolean {
    const state = this.getState(entityId);
    const normalizedSubSource = subSource.toLowerCase();
    
    if (state.subSource !== normalizedSubSource) {
      log.info("%s [%s] sub-source changed from '%s' to '%s'", integrationName, entityId, state.subSource, subSource);
      state.subSource = normalizedSubSource;
      this.refreshAvrState(entityId, eiscpInstance, zone, driver);
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
  private async refreshAvrState(
    entityId: string,
    eiscpInstance?: EiscpDriver,
    zone?: string,
    driver?: uc.IntegrationAPI,
    queueThreshold?: number
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
    await new Promise((resolve) => setTimeout(resolve, threshold * 3));
    await eiscpInstance.command({ zone, command: "fp-display", args: "query" });
  }
}

/** Singleton instance of the state manager */
export const avrStateManager = new AvrStateManager();