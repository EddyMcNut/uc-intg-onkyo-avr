import { buildPhysicalAvrId } from "./configManager.js";

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
  /** Stack of container mediaIds visited so far, from shallowest to deepest.
   * Empty = at root (main Tidal menu). Each browsable selection pushes its mediaId;
   * back navigation pops entries and sends NTCRETURN for each. */
  navStack: string[];
};

const tidalBrowseStateByPhysicalAvr = new Map<string, TidalBrowseState>();

function buildTidalMenuMediaId(menuIndex: number, title: string): string {
  return `tidal:menu:${menuIndex}:${encodeURIComponent(title)}`;
}

function parseEntityId(entityId: string): { model: string; host: string } | null {
  const parts = entityId.trim().split(/\s+/);
  if (parts.length < 3) {
    return null;
  }

  const host = parts[parts.length - 2];
  const model = parts.slice(0, -2).join(" ");
  if (!host || !model) {
    return null;
  }

  return { model, host };
}

function getPhysicalAvrId(entityId: string): string | null {
  const parsed = parseEntityId(entityId);
  if (!parsed) {
    return null;
  }

  return buildPhysicalAvrId(parsed.model, parsed.host);
}

function getTidalBrowseState(entityId: string): TidalBrowseState | null {
  const physicalAvrId = getPhysicalAvrId(entityId);
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
    navStack: []
  };
  tidalBrowseStateByPhysicalAvr.set(physicalAvrId, created);
  return created;
}

export function addTidalMenuOption(
  entityId: string,
  menuIndex: number,
  title: string,
  thumbnailResolver?: (state: TidalBrowseState, title: string) => string
): void {
  const state = getTidalBrowseState(entityId);
  if (!state) {
    return;
  }

  // In harvest mode, never clear — items accumulate with absolute indices derived from nlsCursorOffset.
  // In normal mode, seeing menuIndex=1 (display line U0) means a new list is starting: clear.
  if (!state.harvestMode && menuIndex <= 1) {
    state.optionsByMenuIndex.clear();
  }

  // Songs have " - " in their title (e.g., "Artist - Song Name")
  // Directories/menus don't have this pattern
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

/**
 * Returns the number of items that form an unbroken sequence starting at menuIndex=1.
 * This is the correct 0-based NLAL request offset: it ignores any NLS entries that
 * landed at high absolute positions (e.g. cursor at 66 → NLS at positions 58–67),
 * which would otherwise inflate `listTidalMenuOptions().length` and cause the harvest
 * to request items at the wrong offset, leaving positions 1–N unfetched.
 */
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

export function shouldShowTidalMainMenuShortcut(entityId: string): boolean {
  const state = getTidalBrowseState(entityId);
  return state?.showMainMenuShortcut ?? false;
}

export function setTidalMainMenuShortcut(entityId: string, show: boolean): void {
  const state = getTidalBrowseState(entityId);
  if (!state) {
    return;
  }

  state.showMainMenuShortcut = show;
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
  state.navStack = [];
}

export function markTraceNextTidalSelectionAfterMainMenu(entityId: string): void {
  const state = getTidalBrowseState(entityId);
  if (!state) {
    return;
  }

  state.traceNextSelectionAfterMainMenu = true;
}

export function consumeTraceNextTidalSelectionAfterMainMenu(entityId: string): boolean {
  const state = getTidalBrowseState(entityId);
  if (!state || !state.traceNextSelectionAfterMainMenu) {
    return false;
  }

  state.traceNextSelectionAfterMainMenu = false;
  return true;
}

/**
 * Mark that the AVR just finished streaming an NLS list (list mode is active).
 * Called by the browse callback after waitForTidalMenuStable completes.
 */
export function markTidalListModeActive(entityId: string): void {
  const state = getTidalBrowseState(entityId);
  if (state) state.listModeActive = true;
}

/**
 * Consume the list-mode-active flag. Returns true once after markTidalListModeActive,
 * then false until marked again. Used by commandSender to skip the pre-list command
 * when the AVR is already in list mode after fresh menu navigation.
 */
export function consumeTidalListModeActive(entityId: string): boolean {
  const state = getTidalBrowseState(entityId);
  if (!state || !state.listModeActive) return false;
  state.listModeActive = false;
  return true;
}

export function setTidalNowPlayingTitle(entityId: string, title: string): void {
  const state = getTidalBrowseState(entityId);
  if (state) state.nowPlayingTitle = title;
}

export function getTidalNowPlayingTitle(entityId: string): string {
  return getTidalBrowseState(entityId)?.nowPlayingTitle ?? "";
}

export function setTidalTotalListItemCount(entityId: string, count: number): void {
  const state = getTidalBrowseState(entityId);
  if (state) state.totalListItemCount = count;
}

export function getTidalTotalListItemCount(entityId: string): number {
  return getTidalBrowseState(entityId)?.totalListItemCount ?? 0;
}

export function setTidalNlsCursorOffset(entityId: string, offset: number): void {
  const state = getTidalBrowseState(entityId);
  if (state) state.nlsCursorOffset = offset;
}

export function getTidalNlsCursorOffset(entityId: string): number {
  return getTidalBrowseState(entityId)?.nlsCursorOffset ?? 0;
}

export function setTidalNlsLayerNumber(entityId: string, layer: number): void {
  const state = getTidalBrowseState(entityId);
  if (state) state.nlsLayerNumber = layer;
}

export function getTidalNlsLayerNumber(entityId: string): number {
  return getTidalBrowseState(entityId)?.nlsLayerNumber ?? 0;
}

export function setTidalHarvestMode(entityId: string, active: boolean): void {
  const state = getTidalBrowseState(entityId);
  if (state) state.harvestMode = active;
}

export function getTidalHarvestMode(entityId: string): boolean {
  return getTidalBrowseState(entityId)?.harvestMode ?? false;
}

export function getTidalNavDepth(entityId: string): number {
  return getTidalBrowseState(entityId)?.navStack.length ?? 0;
}

export function getTidalCurrentNavContainer(entityId: string): string {
  const stack = getTidalBrowseState(entityId)?.navStack ?? [];
  return stack[stack.length - 1] ?? "";
}

export function getTidalNavStack(entityId: string): string[] {
  return [...(getTidalBrowseState(entityId)?.navStack ?? [])];
}

export function pushTidalNavContainer(entityId: string, containerId: string): void {
  const state = getTidalBrowseState(entityId);
  if (state) state.navStack.push(containerId);
}

/**
 * Pops all entries AFTER targetId (keeping targetId as the new top).
 * Returns how many entries were popped, or 0 if targetId is not in the stack.
 */
export function popTidalNavContainersTo(entityId: string, targetId: string): number {
  const state = getTidalBrowseState(entityId);
  if (!state || state.navStack.length === 0) return 0;
  const idx = state.navStack.indexOf(targetId);
  if (idx === -1) return 0;
  const popsNeeded = state.navStack.length - (idx + 1);
  state.navStack.splice(idx + 1);
  return popsNeeded;
}

/** Clears the entire nav stack. Returns how many entries were cleared. */
export function clearTidalNavStack(entityId: string): number {
  const state = getTidalBrowseState(entityId);
  if (!state) return 0;
  const count = state.navStack.length;
  state.navStack = [];
  return count;
}

export function getTidalThumbnailForTitle(entityId: string, title: string, resolver: (state: TidalBrowseState, title: string) => string): string {
  const state = getTidalBrowseState(entityId);
  if (!state) {
    return "";
  }
  return resolver(state, title);
}
