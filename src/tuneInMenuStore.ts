import type { AvrContextRegistry } from "./avrContext.js";
import {
  consumeListModeActive,
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

// The state lives in each AVR's AvrContext (`tuneInMenu`); every function takes the registry to look it up in.

function buildTuneInMenuMediaId(menuIndex: number, title: string): string {
  return `tunein:menu:${menuIndex}:${encodeURIComponent(title)}`;
}

export function getTuneInMenuBrowseState(entityId: string, contexts: AvrContextRegistry): TuneInMenuBrowseState | null {
  return contexts.forEntity(entityId)?.tuneInMenu ?? null;
}

export function setTuneInMenuBrowseContextState(entityId: string, title: string, contexts: AvrContextRegistry): void {
  const state = getTuneInMenuBrowseState(entityId, contexts);
  if (state) state.contextTitle = title.trim().toLowerCase();
}

export type AddTuneInMenuOptionOptions = {
  thumbnailResolver?: (state: TuneInMenuBrowseState, title: string) => string;
  // Kept in the state for index bookkeeping but not listed (default false).
  hidden?: boolean;
  // Also update the list while it is frozen after a selection (default false).
  allowWhenFrozen?: boolean;
};

export function addTuneInMenuOption(
  entityId: string,
  menuIndex: number,
  title: string,
  isBrowsable: boolean,
  contexts: AvrContextRegistry,
  { thumbnailResolver, hidden = false, allowWhenFrozen = false }: AddTuneInMenuOptionOptions = {}
): void {
  const state = getTuneInMenuBrowseState(entityId, contexts);
  if (!state) {
    return;
  }

  upsertMenuOption(
    state,
    menuIndex,
    () => ({
      menuIndex,
      title,
      mediaId: buildTuneInMenuMediaId(menuIndex, title),
      thumbnail: thumbnailResolver ? thumbnailResolver(state, title) : undefined,
      isBrowsable,
      hidden
    }),
    allowWhenFrozen
  );
}

export function listTuneInMenuOptions(entityId: string, contexts: AvrContextRegistry): TuneInMenuOption[] {
  const state = getTuneInMenuBrowseState(entityId, contexts);
  if (!state) {
    return [];
  }

  return listMenuOptions(state).filter((item) => !item.hidden);
}

export function getContiguousTuneInMenuItemCount(entityId: string, contexts: AvrContextRegistry): number {
  const state = getTuneInMenuBrowseState(entityId, contexts);
  if (!state || state.optionsByMenuIndex.size === 0) return 0;
  return getContiguousMenuItemCount(state);
}

export function resetTuneInMenuBrowseState(entityId: string, contexts: AvrContextRegistry): void {
  const state = getTuneInMenuBrowseState(entityId, contexts);
  if (!state) {
    return;
  }

  resetMenuBrowseState(state);
}

export function consumeTraceNextTuneInSelectionAfterMainMenu(entityId: string, contexts: AvrContextRegistry): boolean {
  const state = getTuneInMenuBrowseState(entityId, contexts);
  if (!state || !state.traceNextSelectionAfterMainMenu) {
    return false;
  }
  state.traceNextSelectionAfterMainMenu = false;
  return true;
}

export function consumeTuneInListModeActive(entityId: string, contexts: AvrContextRegistry): boolean {
  const state = getTuneInMenuBrowseState(entityId, contexts);
  if (!state) return false;
  return consumeListModeActive(state);
}

export function setTuneInMenuBrowseFrozen(entityId: string, frozen: boolean, contexts: AvrContextRegistry): void {
  const state = getTuneInMenuBrowseState(entityId, contexts);
  if (!state) return;
  setBrowseListFrozen(state, frozen);
}

export function getTuneInMenuThumbnailForTitle(entityId: string, title: string, resolver: (state: TuneInMenuBrowseState, title: string) => string, contexts: AvrContextRegistry): string {
  const state = getTuneInMenuBrowseState(entityId, contexts);
  if (!state) {
    return "";
  }
  return resolver(state, title);
}

export function updateTuneInMenuNowPlayingStation(entityId: string, candidate: string, contexts: AvrContextRegistry): void {
  const state = getTuneInMenuBrowseState(entityId, contexts);
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
export function setTuneInMenuNowPlayingStation(entityId: string, station: string, contexts: AvrContextRegistry): void {
  const state = getTuneInMenuBrowseState(entityId, contexts);
  if (!state) return;
  setBrowseNowPlayingTitle(state, station);
}
