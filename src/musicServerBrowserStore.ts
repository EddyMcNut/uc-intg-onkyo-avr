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

export type MusicServerMenuOption = MenuBrowseOption;

export type MusicServerBrowseState = MenuBrowseState<MusicServerMenuOption>;

const musicServerBrowseStateByPhysicalAvr = new Map<string, MusicServerBrowseState>();

function buildMusicServerMenuMediaId(menuIndex: number, title: string): string {
  return `music-server:menu:${menuIndex}:${encodeURIComponent(title)}`;
}

export function getMusicServerBrowseState(entityId: string): MusicServerBrowseState | null {
  const physicalAvrId = physicalAvrIdFromEntityId(entityId);
  if (!physicalAvrId) {
    return null;
  }

  const existing = musicServerBrowseStateByPhysicalAvr.get(physicalAvrId);
  if (existing) {
    return existing;
  }

  const created = createMenuBrowseState<MusicServerMenuOption>();
  musicServerBrowseStateByPhysicalAvr.set(physicalAvrId, created);
  return created;
}

export function addMusicServerMenuOption(entityId: string, menuIndex: number, title: string, thumbnailResolver?: (state: MusicServerBrowseState, title: string) => string): void {
  const state = getMusicServerBrowseState(entityId);
  if (!state) {
    return;
  }

  const isBrowsable = !title.includes(" - ");

  upsertMenuOption(state, menuIndex, () => ({
    menuIndex,
    title,
    mediaId: buildMusicServerMenuMediaId(menuIndex, title),
    thumbnail: thumbnailResolver ? thumbnailResolver(state, title) : undefined,
    isBrowsable
  }));
}

export function listMusicServerMenuOptions(entityId: string): MusicServerMenuOption[] {
  const state = getMusicServerBrowseState(entityId);
  if (!state) {
    return [];
  }

  return listMenuOptions(state);
}

export function getContiguousItemCount(entityId: string): number {
  const state = getMusicServerBrowseState(entityId);
  if (!state || state.optionsByMenuIndex.size === 0) return 0;
  return getContiguousMenuItemCount(state);
}

export function resetMusicServerBrowseState(entityId: string): void {
  const state = getMusicServerBrowseState(entityId);
  if (!state) {
    return;
  }

  resetMenuBrowseState(state);
}

export function consumeTraceNextMusicServerSelectionAfterMainMenu(entityId: string): boolean {
  const state = getMusicServerBrowseState(entityId);
  if (!state || !state.traceNextSelectionAfterMainMenu) {
    return false;
  }

  state.traceNextSelectionAfterMainMenu = false;
  return true;
}

export function consumeMusicServerListModeActive(entityId: string): boolean {
  const state = getMusicServerBrowseState(entityId);
  if (!state) return false;
  return consumeListModeActive(state);
}

export function getMusicServerThumbnailForTitle(entityId: string, title: string, resolver: (state: MusicServerBrowseState, title: string) => string): string {
  const state = getMusicServerBrowseState(entityId);
  if (!state) {
    return "";
  }
  return resolver(state, title);
}
