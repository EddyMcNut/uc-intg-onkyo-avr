export const TUNEIN_SERVICE_ID = "tunein";
export const TIDAL_SERVICE_ID = "tidal";
export const DEEZER_SERVICE_ID = "deezer";
export const MUSIC_SERVER_SERVICE_ID = "music-server";

export const BROWSE_SERVICE_IDS = [TUNEIN_SERVICE_ID, TIDAL_SERVICE_ID, DEEZER_SERVICE_ID, MUSIC_SERVER_SERVICE_ID] as const;
export type BrowseServiceId = (typeof BROWSE_SERVICE_IDS)[number];

export function isBrowseServiceId(serviceId: string): serviceId is BrowseServiceId {
  return (BROWSE_SERVICE_IDS as readonly string[]).includes(serviceId);
}

export function isBrowseServiceActive(source: string, subSource: string, serviceId: BrowseServiceId): boolean {
  return source === "net" && subSource === serviceId;
}

// The browse service ids are also their input-selector aliases (see networkServices.ts and the SLI value mappings).
export function getBrowseServiceSelectSourceCommand(serviceId: BrowseServiceId): string {
  return `input-selector ${serviceId}`;
}
