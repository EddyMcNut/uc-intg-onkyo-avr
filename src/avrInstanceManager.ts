/*jslint node:true nomen:true*/
"use strict";
import { AvrConfig, buildEntityId } from "./configManager.js";
import { CommandSender } from "./commandSender.js";
import { buildPhysicalAvrId } from "./configManager.js";
import log from "./loggers.js";

const integrationName = "avrInstanceManager:";

export interface AvrInstance {
  config: AvrConfig;
  commandSender: CommandSender;
}

import { PhysicalConnection, CreateCommandSenderFn } from "./types.js";

export default class AvrInstanceManager {
  private instances: Map<string, AvrInstance> = new Map();

  constructor() {}

  getInstance(entry: string): AvrInstance | undefined {
    return this.instances.get(entry);
  }

  hasInstance(entry: string): boolean {
    return this.instances.has(entry);
  }

  setInstance(entry: string, instance: AvrInstance): void {
    this.instances.set(entry, instance);
  }

  removeInstance(entry: string): boolean {
    return this.instances.delete(entry);
  }

  clearInstances(): void {
    this.instances.clear();
  }

  entries(): IterableIterator<[string, AvrInstance]> {
    return this.instances.entries();
  }

  values(): IterableIterator<AvrInstance> {
    return this.instances.values();
  }

  // Create zone instances for provided avrs array. This mirrors previous OnkyoDriver behavior.
  // getPhysicalConnection should return a PhysicalConnection for a given physicalAvr id.
  async ensureZoneInstances(
    avrs: AvrConfig[],
    getPhysicalConnection: (physicalAvr: string) => PhysicalConnection | undefined,
    createAvrSpecificConfig: (cfg: AvrConfig) => any,
    createCommandSender: CreateCommandSenderFn
  ): Promise<void> {
    for (const avrConfig of avrs) {
      const physicalAVR = buildPhysicalAvrId(avrConfig.model, avrConfig.ip);
      const avrEntry = buildEntityId(avrConfig.model, avrConfig.ip, avrConfig.zone);

      if (this.hasInstance(avrEntry)) {
        log.info("%s [%s] Zone instance already exists", integrationName, avrEntry);
        continue;
      }

      const physicalConnection = getPhysicalConnection(physicalAVR);
      if (!physicalConnection) {
        log.warn("%s [%s] Cannot create zone instance - no physical connection object exists", integrationName, avrEntry);
        continue;
      }

      // Create per-zone config for command sender
      const avrSpecificConfig = createAvrSpecificConfig(avrConfig);

      // Create command sender for this zone (uses shared eiscp from physical connection)
      const commandSender = createCommandSender(avrSpecificConfig, physicalConnection.eiscp);

      // Store zone instance (references shared eiscp)
      this.setInstance(avrEntry, {
        config: avrConfig,
        commandSender
      });

      log.info("%s [%s] Zone instance created%s", integrationName, avrEntry, physicalConnection.eiscp.connected ? " (connected)" : " (will connect when AVR available)");
    }
  }
}
