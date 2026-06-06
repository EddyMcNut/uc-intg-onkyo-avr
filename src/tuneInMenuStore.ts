import { physicalAvrIdFromEntityId } from "./configManager.js";

export type TuneInMenuOption = {
  menuIndex: number;
  title: string;
  mediaId: string;
  thumbnail?: string;
  isBrowsable: boolean;
};

export type TuneInMenuBrowseState = {
  optionsByMenuIndex: Map<number, TuneInMenuOption>;
  thumbnailByTitle: Map<string, string>;
  backgroundSignature: string;
  showMainMenuShortcut: boolean;
  traceNextSelectionAfterMainMenu: boolean;
  /** True immediately after browse callback finishes streaming an NLS list — AVR is in list mode. */
  listModeActive: boolean;
  /** Station name currently playing (from NTI/metadata), used to highlight it in the browse list. */
  nowPlayingStation: string;
  /** Total number of items in the current list as reported by NLT. 0 = unknown. */
  totalListItemCount: number;
  /** Absolute cursor offset reported by NLT (cccc field). Used to map display-relative NLS lines to absolute indices. */
  nlsCursorOffset: number;
  /** Layer number from NLT ll field (chars 12-13). Used as the NLAL layer parameter for this list. 0 = unknown. */
  nlsLayerNumber: number;
  /** True while the harvest loop is collecting list items. Prevents U0 from clearing the map. */
  harvestMode: boolean;
  /** True after a non-browsable item is selected via NLSI. Prevents the spontaneous post-playback NLS from wiping the harvested list. */
  browseListFrozen: boolean;
};

const tuneInMenuBrowseStateByPhysicalAvr = new Map<string, TuneInMenuBrowseState>();

function buildTuneInMenuMediaId(menuIndex: number, title: string): string {
  return `tunein:menu:${menuIndex}:${encodeURIComponent(title)}`;
}

export function getTuneInMenuBrowseState(entityId: string): TuneInMenuBrowseState | null {
  const physicalAvrId = physicalAvrIdFromEntityId(entityId);
  if (!physicalAvrId) {
    return null;
  }

  const existing = tuneInMenuBrowseStateByPhysicalAvr.get(physicalAvrId);
  if (existing) {
    return existing;
  }

  const created: TuneInMenuBrowseState = {
    optionsByMenuIndex: new Map<number, TuneInMenuOption>(),
    thumbnailByTitle: new Map<string, string>(),
    backgroundSignature: "",
    showMainMenuShortcut: false,
    traceNextSelectionAfterMainMenu: false,
    listModeActive: false,
    nowPlayingStation: "",
    totalListItemCount: 0,
    nlsCursorOffset: 0,
    nlsLayerNumber: 0,
    harvestMode: false,
    browseListFrozen: false
  };

  tuneInMenuBrowseStateByPhysicalAvr.set(physicalAvrId, created);
  return created;
}

export function addTuneInMenuOption(
  entityId: string,
  menuIndex: number,
  title: string,
  isBrowsable: boolean,
  thumbnailResolver?: (state: TuneInMenuBrowseState, title: string) => string
): void {
  const state = getTuneInMenuBrowseState(entityId);
  if (!state) {
    return;
  }

  if (state.browseListFrozen) {
    return;
  }

  if (!state.harvestMode && menuIndex <= 1) {
    state.optionsByMenuIndex.clear();
  }

  state.optionsByMenuIndex.set(menuIndex, {
    menuIndex,
    title,
    mediaId: buildTuneInMenuMediaId(menuIndex, title),
    thumbnail: thumbnailResolver ? thumbnailResolver(state, title) : undefined,
    isBrowsable
  });
}

export function listTuneInMenuOptions(entityId: string): TuneInMenuOption[] {
  const state = getTuneInMenuBrowseState(entityId);
  if (!state) {
    return [];
  }

  return [...state.optionsByMenuIndex.values()].sort((a, b) => a.menuIndex - b.menuIndex);
}

export function getContiguousTuneInMenuItemCount(entityId: string): number {
  const state = getTuneInMenuBrowseState(entityId);
  if (!state || state.optionsByMenuIndex.size === 0) return 0;
  const keys = [...state.optionsByMenuIndex.keys()].sort((a, b) => a - b);
  let expected = 1;
  for (const key of keys) {
    if (key !== expected) break;
    expected++;
  }
  return expected - 1;
}

export function resetTuneInMenuBrowseState(entityId: string): void {
  const state = getTuneInMenuBrowseState(entityId);
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

export function consumeTraceNextTuneInSelectionAfterMainMenu(entityId: string): boolean {
  const state = getTuneInMenuBrowseState(entityId);
  if (!state || !state.traceNextSelectionAfterMainMenu) {
    return false;
  }
  state.traceNextSelectionAfterMainMenu = false;
  return true;
}

export function consumeTuneInListModeActive(entityId: string): boolean {
  const state = getTuneInMenuBrowseState(entityId);
  if (!state || !state.listModeActive) return false;
  state.listModeActive = false;
  return true;
}

export function setTuneInMenuBrowseFrozen(entityId: string, frozen: boolean): void {
  const state = getTuneInMenuBrowseState(entityId);
  if (!state) return;
  state.browseListFrozen = frozen;
}

export function getTuneInMenuThumbnailForTitle(
  entityId: string,
  title: string,
  resolver: (state: TuneInMenuBrowseState, title: string) => string
): string {
  const state = getTuneInMenuBrowseState(entityId);
  if (!state) {
    return "";
  }
  return resolver(state, title);
}

export function updateTuneInMenuNowPlayingStation(entityId: string, candidate: string): void {
  const state = getTuneInMenuBrowseState(entityId);
  if (!state) return;

  const lowerCandidate = candidate.toLowerCase();
  for (const option of state.optionsByMenuIndex.values()) {
    if (option.title.toLowerCase() === lowerCandidate) {
      state.nowPlayingStation = candidate;
      return;
    }
  }
}
