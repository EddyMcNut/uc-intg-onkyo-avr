import { physicalAvrIdFromEntityId } from "./configManager.js";
import {
  consumeListModeActive as consumeListModeActiveFromState,
  createMenuBrowseState,
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
  getBrowseState(entityId: string): MenuBrowseState<MenuBrowseOption> | null;
  addMenuOption(entityId: string, menuIndex: number, title: string, thumbnailResolver?: (state: MenuBrowseState<MenuBrowseOption>, title: string) => string): void;
  listOptions(entityId: string): MenuBrowseOption[];
  getContiguousItemCount(entityId: string): number;
  resetState(entityId: string): void;
  consumeTraceNextSelectionAfterMainMenu(entityId: string): boolean;
  consumeListModeActive(entityId: string): boolean;
  thumbnailForTitle(entityId: string, title: string, resolver: (state: MenuBrowseState<MenuBrowseOption>, title: string) => string): string;
};

export function createMenuBrowseStore(cfg: MenuBrowseStoreConfig): MenuBrowseStore {
  const stateByPhysicalAvr = new Map<string, MenuBrowseState<MenuBrowseOption>>();

  function buildMediaId(menuIndex: number, title: string): string {
    return `${cfg.mediaIdPrefix}:menu:${menuIndex}:${encodeURIComponent(title)}`;
  }

  function getBrowseState(entityId: string): MenuBrowseState<MenuBrowseOption> | null {
    const physicalAvrId = physicalAvrIdFromEntityId(entityId);
    if (!physicalAvrId) {
      return null;
    }

    const existing = stateByPhysicalAvr.get(physicalAvrId);
    if (existing) {
      return existing;
    }

    const created = createMenuBrowseState<MenuBrowseOption>();
    stateByPhysicalAvr.set(physicalAvrId, created);
    return created;
  }

  function addMenuOption(entityId: string, menuIndex: number, title: string, thumbnailResolver?: (state: MenuBrowseState<MenuBrowseOption>, title: string) => string): void {
    const state = getBrowseState(entityId);
    if (!state) {
      return;
    }

    const isBrowsable = cfg.isBrowsableRule(title);

    upsertMenuOption(state, menuIndex, () => ({
      menuIndex,
      title,
      mediaId: buildMediaId(menuIndex, title),
      thumbnail: thumbnailResolver ? thumbnailResolver(state, title) : undefined,
      isBrowsable
    }));
  }

  function listOptions(entityId: string): MenuBrowseOption[] {
    const state = getBrowseState(entityId);
    if (!state) {
      return [];
    }

    return listMenuOptions(state);
  }

  function getContiguousItemCount(entityId: string): number {
    const state = getBrowseState(entityId);
    if (!state || state.optionsByMenuIndex.size === 0) return 0;
    return getContiguousMenuItemCount(state);
  }

  function resetState(entityId: string): void {
    const state = getBrowseState(entityId);
    if (!state) {
      return;
    }

    resetMenuBrowseState(state);
  }

  function consumeTraceNextSelectionAfterMainMenu(entityId: string): boolean {
    const state = getBrowseState(entityId);
    if (!state || !state.traceNextSelectionAfterMainMenu) {
      return false;
    }

    state.traceNextSelectionAfterMainMenu = false;
    return true;
  }

  function consumeListModeActive(entityId: string): boolean {
    const state = getBrowseState(entityId);
    if (!state) return false;
    return consumeListModeActiveFromState(state);
  }

  function thumbnailForTitle(entityId: string, title: string, resolver: (state: MenuBrowseState<MenuBrowseOption>, title: string) => string): string {
    const state = getBrowseState(entityId);
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
