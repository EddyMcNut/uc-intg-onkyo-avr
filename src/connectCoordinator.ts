/*jslint node:true nomen:true*/
"use strict";
import log from "./loggers.js";
import { IntegrationConfig, AvrConfig, buildPhysicalAvrId, buildEntityId } from "./configManager.js";
import ConnectionManager from "./connectionManager.js";
import { DEFAULT_QUEUE_THRESHOLD } from "./configManager.js";
import { delay } from "./utils.js";

const logSource = "connectCoordinator:";

import { AvrInstance, PhysicalConnection, CreateCommandReceiverFactory, CreateCommandSenderFn, QueryAvrStateFn, QueryAllZonesStateFn } from "./types.js";

// Create or refresh zone instances in the given map.
export async function ensureZoneInstances(
  instances: Map<string, AvrInstance>,
  avrs: AvrConfig[],
  getPhysicalConnection: (physicalAvr: string) => PhysicalConnection | undefined,
  createAvrSpecificConfig: (cfg: AvrConfig) => IntegrationConfig,
  createCommandSender: CreateCommandSenderFn
): Promise<void> {
  for (const avrConfig of avrs) {
    const physicalAVR = buildPhysicalAvrId(avrConfig.model, avrConfig.ip);
    const avrEntry = buildEntityId(avrConfig.model, avrConfig.ip, avrConfig.zone);
    const avrSpecificConfig = createAvrSpecificConfig(avrConfig);

    const existing = instances.get(avrEntry);
    if (existing) {
      existing.config = avrConfig;
      existing.commandSender.updateConfig(avrSpecificConfig);
      log.info("%s [%s] Zone instance already exists (runtime config refreshed)", logSource, avrEntry);
      continue;
    }

    const physicalConnection = getPhysicalConnection(physicalAVR);
    if (!physicalConnection) {
      log.warn("%s [%s] Cannot create zone instance - no physical connection object exists", logSource, avrEntry);
      continue;
    }

    const commandSender = createCommandSender(avrSpecificConfig, physicalConnection.eiscp, physicalConnection.commandReceiver);
    instances.set(avrEntry, { config: avrConfig, commandSender });
    log.info("%s [%s] Zone instance created%s", logSource, avrEntry, physicalConnection.eiscp.connected ? " (connected)" : " (will connect when AVR available)");
  }
}

export default class ConnectCoordinator {
  private connectionManager: ConnectionManager;
  private avrInstances: Map<string, AvrInstance>;
  private queryAvrState: QueryAvrStateFn;
  private queryAllZonesState: QueryAllZonesStateFn;
  private readonly createAvrSpecificConfig: (cfg: AvrConfig) => IntegrationConfig;

  constructor(
    connectionManager: ConnectionManager,
    avrInstances: Map<string, AvrInstance>,
    queryAvrState: QueryAvrStateFn,
    queryAllZonesState: QueryAllZonesStateFn,
    createAvrSpecificConfig?: (cfg: AvrConfig) => IntegrationConfig
  ) {
    this.connectionManager = connectionManager;
    this.avrInstances = avrInstances;
    this.queryAvrState = queryAvrState;
    this.queryAllZonesState = queryAllZonesState;
    this.createAvrSpecificConfig = createAvrSpecificConfig ?? ((c) => ({ ...c, queueThreshold: c.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD }) as IntegrationConfig);
  }

  // Orchestrate connecting physical AVRs and creating zone instances. Returns true if any zone instances exist after connect.
  async connect(config: IntegrationConfig, createCommandReceiverFactory: CreateCommandReceiverFactory, createCommandSender: CreateCommandSenderFn): Promise<boolean> {
    if (!config || !config.avrs || config.avrs.length === 0) {
      log.info("%s No AVRs configured", logSource);
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
        // Collect all zones configured for this physical AVR
        const configuredZones = config.avrs.filter((avr) => buildPhysicalAvrId(avr.model, avr.ip) === physicalAVR).map((avr) => avr.zone);

        // Create physical connection using connection manager, which will schedule reconnect on failure
        physicalConnection = await this.connectionManager.createAndConnect(physicalAVR, avrConfig, createCommandReceiverFactory(avrConfig), configuredZones);
      } else {
        // Existing connection — refresh config regardless of connected state
        const configuredZones = config.avrs.filter((avr) => buildPhysicalAvrId(avr.model, avr.ip) === physicalAVR).map((avr) => avr.zone);
        const avrSpecificConfig = this.createAvrSpecificConfig(avrConfig);
        this.connectionManager.updateConnectionConfig(physicalAVR, avrConfig, configuredZones, avrSpecificConfig);

        if (!physicalConnection.eiscp.connected) {
          log.info("%s [%s] TCP connection lost, reconnecting to AVR...", logSource, physicalAVR);
          const result = await this.connectionManager.attemptReconnection(physicalAVR);
          if (result.success) {
            this.connectionManager.cancelScheduledReconnection(physicalAVR);
            await this.queryAllZonesState(physicalAVR, physicalConnection.eiscp, "after reconnection in connectCoordinator");
            alreadyQueriedAvrs.add(physicalAVR);
          }
        }
      }
    }

    // STEP 2: Create zone instances for all zones
    for (const avrConfig of config.avrs) {
      await ensureZoneInstances(
        this.avrInstances,
        [avrConfig],
        (p) => this.connectionManager.getPhysicalConnection(p),
        (c) => this.createAvrSpecificConfig(c),
        createCommandSender
      );
    }

    // Query state for all connected AVRs (skip those already queried during reconnection)
    const queriedPhysicalAvrs = new Set<string>();
    for (const [avrEntry, instance] of this.avrInstances) {
      const physicalAVR = buildPhysicalAvrId(instance.config.model, instance.config.ip);

      if (alreadyQueriedAvrs.has(physicalAVR)) continue;

      const physicalConnection = this.connectionManager.getPhysicalConnection(physicalAVR);
      if (physicalConnection) {
        const queueThreshold = instance.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;
        if (queriedPhysicalAvrs.has(physicalAVR)) {
          await delay(queueThreshold);
        }
        queriedPhysicalAvrs.add(physicalAVR);
        await this.queryAvrState(avrEntry, physicalConnection.eiscp, "after connection");
      }
    }

    // Return whether we have any zone instances
    return this.avrInstances.size > 0;
  }
}
