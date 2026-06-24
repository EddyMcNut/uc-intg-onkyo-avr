import { describe, it, expect, vi, beforeEach } from "vitest";

describe("tuneInBrowserStore", () => {
  let store: any;
  const invalidEntityId = "bad";

  beforeEach(async () => {
    vi.resetModules();
    store = await import("../src/tuneInBrowserStore.js");
  });

  it("getTuneInBrowseState returns null for invalid entityId", () => {
    expect(store.getTuneInBrowseState(invalidEntityId)).toBeNull();
  });

  it("getTuneInBrowseState creates and returns state for valid entityId", () => {
    const state = store.getTuneInBrowseState("A 1.2.3.4 main");
    expect(state).not.toBeNull();
    expect(state.contextTitle).toBe("");
  });

  it("getTuneInBrowseState returns same state for same entityId", () => {
    const id = "B 1.2.3.4 main";
    const s1 = store.getTuneInBrowseState(id);
    const s2 = store.getTuneInBrowseState(id);
    expect(s1).toBe(s2);
  });

  it("setTuneInBrowseContextState does nothing for invalid entityId", () => {
    expect(() => store.setTuneInBrowseContextState(invalidEntityId, "test")).not.toThrow();
  });

  it("setTuneInBrowseContextState sets context title", () => {
    const id = "C 1.2.3.4 main";
    const state = store.getTuneInBrowseState(id);
    store.setTuneInBrowseContextState(id, "My Presets");
    expect(state.contextTitle).toBe("my presets");
    expect(state.captureMyPresets).toBe(true);
  });

  it("setTuneInBrowseContextState clears presets when entering my presets", () => {
    const id = "D 1.2.3.4 main";
    const state = store.getTuneInBrowseState(id);
    state.presetsByMenuIndex.set(1, { presetIndex: 1 } as any);
    store.setTuneInBrowseContextState(id, "my presets");
    expect(state.presetsByMenuIndex.size).toBe(0);
  });

  it("addTuneInPreset does nothing for invalid entityId", () => {
    expect(() => store.addTuneInPreset(invalidEntityId, "test", "key", "raw", vi.fn())).not.toThrow();
  });

  it("addTuneInPreset adds preset to state", () => {
    const id = "E 1.2.3.4 main";
    const state = store.getTuneInBrowseState(id);
    const resolver = vi.fn(() => "thumb://p");
    store.addTuneInPreset(id, "Radio 1", "radio1", "Radio 1", resolver);
    expect(state.presetsByMenuIndex.size).toBe(1);
    expect(state.presetIndexByTitle.get("Radio 1")).toBe(1);
  });

  it("updateNowPlayingStation does nothing for invalid entityId", () => {
    expect(() => store.updateNowPlayingStation(invalidEntityId, "test")).not.toThrow();
  });

  it("updateNowPlayingStation sets station when candidate matches a preset", () => {
    const id = "F 1.2.3.4 main";
    const state = store.getTuneInBrowseState(id);
    store.addTuneInPreset(id, "Radio 1", "radio1", "Radio 1", vi.fn());
    store.updateNowPlayingStation(id, "Radio 1");
    expect(state.nowPlayingStation).toBe("Radio 1");
  });

  it("updateNowPlayingStation does not set station when no preset matches", () => {
    const id = "G 1.2.3.4 main";
    const state = store.getTuneInBrowseState(id);
    store.addTuneInPreset(id, "Radio 1", "radio1", "Radio 1", vi.fn());
    store.updateNowPlayingStation(id, "Unknown Station");
    expect(state.nowPlayingStation).toBe("");
  });

  it("listTuneInPresets returns [] for invalid entityId", () => {
    expect(store.listTuneInPresets(invalidEntityId)).toEqual([]);
  });

  it("listTuneInPresets returns sorted presets", () => {
    const id = "H 1.2.3.4 main";
    store.addTuneInPreset(id, "Z Station", "z", "Z Station", vi.fn());
    store.addTuneInPreset(id, "A Station", "a", "A Station", vi.fn());
    const presets = store.listTuneInPresets(id);
    expect(presets).toHaveLength(2);
    expect(presets[0].title).toBe("A Station");
    expect(presets[1].title).toBe("Z Station");
  });
});
