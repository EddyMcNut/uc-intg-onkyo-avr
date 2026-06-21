import { physicalAvrIdFromEntityId } from "./configManager.js";
import {
  consumeListModeActive,
  createMenuBrowseState,
  getContiguousMenuItemCount,
  listMenuOptions,
  resetMenuBrowseState,
  setBrowseListFrozen,
  setBrowseNowPlayingTitle,
  upsertMenuOption,
  type MenuBrowseOption,
  type MenuBrowseState
} from "./menuBrowseState.js";

export type TuneInMenuOption = MenuBrowseOption;

export type TuneInMenuBrowseState = MenuBrowseState<TuneInMenuOption>;

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

  const created = createMenuBrowseState<TuneInMenuOption>();

  tuneInMenuBrowseStateByPhysicalAvr.set(physicalAvrId, created);
  return created;
}

export function addTuneInMenuOption(entityId: string, menuIndex: number, title: string, isBrowsable: boolean, thumbnailResolver?: (state: TuneInMenuBrowseState, title: string) => string): void {
  const state = getTuneInMenuBrowseState(entityId);
  if (!state) {
    return;
  }

  upsertMenuOption(state, menuIndex, () => ({
    menuIndex,
    title,
    mediaId: buildTuneInMenuMediaId(menuIndex, title),
    thumbnail: thumbnailResolver ? thumbnailResolver(state, title) : undefined,
    isBrowsable
  }));
}

export function listTuneInMenuOptions(entityId: string): TuneInMenuOption[] {
  const state = getTuneInMenuBrowseState(entityId);
  if (!state) {
    return [];
  }

  return listMenuOptions(state);
}

export function getContiguousTuneInMenuItemCount(entityId: string): number {
  const state = getTuneInMenuBrowseState(entityId);
  if (!state || state.optionsByMenuIndex.size === 0) return 0;
  return getContiguousMenuItemCount(state);
}

export function resetTuneInMenuBrowseState(entityId: string): void {
  const state = getTuneInMenuBrowseState(entityId);
  if (!state) {
    return;
  }

  resetMenuBrowseState(state);
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
  if (!state) return false;
  return consumeListModeActive(state);
}

export function setTuneInMenuBrowseFrozen(entityId: string, frozen: boolean): void {
  const state = getTuneInMenuBrowseState(entityId);
  if (!state) return;
  setBrowseListFrozen(state, frozen);
}

export function getTuneInMenuThumbnailForTitle(entityId: string, title: string, resolver: (state: TuneInMenuBrowseState, title: string) => string): string {
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
      state.nowPlayingTitle = candidate;
      return;
    }
  }
}

// Backward-compatible TuneIn naming on top of the generic shared nowPlayingTitle field.
export function setTuneInMenuNowPlayingStation(entityId: string, station: string): void {
  const state = getTuneInMenuBrowseState(entityId);
  if (!state) return;
  setBrowseNowPlayingTitle(state, station);
}
