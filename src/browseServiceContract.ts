export const TUNEIN_SERVICE_ID = "tunein";
export const TIDAL_SERVICE_ID = "tidal";

export const BROWSE_SERVICE_IDS = [TUNEIN_SERVICE_ID, TIDAL_SERVICE_ID] as const;
export type BrowseServiceId = (typeof BROWSE_SERVICE_IDS)[number];

const BROWSE_SERVICE_SELECT_SOURCE: Record<BrowseServiceId, string> = {
  [TUNEIN_SERVICE_ID]: "input-selector tunein",
  [TIDAL_SERVICE_ID]: "input-selector tidal"
};

export function isBrowseServiceId(serviceId: string): serviceId is BrowseServiceId {
  return (BROWSE_SERVICE_IDS as readonly string[]).includes(serviceId);
}

export function isBrowseServiceActive(source: string, subSource: string, serviceId: BrowseServiceId): boolean {
  return source === "net" && subSource === serviceId;
}

export function getBrowseServiceSelectSourceCommand(serviceId: BrowseServiceId): string {
  return BROWSE_SERVICE_SELECT_SOURCE[serviceId];
}
