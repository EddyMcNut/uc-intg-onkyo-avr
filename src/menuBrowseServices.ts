// Registry of the network services that are browsed through the generic menu-browse store (Tidal, Deezer, Music Server).
// Code that needs "the store / label / select command of service X" looks it up here instead of branching per service.
// TuneIn is not in this registry: it has its own stores (My Presets and Full Menu) and navigation.
import type { MenuBrowseStore } from "./menuBrowseStore.js";
import { tidalStore } from "./tidalBrowserStore.js";
import { deezerStore } from "./deezerBrowserStore.js";
import { musicServerStore } from "./musicServerBrowserStore.js";
import { DEEZER_SERVICE_ID, MUSIC_SERVER_SERVICE_ID, TIDAL_SERVICE_ID } from "./browseServiceContract.js";

export type MenuBrowseServiceId = typeof TIDAL_SERVICE_ID | typeof DEEZER_SERVICE_ID | typeof MUSIC_SERVER_SERVICE_ID;

export interface MenuBrowseService {
  id: MenuBrowseServiceId;
  // Name used in logs.
  label: string;
  store: MenuBrowseStore;
  // Modern (XML/NSV) navigation: the command that opens the service directly.
  modernSelectSourceCommand: string;
}

// Modern navigation: the command that selects a menu item (one-based index) in the given browse layer. The AVR's XML
// browser (Tidal, Deezer, Music Server) uses NLAI to select an item. The older NLSI command selects an
// item in the ten-line display list and is not equivalent: it can appear to work for the first page, but does not
// follow the object/layer selected by the NLA/NLAL browser. NLAI uses a zero-based item index, while our media IDs and
// store use one-based menu indices.
export function xmlBrowseSelectCommand(menuIndex: number, layerNumber: number | undefined): string {
  const layer = Math.max(1, layerNumber ?? 1)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  const index = Math.max(0, menuIndex - 1)
    .toString(16)
    .padStart(4, "0")
    .toUpperCase();
  return `NLAI${layer}${index}----`;
}

const SERVICES: Readonly<Record<MenuBrowseServiceId, MenuBrowseService>> = {
  [TIDAL_SERVICE_ID]: { id: TIDAL_SERVICE_ID, label: "Tidal", store: tidalStore, modernSelectSourceCommand: "NSV1B0" },
  [DEEZER_SERVICE_ID]: { id: DEEZER_SERVICE_ID, label: "Deezer", store: deezerStore, modernSelectSourceCommand: "NSV120" },
  [MUSIC_SERVER_SERVICE_ID]: {
    id: MUSIC_SERVER_SERVICE_ID,
    label: "Music Server",
    store: musicServerStore,
    modernSelectSourceCommand: "NSV000"
  }
};

export function getMenuBrowseService(serviceId: string): MenuBrowseService | undefined {
  return Object.prototype.hasOwnProperty.call(SERVICES, serviceId) ? SERVICES[serviceId as MenuBrowseServiceId] : undefined;
}
