import { createMenuBrowseStore, type MenuBrowseStore } from "./menuBrowseStore.js";
import type { MenuBrowseOption, MenuBrowseState } from "./menuBrowseState.js";

export type TidalMenuOption = MenuBrowseOption;

export type TidalBrowseState = MenuBrowseState<TidalMenuOption>;

export const tidalStore: MenuBrowseStore = createMenuBrowseStore({
  mediaIdPrefix: "tidal",
  isBrowsableRule: (title) => !title.includes(" - ")
});

export function getTidalBrowseState(entityId: string): TidalBrowseState | null {
  return tidalStore.getBrowseState(entityId);
}

export function addTidalMenuOption(entityId: string, menuIndex: number, title: string, thumbnailResolver?: (state: TidalBrowseState, title: string) => string): void {
  tidalStore.addMenuOption(entityId, menuIndex, title, thumbnailResolver);
}

export function listTidalMenuOptions(entityId: string): TidalMenuOption[] {
  return tidalStore.listOptions(entityId);
}

// Returns the count of items forming an unbroken sequence from menuIndex=1, used as the NLAL offset.
export function getContiguousItemCount(entityId: string): number {
  return tidalStore.getContiguousItemCount(entityId);
}

export function resetTidalBrowseState(entityId: string): void {
  tidalStore.resetState(entityId);
}

export function consumeTraceNextTidalSelectionAfterMainMenu(entityId: string): boolean {
  return tidalStore.consumeTraceNextSelectionAfterMainMenu(entityId);
}

export function consumeTidalListModeActive(entityId: string): boolean {
  return tidalStore.consumeListModeActive(entityId);
}

export function getTidalThumbnailForTitle(entityId: string, title: string, resolver: (state: TidalBrowseState, title: string) => string): string {
  return tidalStore.thumbnailForTitle(entityId, title, resolver);
}
