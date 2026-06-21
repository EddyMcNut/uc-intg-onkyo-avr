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

export type DeezerMenuOption = MenuBrowseOption;

export type DeezerBrowseState = MenuBrowseState<DeezerMenuOption>;

const deezerBrowseStateByPhysicalAvr = new Map<string, DeezerBrowseState>();

function isLikelyDeezerTrackTitle(title: string): boolean {
  return title.includes(" / ") || title.includes(" - ");
}

function buildDeezerMenuMediaId(menuIndex: number, title: string): string {
  return `deezer:menu:${menuIndex}:${encodeURIComponent(title)}`;
}

export function getDeezerBrowseState(entityId: string): DeezerBrowseState | null {
  const physicalAvrId = physicalAvrIdFromEntityId(entityId);
  if (!physicalAvrId) {
    return null;
  }

  const existing = deezerBrowseStateByPhysicalAvr.get(physicalAvrId);
  if (existing) {
    return existing;
  }

  const created = createMenuBrowseState<DeezerMenuOption>();
  deezerBrowseStateByPhysicalAvr.set(physicalAvrId, created);
  return created;
}

export function addDeezerMenuOption(entityId: string, menuIndex: number, title: string, thumbnailResolver?: (state: DeezerBrowseState, title: string) => string): void {
  const state = getDeezerBrowseState(entityId);
  if (!state) {
    return;
  }

  const isBrowsable = !isLikelyDeezerTrackTitle(title);

  upsertMenuOption(state, menuIndex, () => ({
    menuIndex,
    title,
    mediaId: buildDeezerMenuMediaId(menuIndex, title),
    thumbnail: thumbnailResolver ? thumbnailResolver(state, title) : undefined,
    isBrowsable
  }));
}

export function listDeezerMenuOptions(entityId: string): DeezerMenuOption[] {
  const state = getDeezerBrowseState(entityId);
  if (!state) {
    return [];
  }

  return listMenuOptions(state);
}

export function getContiguousItemCount(entityId: string): number {
  const state = getDeezerBrowseState(entityId);
  if (!state || state.optionsByMenuIndex.size === 0) return 0;
  return getContiguousMenuItemCount(state);
}

export function resetDeezerBrowseState(entityId: string): void {
  const state = getDeezerBrowseState(entityId);
  if (!state) {
    return;
  }

  resetMenuBrowseState(state);
}

export function consumeTraceNextDeezerSelectionAfterMainMenu(entityId: string): boolean {
  const state = getDeezerBrowseState(entityId);
  if (!state || !state.traceNextSelectionAfterMainMenu) {
    return false;
  }

  state.traceNextSelectionAfterMainMenu = false;
  return true;
}

export function consumeDeezerListModeActive(entityId: string): boolean {
  const state = getDeezerBrowseState(entityId);
  if (!state) return false;
  return consumeListModeActive(state);
}

export function getDeezerThumbnailForTitle(entityId: string, title: string, resolver: (state: DeezerBrowseState, title: string) => string): string {
  const state = getDeezerBrowseState(entityId);
  if (!state) {
    return "";
  }
  return resolver(state, title);
}
