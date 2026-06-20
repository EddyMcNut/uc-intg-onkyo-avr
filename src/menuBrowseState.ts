export type MenuBrowseOption = {
  menuIndex: number;
  title: string;
  mediaId: string;
  thumbnail?: string;
  isBrowsable: boolean;
};

export type MenuBrowseState<TOption extends MenuBrowseOption> = {
  optionsByMenuIndex: Map<number, TOption>;
  thumbnailByTitle: Map<string, string>;
  backgroundSignature: string;
  showMainMenuShortcut: boolean;
  traceNextSelectionAfterMainMenu: boolean;
  listModeActive: boolean;
  // Generic now-playing label used across browse services.
  nowPlayingTitle: string;
  totalListItemCount: number;
  nlsCursorOffset: number;
  nlsLayerNumber: number;
  harvestMode: boolean;
  browseListFrozen: boolean;
};

export function createMenuBrowseState<TOption extends MenuBrowseOption>(): MenuBrowseState<TOption> {
  return {
    optionsByMenuIndex: new Map<number, TOption>(),
    thumbnailByTitle: new Map<string, string>(),
    backgroundSignature: "",
    showMainMenuShortcut: false,
    traceNextSelectionAfterMainMenu: false,
    listModeActive: false,
    nowPlayingTitle: "",
    totalListItemCount: 0,
    nlsCursorOffset: 0,
    nlsLayerNumber: 0,
    harvestMode: false,
    browseListFrozen: false
  };
}

export function upsertMenuOption<TOption extends MenuBrowseOption>(state: MenuBrowseState<TOption>, menuIndex: number, createOption: () => TOption): void {
  if (state.browseListFrozen) {
    return;
  }

  if (!state.harvestMode && menuIndex <= 1) {
    state.optionsByMenuIndex.clear();
  }

  state.optionsByMenuIndex.set(menuIndex, createOption());
}

export function listMenuOptions<TOption extends MenuBrowseOption>(state: MenuBrowseState<TOption>): TOption[] {
  return [...state.optionsByMenuIndex.values()].sort((a, b) => a.menuIndex - b.menuIndex);
}

export function getContiguousMenuItemCount<TOption extends MenuBrowseOption>(state: MenuBrowseState<TOption>): number {
  if (state.optionsByMenuIndex.size === 0) {
    return 0;
  }

  const keys = [...state.optionsByMenuIndex.keys()].sort((a, b) => a - b);
  let expected = 1;
  for (const key of keys) {
    if (key !== expected) {
      break;
    }
    expected += 1;
  }

  return expected - 1;
}

export function resetMenuBrowseState<TOption extends MenuBrowseOption>(state: MenuBrowseState<TOption>): void {
  state.optionsByMenuIndex.clear();
  state.thumbnailByTitle.clear();
  state.showMainMenuShortcut = false;
  state.traceNextSelectionAfterMainMenu = false;
  state.listModeActive = false;
  state.totalListItemCount = 0;
  state.nlsCursorOffset = 0;
  state.nlsLayerNumber = 0;
  state.harvestMode = false;
  state.browseListFrozen = false;
}

export function consumeListModeActive<TOption extends MenuBrowseOption>(state: MenuBrowseState<TOption>): boolean {
  if (!state.listModeActive) {
    return false;
  }

  state.listModeActive = false;
  return true;
}

export function setBrowseListFrozen<TOption extends MenuBrowseOption>(state: MenuBrowseState<TOption>, frozen: boolean): void {
  state.browseListFrozen = frozen;
}

export function setBrowseNowPlayingTitle<TOption extends MenuBrowseOption>(state: MenuBrowseState<TOption>, title: string): void {
  state.nowPlayingTitle = title;
}
