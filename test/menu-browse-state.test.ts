import { describe, it, expect } from "vitest";

it("resetMenuBrowseState clears both data and runtime transient flags", async () => {
  const browseStateModule = await import("../src/menuBrowseState.js");
  const { createMenuBrowseState, resetMenuBrowseState, upsertMenuOption } = browseStateModule as {
    createMenuBrowseState: () => any;
    resetMenuBrowseState: (state: any) => void;
    upsertMenuOption: (state: any, menuIndex: number, createOption: () => any) => void;
  };

  const state = createMenuBrowseState();

  // Set up populated state with transient flags
  upsertMenuOption(state, 1, () => ({ menuIndex: 1, title: "Item 1", mediaId: "id1", isBrowsable: true }));
  upsertMenuOption(state, 2, () => ({ menuIndex: 2, title: "Item 2", mediaId: "id2", isBrowsable: false }));
  state.totalListItemCount = 5;
  state.nlsLayerNumber = 2;
  state.showMainMenuShortcut = true;
  state.traceNextSelectionAfterMainMenu = true;
  state.listModeActive = true; // Critical: this transient flag must be reset
  state.browseListFrozen = true;
  state.nowPlayingTitle = "Now Playing";

  expect(state.optionsByMenuIndex.size).toBe(2);
  expect(state.totalListItemCount).toBe(5);
  expect(state.nlsLayerNumber).toBe(2);
  expect(state.showMainMenuShortcut).toBe(true);
  expect(state.traceNextSelectionAfterMainMenu).toBe(true);
  expect(state.listModeActive).toBe(true);
  expect(state.browseListFrozen).toBe(true);

  // Reset the state
  resetMenuBrowseState(state);

  // Verify all data is cleared
  expect(state.optionsByMenuIndex.size).toBe(0);
  expect(state.totalListItemCount).toBe(0);
  expect(state.nlsLayerNumber).toBe(0);

  // Verify all transient flags are cleared to false (crucial for service re-entry)
  expect(state.showMainMenuShortcut).toBe(false);
  expect(state.traceNextSelectionAfterMainMenu).toBe(false);
  expect(state.listModeActive).toBe(false);
  expect(state.browseListFrozen).toBe(false);

  // Verify thumbnails are also cleared
  expect(state.thumbnailByTitle.size).toBe(0);

  // nowPlayingTitle is NOT cleared by reset (it's service-specific data)
  expect(state.nowPlayingTitle).toBe("Now Playing");
});

it("Transient flags reset prevents state leaks across service switches", async () => {
  const browseStateModule = await import("../src/menuBrowseState.js");
  const { createMenuBrowseState, resetMenuBrowseState } = browseStateModule as {
    createMenuBrowseState: () => any;
    resetMenuBrowseState: (state: any) => void;
  };

  const state = createMenuBrowseState();

  // Simulate first service use (TuneIn full menu): mark list mode active
  state.listModeActive = true;
  state.traceNextSelectionAfterMainMenu = false;
  state.showMainMenuShortcut = true;

  expect(state.listModeActive).toBe(true);
  expect(state.traceNextSelectionAfterMainMenu).toBe(false);
  expect(state.showMainMenuShortcut).toBe(true);

  // Simulate service switch: reset
  resetMenuBrowseState(state);

  // Verify transient flags start fresh (so first non-browsable selection on new service doesn't skip prep)
  expect(state.listModeActive).toBe(false);
  expect(state.traceNextSelectionAfterMainMenu).toBe(false);
  expect(state.showMainMenuShortcut).toBe(false);
});

it("consumeListModeActive toggles transient flag correctly before reset", async () => {
  const browseStateModule = await import("../src/menuBrowseState.js");
  const { createMenuBrowseState, consumeListModeActive } = browseStateModule as {
    createMenuBrowseState: () => any;
    consumeListModeActive: (state: any) => boolean;
  };

  const state = createMenuBrowseState();

  // Initially false
  expect(consumeListModeActive(state)).toBe(false);
  expect(state.listModeActive).toBe(false);

  // Set it
  state.listModeActive = true;

  // First consume returns true and clears it
  expect(consumeListModeActive(state)).toBe(true);
  expect(state.listModeActive).toBe(false);

  // Second consume returns false (already consumed)
  expect(consumeListModeActive(state)).toBe(false);
  expect(state.listModeActive).toBe(false);
});
