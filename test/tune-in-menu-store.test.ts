import { testAvrContexts } from "./helpers/contexts.js";
import { describe, it, expect } from "vitest";

let counter = 0;
// Each test gets a unique physical AVR ID so the internal Map doesn't collide.
function uid(): string {
  counter++;
  return `M${counter}.${Date.now()}`;
}

it("getTuneInMenuBrowseState creates state on first call", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { getTuneInMenuBrowseState } = mod as any;
  const state = getTuneInMenuBrowseState(`${uid()} 1.2.3.4 main`, testAvrContexts);
  expect(state).toBeTruthy();
  expect(state.optionsByMenuIndex.size).toBe(0);
});

it("getTuneInMenuBrowseState returns same state on second call", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { getTuneInMenuBrowseState } = mod as any;
  const e = `${uid()} 1.2.3.4 main`;
  const first = getTuneInMenuBrowseState(e, testAvrContexts);
  const second = getTuneInMenuBrowseState(e, testAvrContexts);
  expect(first).toBe(second);
});

it("getTuneInMenuBrowseState returns null for invalid entityId", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { getTuneInMenuBrowseState } = mod as any;
  expect(getTuneInMenuBrowseState("", testAvrContexts)).toBeNull();
  expect(getTuneInMenuBrowseState("tooshort", testAvrContexts)).toBeNull();
});

it("addTuneInMenuOption adds option to state", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { addTuneInMenuOption, getTuneInMenuBrowseState } = mod as any;
  const e = `${uid()} 1.2.3.4 main`;
  addTuneInMenuOption(e, 1, "Test Station", true, testAvrContexts);
  const state = getTuneInMenuBrowseState(e, testAvrContexts);
  expect(state.optionsByMenuIndex.size).toBe(1);
  const opt = state.optionsByMenuIndex.get(1);
  expect(opt.title).toBe("Test Station");
  expect(opt.isBrowsable).toBe(true);
  expect(opt.mediaId).toContain("tunein:menu:1:");
});

it("addTuneInMenuOption is no-op for invalid entityId", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { addTuneInMenuOption, listTuneInMenuOptions } = mod as any;
  addTuneInMenuOption("", 1, "X", true, testAvrContexts);
  expect(listTuneInMenuOptions("", testAvrContexts)).toEqual([]);
});

it("listTuneInMenuOptions returns all added options in order", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { addTuneInMenuOption, listTuneInMenuOptions } = mod as any;
  const e = `${uid()} 1.2.3.4 main`;
  addTuneInMenuOption(e, 1, "Station A", true, testAvrContexts);
  addTuneInMenuOption(e, 2, "Station B", true, testAvrContexts);
  addTuneInMenuOption(e, 3, "Station C", false, testAvrContexts);
  const items = listTuneInMenuOptions(e, testAvrContexts);
  expect(items.length).toBe(3);
  expect(items[0].menuIndex).toBe(1);
  expect(items[1].menuIndex).toBe(2);
  expect(items[2].menuIndex).toBe(3);
  expect(items[0].title).toBe("Station A");
});

it("listTuneInMenuOptions returns empty array for no state", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { listTuneInMenuOptions } = mod as any;
  expect(listTuneInMenuOptions("", testAvrContexts)).toEqual([]);
});

it("getContiguousTuneInMenuItemCount counts sequential items from 1", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { addTuneInMenuOption, getContiguousTuneInMenuItemCount } = mod as any;
  const e = `${uid()} 1.2.3.4 main`;
  addTuneInMenuOption(e, 1, "A", true, testAvrContexts);
  addTuneInMenuOption(e, 2, "B", true, testAvrContexts);
  addTuneInMenuOption(e, 3, "C", true, testAvrContexts);
  expect(getContiguousTuneInMenuItemCount(e, testAvrContexts)).toBe(3);
});

it("getContiguousTuneInMenuItemCount stops at gap", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { addTuneInMenuOption, getContiguousTuneInMenuItemCount } = mod as any;
  const e = `${uid()} 1.2.3.4 main`;
  addTuneInMenuOption(e, 1, "A", true, testAvrContexts);
  addTuneInMenuOption(e, 3, "C", true, testAvrContexts);
  expect(getContiguousTuneInMenuItemCount(e, testAvrContexts)).toBe(1);
});

it("getContiguousTuneInMenuItemCount returns 0 for no state or empty", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { getContiguousTuneInMenuItemCount } = mod as any;
  expect(getContiguousTuneInMenuItemCount("", testAvrContexts)).toBe(0);
  expect(getContiguousTuneInMenuItemCount(`${uid()} 1.2.3.4 main`, testAvrContexts)).toBe(0);
});

it("resetTuneInMenuBrowseState clears options", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { addTuneInMenuOption, resetTuneInMenuBrowseState, listTuneInMenuOptions, getTuneInMenuBrowseState } = mod as any;
  const e = `${uid()} 1.2.3.4 main`;
  addTuneInMenuOption(e, 1, "A", true, testAvrContexts);
  expect(listTuneInMenuOptions(e, testAvrContexts).length).toBe(1);
  resetTuneInMenuBrowseState(e, testAvrContexts);
  const state = getTuneInMenuBrowseState(e, testAvrContexts);
  expect(state.optionsByMenuIndex.size).toBe(0);
});

it("resetTuneInMenuBrowseState is no-op for invalid entityId", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { resetTuneInMenuBrowseState } = mod as any;
  resetTuneInMenuBrowseState("", testAvrContexts);
});

it("consumeTraceNextTuneInSelectionAfterMainMenu returns false when not set", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { consumeTraceNextTuneInSelectionAfterMainMenu, getTuneInMenuBrowseState } = mod as any;
  const e = `${uid()} 1.2.3.4 main`;
  getTuneInMenuBrowseState(e, testAvrContexts);
  expect(consumeTraceNextTuneInSelectionAfterMainMenu(e, testAvrContexts)).toBe(false);
});

it("consumeTraceNextTuneInSelectionAfterMainMenu returns true and clears", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { consumeTraceNextTuneInSelectionAfterMainMenu, getTuneInMenuBrowseState } = mod as any;
  const e = `${uid()} 1.2.3.4 main`;
  const state = getTuneInMenuBrowseState(e, testAvrContexts);
  state.traceNextSelectionAfterMainMenu = true;
  expect(consumeTraceNextTuneInSelectionAfterMainMenu(e, testAvrContexts)).toBe(true);
  expect(consumeTraceNextTuneInSelectionAfterMainMenu(e, testAvrContexts)).toBe(false);
});

it("consumeTuneInListModeActive returns false for no state", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { consumeTuneInListModeActive } = mod as any;
  expect(consumeTuneInListModeActive("", testAvrContexts)).toBe(false);
});

it("setTuneInMenuBrowseFrozen sets frozen flag", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { setTuneInMenuBrowseFrozen, getTuneInMenuBrowseState } = mod as any;
  const e = `${uid()} 1.2.3.4 main`;
  getTuneInMenuBrowseState(e, testAvrContexts);
  setTuneInMenuBrowseFrozen(e, true, testAvrContexts);
  expect(getTuneInMenuBrowseState(e, testAvrContexts).browseListFrozen).toBe(true);
  setTuneInMenuBrowseFrozen(e, false, testAvrContexts);
  expect(getTuneInMenuBrowseState(e, testAvrContexts).browseListFrozen).toBe(false);
});

it("setTuneInMenuBrowseFrozen is no-op for invalid entityId", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { setTuneInMenuBrowseFrozen } = mod as any;
  setTuneInMenuBrowseFrozen("", true, testAvrContexts);
});

it("getTuneInMenuThumbnailForTitle calls resolver and returns result", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { getTuneInMenuThumbnailForTitle, getTuneInMenuBrowseState } = mod as any;
  const e = `${uid()} 1.2.3.4 main`;
  getTuneInMenuBrowseState(e, testAvrContexts);
  const result = getTuneInMenuThumbnailForTitle(e, "Test", (state: any, title: string) => `thumb:${title}`, testAvrContexts);
  expect(result).toBe("thumb:Test");
});

it("getTuneInMenuThumbnailForTitle returns empty for invalid entityId", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { getTuneInMenuThumbnailForTitle } = mod as any;
  expect(getTuneInMenuThumbnailForTitle("", "Test", (s: any, t: string) => t, testAvrContexts)).toBe("");
});

it("setTuneInMenuNowPlayingStation sets now playing title", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { setTuneInMenuNowPlayingStation, getTuneInMenuBrowseState } = mod as any;
  const e = `${uid()} 1.2.3.4 main`;
  getTuneInMenuBrowseState(e, testAvrContexts);
  setTuneInMenuNowPlayingStation(e, "My Station", testAvrContexts);
  expect(getTuneInMenuBrowseState(e, testAvrContexts).nowPlayingTitle).toBe("My Station");
});

it("setTuneInMenuNowPlayingStation is no-op for invalid entityId", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { setTuneInMenuNowPlayingStation } = mod as any;
  setTuneInMenuNowPlayingStation("", "test", testAvrContexts);
});

it("updateTuneInMenuNowPlayingStation matches existing option by title", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { addTuneInMenuOption, updateTuneInMenuNowPlayingStation, getTuneInMenuBrowseState } = mod as any;
  const e = `${uid()} 1.2.3.4 main`;
  addTuneInMenuOption(e, 1, "Radio Paradise", true, testAvrContexts);
  updateTuneInMenuNowPlayingStation(e, "Radio Paradise", testAvrContexts);
  expect(getTuneInMenuBrowseState(e, testAvrContexts).nowPlayingTitle).toBe("Radio Paradise");
});

it("updateTuneInMenuNowPlayingStation does not match non-existing title", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { addTuneInMenuOption, updateTuneInMenuNowPlayingStation, getTuneInMenuBrowseState } = mod as any;
  const e = `${uid()} 1.2.3.4 main`;
  addTuneInMenuOption(e, 1, "Station A", true, testAvrContexts);
  updateTuneInMenuNowPlayingStation(e, "Station B", testAvrContexts);
  expect(getTuneInMenuBrowseState(e, testAvrContexts).nowPlayingTitle).toBe("");
});

it("updateTuneInMenuNowPlayingStation is case-insensitive", async () => {
  const mod = await import("../src/tuneInMenuStore.js");
  const { addTuneInMenuOption, updateTuneInMenuNowPlayingStation, getTuneInMenuBrowseState } = mod as any;
  const e = `${uid()} 1.2.3.4 main`;
  addTuneInMenuOption(e, 1, "Radio Paradise", true, testAvrContexts);
  updateTuneInMenuNowPlayingStation(e, "radio paradise", testAvrContexts);
  expect(getTuneInMenuBrowseState(e, testAvrContexts).nowPlayingTitle).toBe("radio paradise");
});
