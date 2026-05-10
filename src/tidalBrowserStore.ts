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
    listModeActive: false
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

  if (menuIndex <= 1) {
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
