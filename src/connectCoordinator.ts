/*jslint node:true nomen:true*/
"use strict";
import log from "./loggers.js";
import { OnkyoConfig, AvrConfig, buildPhysicalAvrId } from "./configManager.js";
import ConnectionManager from "./connectionManager.js";
import AvrInstanceManager from "./avrInstanceManager.js";
import { DEFAULT_QUEUE_THRESHOLD } from "./configManager.js";

const integrationName = "connectCoordinator:";

import { CreateCommandReceiverFactory, CreateCommandSenderFn, QueryAvrStateFn, QueryAllZonesStateFn } from "./types.js";

export default class ConnectCoordinator {
  private connectionManager: ConnectionManager;
  private avrInstanceManager: AvrInstanceManager;
  private queryAvrState: QueryAvrStateFn;
  private queryAllZonesState: QueryAllZonesStateFn;

  constructor(connectionManager: ConnectionManager, avrInstanceManager: AvrInstanceManager, queryAvrState: QueryAvrStateFn, queryAllZonesState: QueryAllZonesStateFn) {
    this.connectionManager = connectionManager;
    this.avrInstanceManager = avrInstanceManager;
    this.queryAvrState = queryAvrState;
    this.queryAllZonesState = queryAllZonesState;
  }

  /** Orchestrate connecting physical AVRs and creating zone instances. Returns true if any zone instances exist after connect. */
  async connect(config: OnkyoConfig, createCommandReceiverFactory: CreateCommandReceiverFactory, createCommandSender: CreateCommandSenderFn): Promise<boolean> {
    if (!config || !config.avrs || config.avrs.length === 0) {
      log.info("%s No AVRs configured", integrationName);
      return false;
    }

    // STEP 1: Create physical connections (one per unique IP)
    const uniqueAvrs = new Map<string, AvrConfig>();
    for (const avrConfig of config.avrs) {
      const physicalAVR = buildPhysicalAvrId(avrConfig.model, avrConfig.ip);
      if (!uniqueAvrs.has(physicalAVR)) uniqueAvrs.set(physicalAVR, avrConfig);
    }

    const alreadyQueriedAvrs = new Set<string>();

    for (const [physicalAVR, avrConfig] of uniqueAvrs) {
      let physicalConnection = this.connectionManager.getPhysicalConnection(physicalAVR);

      if (!physicalConnection) {
        // Create physical connection using connection manager, which will schedule reconnect on failure
        physicalConnection = await this.connectionManager.createAndConnect(physicalAVR, avrConfig, createCommandReceiverFactory(avrConfig));
      } else if (!physicalConnection.eiscp.connected) {
        log.info("%s [%s] TCP connection lost, reconnecting to AVR...", integrationName, physicalAVR);
        const result = await this.connectionManager.attemptReconnection(physicalAVR);
        if (result.success) {
          this.connectionManager.cancelScheduledReconnection(physicalAVR);
          await this.queryAllZonesState(physicalAVR, physicalConnection.eiscp, "after reconnection in connectCoordinator");
          alreadyQueriedAvrs.add(physicalAVR);
        }
      }
    }

    // STEP 2: Create zone instances for all zones
    // Use the AvrInstanceManager helper to create instances
    for (const avrConfig of config.avrs) {
      await this.avrInstanceManager.ensureZoneInstances(
        [avrConfig],
        (p) => this.connectionManager.getPhysicalConnection(p),
        (c) => ({ ...c, queueThreshold: c.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD }),
        createCommandSender
      );
    }

    // Query state for all connected AVRs (skip those already queried during reconnection)
    const queriedPhysicalAvrs = new Set<string>();
    for (const [avrEntry, instance] of this.avrInstanceManager.entries()) {
      const physicalAVR = buildPhysicalAvrId(instance.config.model, instance.config.ip);

      if (alreadyQueriedAvrs.has(physicalAVR)) continue;

      const physicalConnection = this.connectionManager.getPhysicalConnection(physicalAVR);
      if (physicalConnection) {
        const queueThreshold = instance.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;
        if (queriedPhysicalAvrs.has(physicalAVR)) {
          await new Promise((resolve) => setTimeout(resolve, queueThreshold));
        }
        queriedPhysicalAvrs.add(physicalAVR);
        await this.queryAvrState(avrEntry, physicalConnection.eiscp, "after connection");
      }
    }

    // Return whether we have any zone instances
    return !!Array.from(this.avrInstanceManager.entries()).length;
  }
}
