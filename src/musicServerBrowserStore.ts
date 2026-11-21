import { createMenuBrowseStore, type MenuBrowseStore } from "./menuBrowseStore.js";
import type { MenuBrowseOption, MenuBrowseState } from "./menuBrowseState.js";

export type MusicServerMenuOption = MenuBrowseOption;

export type MusicServerBrowseState = MenuBrowseState<MusicServerMenuOption>;

export const musicServerStore: MenuBrowseStore = createMenuBrowseStore({
  mediaIdPrefix: "music-server",
  isBrowsableRule: (title) => !title.includes(" - ")
});
