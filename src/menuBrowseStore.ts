import { sharedAvrContexts, type AvrContextRegistry } from "./avrContext.js";
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

export type MenuBrowseStore = {
  getBrowseState(entityId: string, contexts?: AvrContextRegistry): MenuBrowseState<MenuBrowseOption> | null;
  addMenuOption(
    entityId: string,
    menuIndex: number,
    title: string,
    thumbnailResolver?: (state: MenuBrowseState<MenuBrowseOption>, title: string) => string,
    isBrowsable?: boolean,
    allowWhenFrozen?: boolean,
    clearOnLowIndex?: boolean,
    contexts?: AvrContextRegistry
  ): void;
  listOptions(entityId: string, contexts?: AvrContextRegistry): MenuBrowseOption[];
  getContiguousItemCount(entityId: string, contexts?: AvrContextRegistry): number;
  resetState(entityId: string, contexts?: AvrContextRegistry): void;
  consumeTraceNextSelectionAfterMainMenu(entityId: string, contexts?: AvrContextRegistry): boolean;
  consumeListModeActive(entityId: string, contexts?: AvrContextRegistry): boolean;
  thumbnailForTitle(entityId: string, title: string, resolver: (state: MenuBrowseState<MenuBrowseOption>, title: string) => string, contexts?: AvrContextRegistry): string;
};

export function createMenuBrowseStore(cfg: MenuBrowseStoreConfig): MenuBrowseStore {
  // The state lives in each AVR's AvrContext, keyed by this store's service (mediaIdPrefix). The `contexts`
  // parameters default to the shared registry during the item-10 migration (see avrContext.ts).
  function buildMediaId(menuIndex: number, title: string): string {
    return `${cfg.mediaIdPrefix}:menu:${menuIndex}:${encodeURIComponent(title)}`;
  }

  function getBrowseState(entityId: string, contexts: AvrContextRegistry = sharedAvrContexts): MenuBrowseState<MenuBrowseOption> | null {
    return contexts.forEntity(entityId)?.menuBrowseState(cfg.mediaIdPrefix) ?? null;
  }

  function addMenuOption(
    entityId: string,
    menuIndex: number,
    title: string,
    thumbnailResolver?: (state: MenuBrowseState<MenuBrowseOption>, title: string) => string,
    isBrowsableOverride?: boolean,
    allowWhenFrozen = false,
    clearOnLowIndex = true,
    contexts: AvrContextRegistry = sharedAvrContexts
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

  function listOptions(entityId: string, contexts: AvrContextRegistry = sharedAvrContexts): MenuBrowseOption[] {
    const state = getBrowseState(entityId, contexts);
    if (!state) {
      return [];
    }

    return listMenuOptions(state);
  }

  function getContiguousItemCount(entityId: string, contexts: AvrContextRegistry = sharedAvrContexts): number {
    const state = getBrowseState(entityId, contexts);
    if (!state || state.optionsByMenuIndex.size === 0) return 0;
    return getContiguousMenuItemCount(state);
  }

  function resetState(entityId: string, contexts: AvrContextRegistry = sharedAvrContexts): void {
    const state = getBrowseState(entityId, contexts);
    if (!state) {
      return;
    }

    resetMenuBrowseState(state);
  }

  function consumeTraceNextSelectionAfterMainMenu(entityId: string, contexts: AvrContextRegistry = sharedAvrContexts): boolean {
    const state = getBrowseState(entityId, contexts);
    if (!state || !state.traceNextSelectionAfterMainMenu) {
      return false;
    }

    state.traceNextSelectionAfterMainMenu = false;
    return true;
  }

  function consumeListModeActive(entityId: string, contexts: AvrContextRegistry = sharedAvrContexts): boolean {
    const state = getBrowseState(entityId, contexts);
    if (!state) return false;
    return consumeListModeActiveFromState(state);
  }

  function thumbnailForTitle(entityId: string, title: string, resolver: (state: MenuBrowseState<MenuBrowseOption>, title: string) => string, contexts: AvrContextRegistry = sharedAvrContexts): string {
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
