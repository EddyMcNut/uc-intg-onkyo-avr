import EiscpDriver from "./eiscp.js";
import log from "./loggers.js";
import { CONNECTION_TIMEOUT } from "./constants.js";

/** Helper to create a delay promise */
export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Format a non-negative integer as uppercase hexadecimal with a fixed character width. */
export function toHex(n: number, width: number): string {
  return n.toString(16).toUpperCase().padStart(width, "0");
}

// Ensure eISCP connection is ready before sending a command. Triggers reconnect if disconnected, retries up to 5 times. Returns true when connected and ready, false when all attempts are exhausted (caller should return StatusCodes.Timeout).
export async function ensureEiscpConnected(eiscp: EiscpDriver, connectOptions: { model?: string; host?: string; port?: number }, entityId: string, integrationName: string): Promise<boolean> {
  if (!eiscp.connected) {
    log.info("%s [%s] Command received while disconnected, triggering reconnection...", integrationName, entityId);
    try {
      await eiscp.connect(connectOptions);
      await eiscp.waitForConnect(CONNECTION_TIMEOUT);
      log.info("%s [%s] Reconnected on command", integrationName, entityId);
    } catch (connectErr) {
      log.warn("%s [%s] Failed to reconnect on command: %s", integrationName, entityId, connectErr);
    }
  }

  // attempt 0 = immediate check; attempts 1-5 = 1 s apart
  for (let attempt = 0; attempt <= 5; attempt++) {
    if (attempt > 0) await delay(1000);
    try {
      await eiscp.waitForConnect();
      return true;
    } catch (err) {
      if (attempt === 0) {
        log.warn("%s [%s] Could not send command, AVR not connected: %s", integrationName, entityId, err);
      } else if (attempt === 5) {
        log.warn("%s [%s] Could not connect to AVR after 5 attempts: %s", integrationName, entityId, err);
      }
    }
  }
  return false;
}
