// Subscription logic extracted from OnkyoDriver to reduce file size and make behaviour easier to test.

import { AvrInstance } from "./types.js";
import ConnectionManager from "./connectionManager.js";
import { avrStateQueryService } from "./avrStateQuery.js";
import { buildPhysicalAvrId } from "./configManager.js";
import log from "./loggers.js";

const integrationName = "subscriptionHandler:";

export default class SubscriptionHandler {
  constructor(
    private connectionManager: ConnectionManager,
    private avrInstances: ReadonlyMap<string, AvrInstance>
  ) {}

  public async handle(entityId: string): Promise<void> {
    // Normalize to base AVR entry (remove sensor/select suffix)
    const baseEntityId = entityId.replace(
      /_(volume_sensor|audio_input_sensor|audio_output_sensor|source_sensor|video_input_sensor|video_output_sensor|output_display_sensor|front_panel_display_sensor|mute_sensor|listening_mode|input_selector)$/,
      ""
    );

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
      await physicalConnection.eiscp.waitForConnect(3000);
      log.info("%s [%s] Reconnected on subscription", integrationName, physicalAVR);

      await avrStateQueryService.queryAvrState(baseEntityId, physicalConnection.eiscp, instance.config.zone, "after subscription reconnection", instance.config.queueThreshold ?? 0);
    } catch (err) {
      log.warn("%s [%s] Failed to reconnect on subscription: %s", integrationName, physicalAVR, err);
      this.connectionManager.scheduleReconnect(physicalAVR, physicalConnection, instance.config);
    }
  }
}
