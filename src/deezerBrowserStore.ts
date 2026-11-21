import { createMenuBrowseStore, type MenuBrowseStore } from "./menuBrowseStore.js";
import type { MenuBrowseOption, MenuBrowseState } from "./menuBrowseState.js";

export type DeezerMenuOption = MenuBrowseOption;

export type DeezerBrowseState = MenuBrowseState<DeezerMenuOption>;

export const deezerStore: MenuBrowseStore = createMenuBrowseStore({
  mediaIdPrefix: "deezer",
  isBrowsableRule: (title) => !(title.includes(" / ") || title.includes(" - "))
});
