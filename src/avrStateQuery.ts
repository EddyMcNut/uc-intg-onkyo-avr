/**
 * AVR state query service.
 *
 * Manages the protocol-level query commands sent to the AVR (system-power, volume, etc.)
 * and the debounce mechanism that prevents redundant queries within a short window.
 *
 * Extracted from AvrStateManager so that class can focus solely on per-entity state tracking.
 */
import { EiscpDriver } from "./eiscp.js";
import log from "./loggers.js";
import { delay } from "./utils.js";

const integrationName = "avrStateQuery:";

const QUERY_TTL = 5000; // ms — minimum time between queries for the same entity

class AvrStateQueryService {
  private readonly lastQueries: Map<string, number> = new Map();

  /** Returns true when enough time has passed since the last query for this entity. */
  shouldQuery(entityId: string): boolean {
    const last = this.lastQueries.get(entityId) ?? 0;
    return Date.now() - last > QUERY_TTL;
  }

  /** Record that the given entity was just queried. */
  recordQuery(entityId: string): void {
    this.lastQueries.set(entityId, Date.now());
  }

  /** Record multiple queries at once (used by batch operations). */
  recordQueries(avrEntries: Iterable<string>): void {
    const now = Date.now();
    for (const e of avrEntries) {
      this.lastQueries.set(e, now);
    }
  }

  /**
   * Send the full set of EISCP state-query commands for one AVR zone.
   * Includes debounce: returns early if the entity was queried too recently.
   */
  async queryAvrState(entityId: string, eiscpInstance: EiscpDriver, zone: string, context: string, queueThreshold?: number): Promise<void> {
    if (!eiscpInstance || !zone || !entityId) return;

    if (!this.shouldQuery(entityId)) {
      log.debug(`${integrationName} [%s] skipping redundant query (%s)`, entityId, context);
      return;
    }
    this.recordQuery(entityId);

    const threshold = queueThreshold ?? (typeof eiscpInstance.eiscpConfig?.send_delay === "number" ? eiscpInstance.eiscpConfig.send_delay : 250);

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

/** Singleton instance shared by all callers. */
export const avrStateQueryService = new AvrStateQueryService();
