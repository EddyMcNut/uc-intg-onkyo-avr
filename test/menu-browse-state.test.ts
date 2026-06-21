import test from "ava";
import path from "path";
import { pathToFileURL } from "url";

async function importDist(modulePath: string): Promise<Record<string, unknown>> {
  return import(pathToFileURL(path.resolve(process.cwd(), modulePath)).href);
}

test.serial("resetMenuBrowseState clears both data and runtime transient flags", async (t) => {
  const browseStateModule = await importDist("dist/src/menuBrowseState.js");
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

  t.is(state.optionsByMenuIndex.size, 2);
  t.is(state.totalListItemCount, 5);
  t.is(state.nlsLayerNumber, 2);
  t.true(state.showMainMenuShortcut);
  t.true(state.traceNextSelectionAfterMainMenu);
  t.true(state.listModeActive);
  t.true(state.browseListFrozen);

  // Reset the state
  resetMenuBrowseState(state);

  // Verify all data is cleared
  t.is(state.optionsByMenuIndex.size, 0);
  t.is(state.totalListItemCount, 0);
  t.is(state.nlsLayerNumber, 0);

  // Verify all transient flags are cleared to false (crucial for service re-entry)
  t.false(state.showMainMenuShortcut);
  t.false(state.traceNextSelectionAfterMainMenu);
  t.false(state.listModeActive);
  t.false(state.browseListFrozen);

  // Verify thumbnails are also cleared
  t.is(state.thumbnailByTitle.size, 0);

  // nowPlayingTitle is NOT cleared by reset (it's service-specific data)
  t.is(state.nowPlayingTitle, "Now Playing");
});

test.serial("Transient flags reset prevents state leaks across service switches", async (t) => {
  const browseStateModule = await importDist("dist/src/menuBrowseState.js");
  const { createMenuBrowseState, resetMenuBrowseState } = browseStateModule as {
    createMenuBrowseState: () => any;
    resetMenuBrowseState: (state: any) => void;
  };

  const state = createMenuBrowseState();

  // Simulate first service use (TuneIn full menu): mark list mode active
  state.listModeActive = true;
  state.traceNextSelectionAfterMainMenu = false;
  state.showMainMenuShortcut = true;

  t.true(state.listModeActive);
  t.false(state.traceNextSelectionAfterMainMenu);
  t.true(state.showMainMenuShortcut);

  // Simulate service switch: reset
  resetMenuBrowseState(state);

  // Verify transient flags start fresh (so first non-browsable selection on new service doesn't skip prep)
  t.false(state.listModeActive, "listModeActive should be reset to prevent stale skip on service re-entry");
  t.false(state.traceNextSelectionAfterMainMenu, "traceNextSelectionAfterMainMenu should be reset");
  t.false(state.showMainMenuShortcut, "showMainMenuShortcut should be reset");
});

test.serial("consumeListModeActive toggles transient flag correctly before reset", async (t) => {
  const browseStateModule = await importDist("dist/src/menuBrowseState.js");
  const { createMenuBrowseState, consumeListModeActive } = browseStateModule as {
    createMenuBrowseState: () => any;
    consumeListModeActive: (state: any) => boolean;
  };

  const state = createMenuBrowseState();

  // Initially false
  t.is(consumeListModeActive(state), false);
  t.false(state.listModeActive);

  // Set it
  state.listModeActive = true;

  // First consume returns true and clears it
  t.is(consumeListModeActive(state), true);
  t.false(state.listModeActive);

  // Second consume returns false (already consumed)
  t.is(consumeListModeActive(state), false);
  t.false(state.listModeActive);
});
