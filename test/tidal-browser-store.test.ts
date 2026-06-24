import { describe, it, expect, vi, beforeEach } from "vitest";

describe("tidalBrowserStore", () => {
  let store: any;
  const validEntityId = "TX-RZ50 1.2.3.4 main";
  const invalidEntityId = "bad";

  beforeEach(async () => {
    store = await import("../src/tidalBrowserStore.js");
  });

  it("getTidalBrowseState returns null for invalid entityId", () => {
    expect(store.getTidalBrowseState(invalidEntityId)).toBeNull();
  });

  it("getTidalBrowseState creates state for valid entityId", () => {
    const state = store.getTidalBrowseState(validEntityId);
    expect(state).not.toBeNull();
    expect(state.optionsByMenuIndex).toBeInstanceOf(Map);
  });

  it("getTidalBrowseState returns same state for same entityId", () => {
    const s1 = store.getTidalBrowseState(validEntityId);
    const s2 = store.getTidalBrowseState(validEntityId);
    expect(s1).toBe(s2);
  });

  it("addTidalMenuOption does nothing for invalid entityId", () => {
    expect(() => store.addTidalMenuOption(invalidEntityId, 1, "test")).not.toThrow();
  });

  it("addTidalMenuOption adds option to state", () => {
    const state = store.getTidalBrowseState(validEntityId);
    store.addTidalMenuOption(validEntityId, 1, "Test Song");
    expect(state.optionsByMenuIndex.size).toBe(1);
  });

  it("addTidalMenuOption sets isBrowsable based on title", () => {
    const state = store.getTidalBrowseState(validEntityId);
    store.addTidalMenuOption(validEntityId, 1, "Folder");
    store.addTidalMenuOption(validEntityId, 2, "Track - Artist");
    const opt1 = state.optionsByMenuIndex.get(1);
    const opt2 = state.optionsByMenuIndex.get(2);
    expect(opt1.isBrowsable).toBe(true);
    expect(opt2.isBrowsable).toBe(false);
  });

  it("addTidalMenuOption uses thumbnailResolver when provided", () => {
    const state = store.getTidalBrowseState(validEntityId);
    const resolver = vi.fn(() => "thumb://test");
    store.addTidalMenuOption(validEntityId, 1, "Test", resolver);
    expect(resolver).toHaveBeenCalledWith(state, "Test");
  });

  it("listTidalMenuOptions returns [] for invalid entityId", () => {
    expect(store.listTidalMenuOptions(invalidEntityId)).toEqual([]);
  });

  it("listTidalMenuOptions returns options from state", () => {
    store.addTidalMenuOption(validEntityId, 1, "Album");
    const options = store.listTidalMenuOptions(validEntityId);
    expect(options).toHaveLength(1);
    expect(options[0].title).toBe("Album");
  });

  it("getContiguousItemCount returns 0 for invalid entityId", () => {
    expect(store.getContiguousItemCount(invalidEntityId)).toBe(0);
  });

  it("getContiguousItemCount returns 0 for empty state", () => {
    const otherId = "TX-RZ50 1.2.3.4 zone2";
    store.resetTidalBrowseState(otherId);
    expect(store.getContiguousItemCount(otherId)).toBe(0);
  });

  it("resetTidalBrowseState does nothing for invalid entityId", () => {
    expect(() => store.resetTidalBrowseState(invalidEntityId)).not.toThrow();
  });

  it("resetTidalBrowseState clears state", () => {
    const state = store.getTidalBrowseState(validEntityId);
    store.addTidalMenuOption(validEntityId, 1, "X");
    store.resetTidalBrowseState(validEntityId);
    expect(state.optionsByMenuIndex.size).toBe(0);
  });

  it("consumeTraceNextTidalSelectionAfterMainMenu returns false for invalid", () => {
    expect(store.consumeTraceNextTidalSelectionAfterMainMenu(invalidEntityId)).toBe(false);
  });

  it("consumeTraceNextTidalSelectionAfterMainMenu returns true when set", () => {
    const state = store.getTidalBrowseState(validEntityId);
    state.traceNextSelectionAfterMainMenu = true;
    expect(store.consumeTraceNextTidalSelectionAfterMainMenu(validEntityId)).toBe(true);
    expect(store.consumeTraceNextTidalSelectionAfterMainMenu(validEntityId)).toBe(false);
  });

  it("consumeTidalListModeActive returns false for invalid entityId", () => {
    expect(store.consumeTidalListModeActive(invalidEntityId)).toBe(false);
  });

  it("getTidalThumbnailForTitle returns '' for invalid entityId", () => {
    expect(store.getTidalThumbnailForTitle(invalidEntityId, "test", vi.fn())).toBe("");
  });

  it("getTidalThumbnailForTitle calls resolver with state", () => {
    const state = store.getTidalBrowseState(validEntityId);
    const resolver = vi.fn(() => "thumb://xyz");
    const result = store.getTidalThumbnailForTitle(validEntityId, "test", resolver);
    expect(result).toBe("thumb://xyz");
    expect(resolver).toHaveBeenCalledWith(state, "test");
  });
});
