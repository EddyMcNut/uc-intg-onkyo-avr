import { testAvrContexts } from "./helpers/contexts.js";
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("tidalBrowserStore", () => {
  let store: any;
  const validEntityId = "TX-RZ50 1.2.3.4 main";
  const invalidEntityId = "bad";

  beforeEach(async () => {
    store = await import("../src/tidalBrowserStore.js");
  });

  it("getBrowseState returns null for invalid entityId", () => {
    expect(store.tidalStore.getBrowseState(invalidEntityId, testAvrContexts)).toBeNull();
  });

  it("getBrowseState creates state for valid entityId", () => {
    const state = store.tidalStore.getBrowseState(validEntityId, testAvrContexts);
    expect(state).not.toBeNull();
    expect(state.optionsByMenuIndex).toBeInstanceOf(Map);
  });

  it("getBrowseState returns same state for same entityId", () => {
    const s1 = store.tidalStore.getBrowseState(validEntityId, testAvrContexts);
    const s2 = store.tidalStore.getBrowseState(validEntityId, testAvrContexts);
    expect(s1).toBe(s2);
  });

  it("addMenuOption does nothing for invalid entityId", () => {
    expect(() => store.tidalStore.addMenuOption(invalidEntityId, 1, "test", testAvrContexts)).not.toThrow();
  });

  it("addMenuOption adds option to state", () => {
    const state = store.tidalStore.getBrowseState(validEntityId, testAvrContexts);
    store.tidalStore.addMenuOption(validEntityId, 1, "Test Song", testAvrContexts);
    expect(state.optionsByMenuIndex.size).toBe(1);
  });

  it("addMenuOption sets isBrowsable based on title", () => {
    const state = store.tidalStore.getBrowseState(validEntityId, testAvrContexts);
    store.tidalStore.addMenuOption(validEntityId, 1, "Folder", testAvrContexts);
    store.tidalStore.addMenuOption(validEntityId, 2, "Track - Artist", testAvrContexts);
    const opt1 = state.optionsByMenuIndex.get(1);
    const opt2 = state.optionsByMenuIndex.get(2);
    expect(opt1.isBrowsable).toBe(true);
    expect(opt2.isBrowsable).toBe(false);
  });

  it("addMenuOption uses thumbnailResolver when provided", () => {
    const state = store.tidalStore.getBrowseState(validEntityId, testAvrContexts);
    const resolver = vi.fn(() => "thumb://test");
    store.tidalStore.addMenuOption(validEntityId, 1, "Test", testAvrContexts, { thumbnailResolver: resolver });
    expect(resolver).toHaveBeenCalledWith(state, "Test");
  });

  it("listOptions returns [] for invalid entityId", () => {
    expect(store.tidalStore.listOptions(invalidEntityId, testAvrContexts)).toEqual([]);
  });

  it("listOptions returns options from state", () => {
    store.tidalStore.addMenuOption(validEntityId, 1, "Album", testAvrContexts);
    const options = store.tidalStore.listOptions(validEntityId, testAvrContexts);
    expect(options).toHaveLength(1);
    expect(options[0].title).toBe("Album");
  });

  it("getContiguousItemCount returns 0 for invalid entityId", () => {
    expect(store.tidalStore.getContiguousItemCount(invalidEntityId, testAvrContexts)).toBe(0);
  });

  it("getContiguousItemCount returns 0 for empty state", () => {
    const otherId = "TX-RZ50 1.2.3.4 zone2";
    store.tidalStore.resetState(otherId, testAvrContexts);
    expect(store.tidalStore.getContiguousItemCount(otherId, testAvrContexts)).toBe(0);
  });

  it("resetState does nothing for invalid entityId", () => {
    expect(() => store.tidalStore.resetState(invalidEntityId, testAvrContexts)).not.toThrow();
  });

  it("resetState clears state", () => {
    const state = store.tidalStore.getBrowseState(validEntityId, testAvrContexts);
    store.tidalStore.addMenuOption(validEntityId, 1, "X", testAvrContexts);
    store.tidalStore.resetState(validEntityId, testAvrContexts);
    expect(state.optionsByMenuIndex.size).toBe(0);
  });

  it("consumeTraceNextSelectionAfterMainMenu returns false for invalid", () => {
    expect(store.tidalStore.consumeTraceNextSelectionAfterMainMenu(invalidEntityId, testAvrContexts)).toBe(false);
  });

  it("consumeTraceNextSelectionAfterMainMenu returns true when set", () => {
    const state = store.tidalStore.getBrowseState(validEntityId, testAvrContexts);
    state.traceNextSelectionAfterMainMenu = true;
    expect(store.tidalStore.consumeTraceNextSelectionAfterMainMenu(validEntityId, testAvrContexts)).toBe(true);
    expect(store.tidalStore.consumeTraceNextSelectionAfterMainMenu(validEntityId, testAvrContexts)).toBe(false);
  });

  it("consumeListModeActive returns false for invalid entityId", () => {
    expect(store.tidalStore.consumeListModeActive(invalidEntityId, testAvrContexts)).toBe(false);
  });

  it("thumbnailForTitle returns '' for invalid entityId", () => {
    expect(store.tidalStore.thumbnailForTitle(invalidEntityId, "test", vi.fn(), testAvrContexts)).toBe("");
  });

  it("thumbnailForTitle calls resolver with state", () => {
    const state = store.tidalStore.getBrowseState(validEntityId, testAvrContexts);
    const resolver = vi.fn(() => "thumb://xyz");
    const result = store.tidalStore.thumbnailForTitle(validEntityId, "test", resolver, testAvrContexts);
    expect(result).toBe("thumb://xyz");
    expect(resolver).toHaveBeenCalledWith(state, "test");
  });
});
