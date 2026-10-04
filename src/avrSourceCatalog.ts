// Shared read model for the AVR-reported source list.
// The input store owns normalized names and IDs; this module adds the NRI readiness contract used
// by entities that can render AVR-specific source names.
import { physicalAvrIdFromEntityId } from "./configManager.js";
import { hasCompleteInputSourceInfo } from "./avrInfoStore.js";
import { findAvrInputId, getAvrInputs, type AvrInput } from "./inputSourceStore.js";

export type AvrSourceCatalog = {
  /** Normalized, alphabetically sorted selector and enabled network-service entries. */
  sources: AvrInput[];
  /** True when NRI supplied both selector and network-service lists. */
  complete: boolean;
};

export function getAvrSourceCatalog(entityId: string): AvrSourceCatalog {
  const physicalAvrId = physicalAvrIdFromEntityId(entityId);
  return {
    sources: physicalAvrId ? getAvrInputs(physicalAvrId) : [],
    complete: hasCompleteInputSourceInfo(entityId)
  };
}

export function getAvrSourcesByPhysicalId(physicalAvrId: string): AvrInput[] {
  return getAvrInputs(physicalAvrId);
}

export function findAvrSourceId(physicalAvrId: string, name: string): string | undefined {
  return findAvrInputId(physicalAvrId, name);
}
