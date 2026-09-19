import EiscpDriver from "./eiscp.js";
import log from "./loggers.js";

const integrationName = "reconnectionManager:";

/** Configuration for reconnection behavior */
export interface ReconnectionConfig {
  /** Progressive timeouts for each attempt (ms) */
  timeouts: readonly number[];
  /** Delay before scheduled reconnection (ms) */
  scheduleDelay: number;
  /** Optional cap for the exponential backoff between consecutive scheduled reconnect failures (ms). */
  maxDelay?: number;
  /** Optional exponent cap for the backoff growth (delay = scheduleDelay * 2^min(attempt, maxBackoffExponent)). */
  maxBackoffExponent?: number;
}

/** Default reconnection configuration */
export const DEFAULT_RECONNECTION_CONFIG: ReconnectionConfig = {
  timeouts: [3000, 5000, 8000],
  scheduleDelay: 30000
};

/** Cap for the exponential backoff (5 minutes) so long outages don't busy-poll the network. */
export const DEFAULT_MAX_RECONNECTION_DELAY = 300000;
/** How far the backoff can grow: 30s → 60s → 120s → 240s before hitting the cap. */
const DEFAULT_MAX_BACKOFF_EXPONENT = 3;

/** Connection info needed for reconnection attempts */
export interface ConnectionInfo {
  model: string;
  host: string;
  port: number;
}

/** Result of a reconnection attempt */
export interface ReconnectionResult {
  success: boolean;
  attempts: number;
}

/** Callback invoked after successful reconnection */
export type OnReconnectedCallback = (physicalAVR: string) => Promise<void>;

/** Callback to check if reconnection should be skipped */
export type ShouldSkipCallback = () => boolean;

// Manages reconnection logic: progressive timeouts, scheduled retries, and timer management.
export class ReconnectionManager {
  private readonly config: ReconnectionConfig;
  private readonly timers: Map<string, NodeJS.Timeout> = new Map();
  private readonly retryCounts: Map<string, number> = new Map();

  constructor(config: ReconnectionConfig = DEFAULT_RECONNECTION_CONFIG) {
    this.config = config;
  }

  // Exponential backoff between consecutive scheduled failures: each further failure waits
  // longer, capped by maxDelay. A successful reconnect or an explicit cancel resets the count.
  private getBackoffDelay(attempt: number): number {
    const exponent = Math.min(attempt, this.config.maxBackoffExponent ?? DEFAULT_MAX_BACKOFF_EXPONENT);
    const delay = this.config.scheduleDelay * 2 ** exponent;
    return Math.min(delay, this.config.maxDelay ?? DEFAULT_MAX_RECONNECTION_DELAY);
  }

  // Attempt to reconnect with progressive timeouts. returns Result indicating success and number of attempts made
  async attemptReconnection(physicalAVR: string, eiscp: EiscpDriver, connectionInfo: ConnectionInfo, context: string = "reconnection"): Promise<ReconnectionResult> {
    for (let attempt = 0; attempt < this.config.timeouts.length; attempt++) {
      const timeout = this.config.timeouts[attempt];
      try {
        log.info("%s [%s] %s attempt %d/%d (timeout: %dms)...", integrationName, physicalAVR, context, attempt + 1, this.config.timeouts.length, timeout);

        await eiscp.connect({
          model: connectionInfo.model,
          host: connectionInfo.host,
          port: connectionInfo.port
        });

        await eiscp.waitForConnect(timeout);

        log.info("%s [%s] Successfully reconnected to AVR (%s)", integrationName, physicalAVR, context);
        return { success: true, attempts: attempt + 1 };
      } catch (err) {
        log.warn("%s [%s] %s attempt %d/%d failed: %s", integrationName, physicalAVR, context, attempt + 1, this.config.timeouts.length, err);
      }
    }

    log.error("%s [%s] Failed to reconnect after all attempts (%s)", integrationName, physicalAVR, context);
    return { success: false, attempts: this.config.timeouts.length };
  }

  // Schedule a reconnection attempt after the configured delay. Clears any existing scheduled attempt for this AVR.
  scheduleReconnection(physicalAVR: string, eiscp: EiscpDriver, connectionInfo: ConnectionInfo, shouldSkip: ShouldSkipCallback, onReconnected: OnReconnectedCallback): void {
    // Clear any existing timer (but keep the retry count for backoff purposes)
    this.clearReconnectionTimer(physicalAVR);

    const attemptIndex = this.retryCounts.get(physicalAVR) ?? 0;
    const delayMs = this.getBackoffDelay(attemptIndex);

    log.info("%s [%s] Scheduling reconnection attempt in %d seconds...", integrationName, physicalAVR, Math.round(delayMs / 1000));

    const timer = setTimeout(async () => {
      log.info("%s [%s] Attempting scheduled reconnection...", integrationName, physicalAVR);

      // Check if reconnection should be skipped
      if (shouldSkip()) {
        log.info("%s [%s] Skipping scheduled reconnection (standby or already connected)", integrationName, physicalAVR);
        this.timers.delete(physicalAVR);
        this.retryCounts.delete(physicalAVR);
        return;
      }

      const result = await this.attemptReconnection(physicalAVR, eiscp, connectionInfo, "Scheduled reconnection");

      if (result.success) {
        this.timers.delete(physicalAVR);
        this.retryCounts.delete(physicalAVR);
        await onReconnected(physicalAVR);
      } else {
        // Back off and schedule another attempt
        this.retryCounts.set(physicalAVR, attemptIndex + 1);
        log.info("%s [%s] All scheduled reconnection attempts failed, will retry again in %d seconds", integrationName, physicalAVR, Math.round(this.getBackoffDelay(attemptIndex + 1) / 1000));
        this.scheduleReconnection(physicalAVR, eiscp, connectionInfo, shouldSkip, onReconnected);
      }
    }, delayMs);

    this.timers.set(physicalAVR, timer);
  }

  private clearReconnectionTimer(physicalAVR: string): void {
    const timer = this.timers.get(physicalAVR);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(physicalAVR);
    }
  }

  // Cancel a scheduled reconnection for a specific AVR.
  cancelScheduledReconnection(physicalAVR: string): boolean {
    const hadTimer = this.timers.has(physicalAVR);
    if (hadTimer) {
      log.info("%s [%s] Clearing reconnect timer", integrationName, physicalAVR);
      this.clearReconnectionTimer(physicalAVR);
    }
    this.retryCounts.delete(physicalAVR);
    return hadTimer;
  }

  // Check if a reconnection is currently scheduled for an AVR.
  hasScheduledReconnection(physicalAVR: string): boolean {
    return this.timers.has(physicalAVR);
  }

  // Cancel all scheduled reconnections.
  cancelAllScheduledReconnections(): void {
    for (const [physicalAVR, timer] of this.timers) {
      log.info("%s [%s] Clearing reconnect timer", integrationName, physicalAVR);
      clearTimeout(timer);
    }
    this.timers.clear();
    this.retryCounts.clear();
  }
}
