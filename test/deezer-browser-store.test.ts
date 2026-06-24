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

  it("getDeezerBrowseState returns null for invalid entityId", () => {
    expect(store.getDeezerBrowseState(invalidEntityId)).toBeNull();
  });

  it("getDeezerBrowseState creates state for valid entityId", () => {
    const state = store.getDeezerBrowseState(validEntityId);
    expect(state).not.toBeNull();
    expect(state.optionsByMenuIndex).toBeInstanceOf(Map);
  });

  it("getDeezerBrowseState returns same state for same entityId", () => {
    const s1 = store.getDeezerBrowseState(validEntityId);
    const s2 = store.getDeezerBrowseState(validEntityId);
    expect(s1).toBe(s2);
  });

  it("addDeezerMenuOption does nothing for invalid entityId", () => {
    expect(() => store.addDeezerMenuOption(invalidEntityId, 1, "test")).not.toThrow();
  });

  it("addDeezerMenuOption adds option to state", () => {
    const state = store.getDeezerBrowseState(validEntityId);
    store.addDeezerMenuOption(validEntityId, 1, "Test Song / Artist");
    expect(state.optionsByMenuIndex.size).toBe(1);
  });

  it("addDeezerMenuOption sets isBrowsable based on title", () => {
    const state = store.getDeezerBrowseState(validEntityId);
    store.addDeezerMenuOption(validEntityId, 1, "Track / Artist");
    store.addDeezerMenuOption(validEntityId, 2, "Folder");
    const opt1 = state.optionsByMenuIndex.get(1);
    const opt2 = state.optionsByMenuIndex.get(2);
    expect(opt1.isBrowsable).toBe(false);
    expect(opt2.isBrowsable).toBe(true);
  });

  it("addDeezerMenuOption uses thumbnailResolver when provided", () => {
    const state = store.getDeezerBrowseState(validEntityId);
    const resolver = vi.fn(() => "thumb://test");
    store.addDeezerMenuOption(validEntityId, 1, "Test", resolver);
    expect(resolver).toHaveBeenCalledWith(state, "Test");
  });

  it("listDeezerMenuOptions returns [] for invalid entityId", () => {
    expect(store.listDeezerMenuOptions(invalidEntityId)).toEqual([]);
  });

  it("listDeezerMenuOptions returns options from state", () => {
    store.addDeezerMenuOption(validEntityId, 1, "A / B");
    const options = store.listDeezerMenuOptions(validEntityId);
    expect(options).toHaveLength(1);
    expect(options[0].title).toBe("A / B");
  });

  it("getContiguousItemCount returns 0 for invalid/missing entityId", () => {
    expect(store.getContiguousItemCount(invalidEntityId)).toBe(0);
  });

  it("getContiguousItemCount returns 0 for empty state", () => {
    const otherId = "TX-RZ50 1.2.3.4 zone2";
    store.resetDeezerBrowseState(otherId);
    expect(store.getContiguousItemCount(otherId)).toBe(0);
  });

  it("resetDeezerBrowseState does nothing for invalid entityId", () => {
    expect(() => store.resetDeezerBrowseState(invalidEntityId)).not.toThrow();
  });

  it("resetDeezerBrowseState clears state", () => {
    const state = store.getDeezerBrowseState(validEntityId);
    store.addDeezerMenuOption(validEntityId, 1, "X / Y");
    store.resetDeezerBrowseState(validEntityId);
    expect(state.optionsByMenuIndex.size).toBe(0);
  });

  it("consumeTraceNextDeezerSelectionAfterMainMenu returns false for invalid entityId", () => {
    expect(store.consumeTraceNextDeezerSelectionAfterMainMenu(invalidEntityId)).toBe(false);
  });

  it("consumeTraceNextDeezerSelectionAfterMainMenu returns true when set", () => {
    const state = store.getDeezerBrowseState(validEntityId);
    state.traceNextSelectionAfterMainMenu = true;
    expect(store.consumeTraceNextDeezerSelectionAfterMainMenu(validEntityId)).toBe(true);
    expect(store.consumeTraceNextDeezerSelectionAfterMainMenu(validEntityId)).toBe(false);
  });

  it("consumeDeezerListModeActive returns false for invalid entityId", () => {
    expect(store.consumeDeezerListModeActive(invalidEntityId)).toBe(false);
  });

  it("getDeezerThumbnailForTitle returns '' for invalid entityId", () => {
    expect(store.getDeezerThumbnailForTitle(invalidEntityId, "test", vi.fn())).toBe("");
  });

  it("getDeezerThumbnailForTitle calls resolver with state", () => {
    const state = store.getDeezerBrowseState(validEntityId);
    const resolver = vi.fn(() => "thumb://abc");
    const result = store.getDeezerThumbnailForTitle(validEntityId, "test", resolver);
    expect(result).toBe("thumb://abc");
    expect(resolver).toHaveBeenCalledWith(state, "test");
  });
});
