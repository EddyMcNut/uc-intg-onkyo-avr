import { physicalAvrIdFromEntityId } from "./configManager.js";

export type TidalMenuOption = {
  menuIndex: number;
  title: string;
  mediaId: string;
  thumbnail?: string;
  isBrowsable: boolean;
};

export type TidalBrowseState = {
  optionsByMenuIndex: Map<number, TidalMenuOption>;
  thumbnailByTitle: Map<string, string>;
  backgroundSignature: string;
  showMainMenuShortcut: boolean;
  traceNextSelectionAfterMainMenu: boolean;
  /** True immediately after browse callback finishes streaming an NLS list — AVR is in list mode. */
  listModeActive: boolean;
  /** Title of the currently playing track, used to highlight it in the browse list. */
  nowPlayingTitle: string;
  /** Total number of items in the current list as reported by NLT. 0 = unknown. */
  totalListItemCount: number;
  /** Absolute cursor offset reported by NLT (cccc field). Used to map display-relative NLS lines to absolute indices. */
  nlsCursorOffset: number;
  /** Layer number from NLT ll field (chars 12-13). Used as the NLAL layer parameter for this list. 0 = unknown. */
  nlsLayerNumber: number;
  /** True while the harvest loop in entityRegistrar is scrolling to collect all list items. Prevents U0 from clearing the map. */
  harvestMode: boolean;
  /** True after a non-browsable (song) item is selected via NLSI. Prevents the spontaneous post-playback NLS from the AVR (which starts at U0/index 1) from wiping the harvested list. Cleared when NLSI is sent for a browsable (directory) item or on full state reset. */
  browseListFrozen: boolean;
};

const tidalBrowseStateByPhysicalAvr = new Map<string, TidalBrowseState>();

function buildTidalMenuMediaId(menuIndex: number, title: string): string {
  return `tidal:menu:${menuIndex}:${encodeURIComponent(title)}`;
}

export function getTidalBrowseState(entityId: string): TidalBrowseState | null {
  const physicalAvrId = physicalAvrIdFromEntityId(entityId);
  if (!physicalAvrId) {
    return null;
  }

  const existing = tidalBrowseStateByPhysicalAvr.get(physicalAvrId);
  if (existing) {
    return existing;
  }

  const created: TidalBrowseState = {
    optionsByMenuIndex: new Map<number, TidalMenuOption>(),
    thumbnailByTitle: new Map<string, string>(),
    backgroundSignature: "",
    showMainMenuShortcut: false,
    traceNextSelectionAfterMainMenu: false,
    listModeActive: false,
    nowPlayingTitle: "",
    totalListItemCount: 0,
    nlsCursorOffset: 0,
    nlsLayerNumber: 0,
    harvestMode: false,
    browseListFrozen: false
  };
  tidalBrowseStateByPhysicalAvr.set(physicalAvrId, created);
  return created;
}

export function addTidalMenuOption(entityId: string, menuIndex: number, title: string, thumbnailResolver?: (state: TidalBrowseState, title: string) => string): void {
  const state = getTidalBrowseState(entityId);
  if (!state) {
    return;
  }

  // browseListFrozen: ignore burst of NLS entries sent post-playback (U0-U9) — must not overwrite the harvested list.
  if (state.browseListFrozen) {
    return;
  }

  // Harvest mode: accumulate items with absolute indices. Normal mode: menuIndex=1 (U0) starts a new list — clear.
  if (!state.harvestMode && menuIndex <= 1) {
    state.optionsByMenuIndex.clear();
  }

  // Songs have " - " in their title ("Artist - Song Name"); directories/menus don't.
  const isBrowsable = !title.includes(" - ");

  state.optionsByMenuIndex.set(menuIndex, {
    menuIndex,
    title,
    mediaId: buildTidalMenuMediaId(menuIndex, title),
    thumbnail: thumbnailResolver ? thumbnailResolver(state, title) : undefined,
    isBrowsable
  });
}

export function listTidalMenuOptions(entityId: string): TidalMenuOption[] {
  const state = getTidalBrowseState(entityId);
  if (!state) {
    return [];
  }

  return [...state.optionsByMenuIndex.values()].sort((a, b) => a.menuIndex - b.menuIndex);
}

// Returns the count of items forming an unbroken sequence from menuIndex=1, used as the NLAL offset.
export function getContiguousItemCount(entityId: string): number {
  const state = getTidalBrowseState(entityId);
  if (!state || state.optionsByMenuIndex.size === 0) return 0;
  const keys = [...state.optionsByMenuIndex.keys()].sort((a, b) => a - b);
  let expected = 1;
  for (const key of keys) {
    if (key !== expected) break;
    expected++;
  }
  return expected - 1;
}

export function resetTidalBrowseState(entityId: string): void {
  const state = getTidalBrowseState(entityId);
  if (!state) {
    return;
  }

  state.optionsByMenuIndex.clear();
  state.showMainMenuShortcut = false;
  state.totalListItemCount = 0;
  state.nlsCursorOffset = 0;
  state.nlsLayerNumber = 0;
  state.harvestMode = false;
  state.browseListFrozen = false;
}

export function consumeTraceNextTidalSelectionAfterMainMenu(entityId: string): boolean {
  const state = getTidalBrowseState(entityId);
  if (!state || !state.traceNextSelectionAfterMainMenu) {
    return false;
  }

  state.traceNextSelectionAfterMainMenu = false;
  return true;
}

export function consumeTidalListModeActive(entityId: string): boolean {
  const state = getTidalBrowseState(entityId);
  if (!state || !state.listModeActive) return false;
  state.listModeActive = false;
  return true;
}

export function getTidalThumbnailForTitle(entityId: string, title: string, resolver: (state: TidalBrowseState, title: string) => string): string {
  const state = getTidalBrowseState(entityId);
  if (!state) {
    return "";
  }
  return resolver(state, title);
}
