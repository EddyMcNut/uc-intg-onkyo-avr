import { createMenuBrowseStore, type MenuBrowseStore } from "./menuBrowseStore.js";
import type { MenuBrowseOption, MenuBrowseState } from "./menuBrowseState.js";

export type TidalMenuOption = MenuBrowseOption;

export type TidalBrowseState = MenuBrowseState<TidalMenuOption>;

export const tidalStore: MenuBrowseStore = createMenuBrowseStore({
  mediaIdPrefix: "tidal",
  isBrowsableRule: (title) => !title.includes(" - ")
});
