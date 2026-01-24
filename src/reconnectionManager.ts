import EiscpDriver from "./eiscp.js";
import log from "./loggers.js";

const integrationName = "conmgr:";

/** Configuration for reconnection behavior */
export interface ReconnectionConfig {
  /** Progressive timeouts for each attempt (ms) */
  timeouts: readonly number[];
  /** Delay before scheduled reconnection (ms) */
  scheduleDelay: number;
}

/** Default reconnection configuration */
export const DEFAULT_RECONNECTION_CONFIG: ReconnectionConfig = {
  timeouts: [3000, 5000, 8000],
  scheduleDelay: 30000
};

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

/**
 * Manages reconnection logic for AVR connections.
 * Handles progressive timeouts, scheduled retries, and timer management.
 */
export class ReconnectionManager {
  private readonly config: ReconnectionConfig;
  private readonly timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: ReconnectionConfig = DEFAULT_RECONNECTION_CONFIG) {
    this.config = config;
  }

  /**
   * Attempt to reconnect with progressive timeouts.
   * @returns Result indicating success and number of attempts made
   */
  async attemptReconnection(
    physicalAVR: string,
    eiscp: EiscpDriver,
    connectionInfo: ConnectionInfo,
    context: string = "reconnection"
  ): Promise<ReconnectionResult> {
    for (let attempt = 0; attempt < this.config.timeouts.length; attempt++) {
      const timeout = this.config.timeouts[attempt];
      try {
        log.info(
          "%s [%s] %s attempt %d/%d (timeout: %dms)...",
          integrationName,
          physicalAVR,
          context,
          attempt + 1,
          this.config.timeouts.length,
          timeout
        );

        await eiscp.connect({
          model: connectionInfo.model,
          host: connectionInfo.host,
          port: connectionInfo.port
        });

        await eiscp.waitForConnect(timeout);

        log.info("%s [%s] Successfully reconnected to AVR (%s)", integrationName, physicalAVR, context);
        return { success: true, attempts: attempt + 1 };
      } catch (err) {
        log.warn(
          "%s [%s] %s attempt %d/%d failed: %s",
          integrationName,
          physicalAVR,
          context,
          attempt + 1,
          this.config.timeouts.length,
          err
        );
      }
    }

    log.error("%s [%s] Failed to reconnect after all attempts (%s)", integrationName, physicalAVR, context);
    return { success: false, attempts: this.config.timeouts.length };
  }

  /**
   * Schedule a reconnection attempt after the configured delay.
   * Clears any existing scheduled attempt for this AVR.
   */
  scheduleReconnection(
    physicalAVR: string,
    eiscp: EiscpDriver,
    connectionInfo: ConnectionInfo,
    shouldSkip: ShouldSkipCallback,
    onReconnected: OnReconnectedCallback
  ): void {
    // Clear any existing timer
    this.cancelScheduledReconnection(physicalAVR);

    log.info(
      "%s [%s] Scheduling reconnection attempt in %d seconds...",
      integrationName,
      physicalAVR,
      this.config.scheduleDelay / 1000
    );

    const timer = setTimeout(async () => {
      log.info("%s [%s] Attempting scheduled reconnection...", integrationName, physicalAVR);

      // Check if reconnection should be skipped
      if (shouldSkip()) {
        log.info("%s [%s] Skipping scheduled reconnection (standby or already connected)", integrationName, physicalAVR);
        this.timers.delete(physicalAVR);
        return;
      }

      const result = await this.attemptReconnection(physicalAVR, eiscp, connectionInfo, "Scheduled reconnection");

      if (result.success) {
        this.timers.delete(physicalAVR);
        await onReconnected(physicalAVR);
      } else {
        // Schedule another attempt
        log.info(
          "%s [%s] All scheduled reconnection attempts failed, will retry again in %d seconds",
          integrationName,
          physicalAVR,
          this.config.scheduleDelay / 1000
        );
        this.scheduleReconnection(physicalAVR, eiscp, connectionInfo, shouldSkip, onReconnected);
      }
    }, this.config.scheduleDelay);

    this.timers.set(physicalAVR, timer);
  }

  /**
   * Cancel a scheduled reconnection for a specific AVR.
   */
  cancelScheduledReconnection(physicalAVR: string): boolean {
    const timer = this.timers.get(physicalAVR);
    if (timer) {
      log.info("%s [%s] Clearing reconnect timer", integrationName, physicalAVR);
      clearTimeout(timer);
      this.timers.delete(physicalAVR);
      return true;
    }
    return false;
  }

  /**
   * Cancel all scheduled reconnections.
   */
  cancelAllScheduledReconnections(): void {
    for (const [physicalAVR, timer] of this.timers) {
      log.info("%s [%s] Clearing reconnect timer", integrationName, physicalAVR);
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  /**
   * Check if a reconnection is currently scheduled for an AVR.
   */
  hasScheduledReconnection(physicalAVR: string): boolean {
    return this.timers.has(physicalAVR);
  }
}
