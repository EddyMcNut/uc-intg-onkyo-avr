import type { AvrContextRegistry } from "./avrContext.js";
import {
  consumeListModeActive as consumeListModeActiveFromState,
  getContiguousMenuItemCount,
  listMenuOptions,
  resetMenuBrowseState,
  upsertMenuOption,
  type MenuBrowseOption,
  type MenuBrowseState
} from "./menuBrowseState.js";

export type MenuBrowseStoreConfig = {
  mediaIdPrefix: string;
  isBrowsableRule: (title: string) => boolean;
};

export type AddMenuOptionOptions = {
  thumbnailResolver?: (state: MenuBrowseState<MenuBrowseOption>, title: string) => string;
  // Overrides the store's isBrowsableRule for this entry.
  isBrowsable?: boolean;
  // Also update the list while it is frozen after a selection (default false).
  allowWhenFrozen?: boolean;
  // Start a fresh list when a low index arrives (default true).
  clearOnLowIndex?: boolean;
};

export type MenuBrowseStore = {
  getBrowseState(entityId: string, contexts: AvrContextRegistry): MenuBrowseState<MenuBrowseOption> | null;
  addMenuOption(entityId: string, menuIndex: number, title: string, contexts: AvrContextRegistry, options?: AddMenuOptionOptions): void;
  listOptions(entityId: string, contexts: AvrContextRegistry): MenuBrowseOption[];
  getContiguousItemCount(entityId: string, contexts: AvrContextRegistry): number;
  resetState(entityId: string, contexts: AvrContextRegistry): void;
  consumeTraceNextSelectionAfterMainMenu(entityId: string, contexts: AvrContextRegistry): boolean;
  consumeListModeActive(entityId: string, contexts: AvrContextRegistry): boolean;
  thumbnailForTitle(entityId: string, title: string, resolver: (state: MenuBrowseState<MenuBrowseOption>, title: string) => string, contexts: AvrContextRegistry): string;
};

export function createMenuBrowseStore(cfg: MenuBrowseStoreConfig): MenuBrowseStore {
  // The state lives in each AVR's AvrContext, keyed by this store's service (mediaIdPrefix).
  function buildMediaId(menuIndex: number, title: string): string {
    return `${cfg.mediaIdPrefix}:menu:${menuIndex}:${encodeURIComponent(title)}`;
  }

  function getBrowseState(entityId: string, contexts: AvrContextRegistry): MenuBrowseState<MenuBrowseOption> | null {
    return contexts.forEntity(entityId)?.menuBrowseState(cfg.mediaIdPrefix) ?? null;
  }

  function addMenuOption(
    entityId: string,
    menuIndex: number,
    title: string,
    contexts: AvrContextRegistry,
    { thumbnailResolver, isBrowsable: isBrowsableOverride, allowWhenFrozen = false, clearOnLowIndex = true }: AddMenuOptionOptions = {}
  ): void {
    const state = getBrowseState(entityId, contexts);
    if (!state) {
      return;
    }

    const isBrowsable = isBrowsableOverride ?? cfg.isBrowsableRule(title);

    upsertMenuOption(
      state,
      menuIndex,
      () => ({
        menuIndex,
        title,
        mediaId: buildMediaId(menuIndex, title),
        thumbnail: thumbnailResolver ? thumbnailResolver(state, title) : undefined,
        isBrowsable
      }),
      allowWhenFrozen,
      clearOnLowIndex
    );
  }

  function listOptions(entityId: string, contexts: AvrContextRegistry): MenuBrowseOption[] {
    const state = getBrowseState(entityId, contexts);
    if (!state) {
      return [];
    }

    return listMenuOptions(state);
  }

  function getContiguousItemCount(entityId: string, contexts: AvrContextRegistry): number {
    const state = getBrowseState(entityId, contexts);
    if (!state || state.optionsByMenuIndex.size === 0) return 0;
    return getContiguousMenuItemCount(state);
  }

  function resetState(entityId: string, contexts: AvrContextRegistry): void {
    const state = getBrowseState(entityId, contexts);
    if (!state) {
      return;
    }

    resetMenuBrowseState(state);
  }

  function consumeTraceNextSelectionAfterMainMenu(entityId: string, contexts: AvrContextRegistry): boolean {
    const state = getBrowseState(entityId, contexts);
    if (!state || !state.traceNextSelectionAfterMainMenu) {
      return false;
    }

    state.traceNextSelectionAfterMainMenu = false;
    return true;
  }

  function consumeListModeActive(entityId: string, contexts: AvrContextRegistry): boolean {
    const state = getBrowseState(entityId, contexts);
    if (!state) return false;
    return consumeListModeActiveFromState(state);
  }

  function thumbnailForTitle(entityId: string, title: string, resolver: (state: MenuBrowseState<MenuBrowseOption>, title: string) => string, contexts: AvrContextRegistry): string {
    const state = getBrowseState(entityId, contexts);
    if (!state) {
      return "";
    }
    return resolver(state, title);
  }

  return {
    getBrowseState,
    addMenuOption,
    listOptions,
    getContiguousItemCount,
    resetState,
    consumeTraceNextSelectionAfterMainMenu,
    consumeListModeActive,
    thumbnailForTitle
  };
}
