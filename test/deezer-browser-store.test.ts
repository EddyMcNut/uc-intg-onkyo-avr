import { testAvrContexts } from "./helpers/contexts.js";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("deezerBrowserStore", () => {
  let store: any;
  const validEntityId = "TX-RZ50 1.2.3.4 main";
  const invalidEntityId = "bad";

  beforeEach(async () => {
    store = await import("../src/deezerBrowserStore.js");
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("getBrowseState returns null for invalid entityId", () => {
    expect(store.deezerStore.getBrowseState(invalidEntityId, testAvrContexts)).toBeNull();
  });

  it("getBrowseState creates state for valid entityId", () => {
    const state = store.deezerStore.getBrowseState(validEntityId, testAvrContexts);
    expect(state).not.toBeNull();
    expect(state.optionsByMenuIndex).toBeInstanceOf(Map);
  });

  it("getBrowseState returns same state for same entityId", () => {
    const s1 = store.deezerStore.getBrowseState(validEntityId, testAvrContexts);
    const s2 = store.deezerStore.getBrowseState(validEntityId, testAvrContexts);
    expect(s1).toBe(s2);
  });

  it("addMenuOption does nothing for invalid entityId", () => {
    expect(() => store.deezerStore.addMenuOption(invalidEntityId, 1, "test", testAvrContexts)).not.toThrow();
  });

  it("addMenuOption adds option to state", () => {
    const state = store.deezerStore.getBrowseState(validEntityId, testAvrContexts);
    store.deezerStore.addMenuOption(validEntityId, 1, "Test Song / Artist", testAvrContexts);
    expect(state.optionsByMenuIndex.size).toBe(1);
  });

  it("addMenuOption sets isBrowsable based on title", () => {
    const state = store.deezerStore.getBrowseState(validEntityId, testAvrContexts);
    store.deezerStore.addMenuOption(validEntityId, 1, "Track / Artist", testAvrContexts);
    store.deezerStore.addMenuOption(validEntityId, 2, "Folder", testAvrContexts);
    const opt1 = state.optionsByMenuIndex.get(1);
    const opt2 = state.optionsByMenuIndex.get(2);
    expect(opt1.isBrowsable).toBe(false);
    expect(opt2.isBrowsable).toBe(true);
  });

  it("addMenuOption uses thumbnailResolver when provided", () => {
    const state = store.deezerStore.getBrowseState(validEntityId, testAvrContexts);
    const resolver = vi.fn(() => "thumb://test");
    store.deezerStore.addMenuOption(validEntityId, 1, "Test", testAvrContexts, { thumbnailResolver: resolver });
    expect(resolver).toHaveBeenCalledWith(state, "Test");
  });

  it("listOptions returns [] for invalid entityId", () => {
    expect(store.deezerStore.listOptions(invalidEntityId, testAvrContexts)).toEqual([]);
  });

  it("listOptions returns options from state", () => {
    store.deezerStore.addMenuOption(validEntityId, 1, "A / B", testAvrContexts);
    const options = store.deezerStore.listOptions(validEntityId, testAvrContexts);
    expect(options).toHaveLength(1);
    expect(options[0].title).toBe("A / B");
  });

  it("getContiguousItemCount returns 0 for invalid/missing entityId", () => {
    expect(store.deezerStore.getContiguousItemCount(invalidEntityId, testAvrContexts)).toBe(0);
  });

  it("getContiguousItemCount returns 0 for empty state", () => {
    const otherId = "TX-RZ50 1.2.3.4 zone2";
    store.deezerStore.resetState(otherId, testAvrContexts);
    expect(store.deezerStore.getContiguousItemCount(otherId, testAvrContexts)).toBe(0);
  });

  it("resetState does nothing for invalid entityId", () => {
    expect(() => store.deezerStore.resetState(invalidEntityId, testAvrContexts)).not.toThrow();
  });

  it("resetState clears state", () => {
    const state = store.deezerStore.getBrowseState(validEntityId, testAvrContexts);
    store.deezerStore.addMenuOption(validEntityId, 1, "X / Y", testAvrContexts);
    store.deezerStore.resetState(validEntityId, testAvrContexts);
    expect(state.optionsByMenuIndex.size).toBe(0);
  });

  it("consumeTraceNextSelectionAfterMainMenu returns false for invalid entityId", () => {
    expect(store.deezerStore.consumeTraceNextSelectionAfterMainMenu(invalidEntityId, testAvrContexts)).toBe(false);
  });

  it("consumeTraceNextSelectionAfterMainMenu returns true when set", () => {
    const state = store.deezerStore.getBrowseState(validEntityId, testAvrContexts);
    state.traceNextSelectionAfterMainMenu = true;
    expect(store.deezerStore.consumeTraceNextSelectionAfterMainMenu(validEntityId, testAvrContexts)).toBe(true);
    expect(store.deezerStore.consumeTraceNextSelectionAfterMainMenu(validEntityId, testAvrContexts)).toBe(false);
  });

  it("consumeListModeActive returns false for invalid entityId", () => {
    expect(store.deezerStore.consumeListModeActive(invalidEntityId, testAvrContexts)).toBe(false);
  });

  it("thumbnailForTitle returns '' for invalid entityId", () => {
    expect(store.deezerStore.thumbnailForTitle(invalidEntityId, "test", vi.fn(), testAvrContexts)).toBe("");
  });

  it("thumbnailForTitle calls resolver with state", () => {
    const state = store.deezerStore.getBrowseState(validEntityId, testAvrContexts);
    const resolver = vi.fn(() => "thumb://abc");
    const result = store.deezerStore.thumbnailForTitle(validEntityId, "test", resolver, testAvrContexts);
    expect(result).toBe("thumb://abc");
    expect(resolver).toHaveBeenCalledWith(state, "test");
  });
});
