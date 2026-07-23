import { createMenuBrowseStore, type MenuBrowseStore } from "./menuBrowseStore.js";
import type { MenuBrowseOption, MenuBrowseState } from "./menuBrowseState.js";

export type DeezerMenuOption = MenuBrowseOption;

export type DeezerBrowseState = MenuBrowseState<DeezerMenuOption>;

export const deezerStore: MenuBrowseStore = createMenuBrowseStore({
  mediaIdPrefix: "deezer",
  isBrowsableRule: (title) => !(title.includes(" / ") || title.includes(" - "))
});

export function getDeezerBrowseState(entityId: string): DeezerBrowseState | null {
  return deezerStore.getBrowseState(entityId);
}

export function addDeezerMenuOption(entityId: string, menuIndex: number, title: string, thumbnailResolver?: (state: DeezerBrowseState, title: string) => string): void {
  deezerStore.addMenuOption(entityId, menuIndex, title, thumbnailResolver);
}

export function listDeezerMenuOptions(entityId: string): DeezerMenuOption[] {
  return deezerStore.listOptions(entityId);
}

export function getContiguousItemCount(entityId: string): number {
  return deezerStore.getContiguousItemCount(entityId);
}

export function resetDeezerBrowseState(entityId: string): void {
  deezerStore.resetState(entityId);
}

export function consumeTraceNextDeezerSelectionAfterMainMenu(entityId: string): boolean {
  return deezerStore.consumeTraceNextSelectionAfterMainMenu(entityId);
}

export function consumeDeezerListModeActive(entityId: string): boolean {
  return deezerStore.consumeListModeActive(entityId);
}

export function getDeezerThumbnailForTitle(entityId: string, title: string, resolver: (state: DeezerBrowseState, title: string) => string): string {
  return deezerStore.thumbnailForTitle(entityId, title, resolver);
}
