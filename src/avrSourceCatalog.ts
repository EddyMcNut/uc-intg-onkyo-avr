// Shared read model for the AVR-reported source list.
// The input store owns normalized names and IDs; this module adds the NRI readiness contract used
// by entities that can render AVR-specific source names.
import { physicalAvrIdFromEntityId } from "./configManager.js";
import type { AvrInput } from "./inputSourceStore.js";
import { sharedAvrContexts, type AvrContextRegistry } from "./avrContext.js";

// The `contexts` parameters default to the shared registry during the item-10 migration (see avrContext.ts).

export type AvrSourceCatalog = {
  // Normalized, alphabetically sorted selector and enabled network-service entries.
  sources: AvrInput[];
  // True when NRI supplied both selector and network-service lists.
  complete: boolean;
};

export function getAvrSourceCatalog(entityId: string, contexts: AvrContextRegistry = sharedAvrContexts): AvrSourceCatalog {
  const physicalAvrId = physicalAvrIdFromEntityId(entityId);
  return {
    sources: physicalAvrId ? contexts.get(physicalAvrId).inputs.list() : [],
    complete: contexts.forEntity(entityId)?.avrInfo.hasCompleteInputSourceInfo() ?? false
  };
}

export function getAvrSourcesByPhysicalId(physicalAvrId: string, contexts: AvrContextRegistry = sharedAvrContexts): AvrInput[] {
  return contexts.get(physicalAvrId).inputs.list();
}

export function findAvrSourceId(physicalAvrId: string, name: string, contexts: AvrContextRegistry = sharedAvrContexts): string | undefined {
  return contexts.get(physicalAvrId).inputs.findId(name);
}
