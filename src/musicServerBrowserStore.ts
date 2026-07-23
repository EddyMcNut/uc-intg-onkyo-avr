import { createMenuBrowseStore, type MenuBrowseStore } from "./menuBrowseStore.js";
import type { MenuBrowseOption, MenuBrowseState } from "./menuBrowseState.js";
import { delay } from "./utils.js";

const NLA_INGEST_POLL_INTERVAL_MS = 300;
const NLA_INGEST_TIMEOUT_MS = 3000;

export type MusicServerMenuOption = MenuBrowseOption;

export type MusicServerBrowseState = MenuBrowseState<MusicServerMenuOption>;

export const musicServerStore: MenuBrowseStore = createMenuBrowseStore({
  mediaIdPrefix: "music-server",
  isBrowsableRule: (title) => !title.includes(" - ")
});

export function getMusicServerBrowseState(entityId: string): MusicServerBrowseState | null {
  return musicServerStore.getBrowseState(entityId);
}

export function addMusicServerMenuOption(entityId: string, menuIndex: number, title: string, thumbnailResolver?: (state: MusicServerBrowseState, title: string) => string): void {
  musicServerStore.addMenuOption(entityId, menuIndex, title, thumbnailResolver);
}

export function listMusicServerMenuOptions(entityId: string): MusicServerMenuOption[] {
  return musicServerStore.listOptions(entityId);
}

export function getContiguousItemCount(entityId: string): number {
  return musicServerStore.getContiguousItemCount(entityId);
}

export function resetMusicServerBrowseState(entityId: string): void {
  musicServerStore.resetState(entityId);
}

export function consumeTraceNextMusicServerSelectionAfterMainMenu(entityId: string): boolean {
  return musicServerStore.consumeTraceNextSelectionAfterMainMenu(entityId);
}

export function consumeMusicServerListModeActive(entityId: string): boolean {
  return musicServerStore.consumeListModeActive(entityId);
}

export function getMusicServerThumbnailForTitle(entityId: string, title: string, resolver: (state: MusicServerBrowseState, title: string) => string): string {
  return musicServerStore.thumbnailForTitle(entityId, title, resolver);
}

export async function waitForNlaIngestion(entityId: string): Promise<void> {
  const state = getMusicServerBrowseState(entityId);
  const totalExpected = state?.totalListItemCount ?? 0;
  const currentCount = listMusicServerMenuOptions(entityId).length;
  if (totalExpected > 0 && currentCount >= totalExpected) {
    return;
  }

  const deadline = Date.now() + NLA_INGEST_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const count = listMusicServerMenuOptions(entityId).length;
    if (count > currentCount) {
      return;
    }
    await delay(NLA_INGEST_POLL_INTERVAL_MS);
  }
}
