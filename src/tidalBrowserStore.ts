import { physicalAvrIdFromEntityId } from "./configManager.js";
import {
  consumeListModeActive,
  createMenuBrowseState,
  getContiguousMenuItemCount,
  listMenuOptions,
  resetMenuBrowseState,
  upsertMenuOption,
  type MenuBrowseOption,
  type MenuBrowseState
} from "./menuBrowseState.js";

export type TidalMenuOption = MenuBrowseOption;

export type TidalBrowseState = MenuBrowseState<TidalMenuOption>;

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

  const created = createMenuBrowseState<TidalMenuOption>();
  tidalBrowseStateByPhysicalAvr.set(physicalAvrId, created);
  return created;
}

export function addTidalMenuOption(entityId: string, menuIndex: number, title: string, thumbnailResolver?: (state: TidalBrowseState, title: string) => string): void {
  const state = getTidalBrowseState(entityId);
  if (!state) {
    return;
  }

  const isBrowsable = !title.includes(" - ");

  upsertMenuOption(state, menuIndex, () => ({
    menuIndex,
    title,
    mediaId: buildTidalMenuMediaId(menuIndex, title),
    thumbnail: thumbnailResolver ? thumbnailResolver(state, title) : undefined,
    isBrowsable
  }));
}

export function listTidalMenuOptions(entityId: string): TidalMenuOption[] {
  const state = getTidalBrowseState(entityId);
  if (!state) {
    return [];
  }

  return listMenuOptions(state);
}

// Returns the count of items forming an unbroken sequence from menuIndex=1, used as the NLAL offset.
export function getContiguousItemCount(entityId: string): number {
  const state = getTidalBrowseState(entityId);
  if (!state || state.optionsByMenuIndex.size === 0) return 0;
  return getContiguousMenuItemCount(state);
}

export function resetTidalBrowseState(entityId: string): void {
  const state = getTidalBrowseState(entityId);
  if (!state) {
    return;
  }

  resetMenuBrowseState(state);
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
  if (!state) return false;
  return consumeListModeActive(state);
}

export function getTidalThumbnailForTitle(entityId: string, title: string, resolver: (state: TidalBrowseState, title: string) => string): string {
  const state = getTidalBrowseState(entityId);
  if (!state) {
    return "";
  }
  return resolver(state, title);
}
