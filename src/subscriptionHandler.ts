import { AvrInstance } from "./types.js";
import ConnectionManager from "./connectionManager.js";
import { avrStateQueryService } from "./avrStateQuery.js";
import { buildPhysicalAvrId } from "./configManager.js";
import { ALL_SUFFIXES } from "./sensorSuffixes.js";
import { CONNECTION_TIMEOUT } from "./constants.js";
import log from "./loggers.js";

const integrationName = "subscriptionHandler:";

// Build regex from the shared suffix constants to strip sensor/select suffixes from entity IDs
const SUFFIX_PATTERN = new RegExp(`(${ALL_SUFFIXES.map((s) => s.replace(/^_/, "")).join("|")})$`);

export default class SubscriptionHandler {
  constructor(
    private connectionManager: ConnectionManager,
    private avrInstances: ReadonlyMap<string, AvrInstance>
  ) {}

  public async handle(entityId: string): Promise<void> {
    // Normalize to base AVR entry (remove sensor/select suffix)
    const baseEntityId = entityId.replace(SUFFIX_PATTERN, "");

    const instance = this.avrInstances.get(baseEntityId);
    if (!instance) {
      log.info("%s [%s] Subscribed entity has no instance yet, waiting for Connect event", integrationName, entityId);
      return;
    }

    if (!avrStateQueryService.shouldQuery(baseEntityId)) {
      log.debug("%s [%s] Subscription received shortly after recent query, skipping", integrationName, baseEntityId);
      return;
    }

    const physicalAVR = buildPhysicalAvrId(instance.config.model, instance.config.ip);
    const physicalConnection = this.connectionManager.getPhysicalConnection(physicalAVR);

    if (!physicalConnection) {
      log.info("%s [%s] Subscribed entity has no connection yet, waiting for Connect event", integrationName, entityId);
      return;
    }

    if (physicalConnection.eiscp.connected) {
      const queueThreshold = instance.config.queueThreshold ?? 0;
      log.info("%s [%s] Subscribed entity connected, querying state (threshold: %dms)", integrationName, entityId, queueThreshold);
      await avrStateQueryService.queryAvrState(baseEntityId, physicalConnection.eiscp, instance.config.zone, "on subscribe", queueThreshold);
      return;
    }

    log.info("%s [%s] Subscribed entity not connected, attempting reconnection...", integrationName, entityId);
    try {
      await physicalConnection.eiscp.connect({
        model: instance.config.model,
        host: instance.config.ip,
        port: instance.config.port
      });
      await physicalConnection.eiscp.waitForConnect(CONNECTION_TIMEOUT);
      log.info("%s [%s] Reconnected on subscription", integrationName, physicalAVR);

      await avrStateQueryService.queryAvrState(baseEntityId, physicalConnection.eiscp, instance.config.zone, "after subscription reconnection", instance.config.queueThreshold ?? 0);
    } catch (err) {
      log.warn("%s [%s] Failed to reconnect on subscription: %s", integrationName, physicalAVR, err);
      this.connectionManager.scheduleReconnect(physicalAVR, physicalConnection, instance.config);
    }
  }
}
