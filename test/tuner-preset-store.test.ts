import { describe, it, expect, beforeEach } from "vitest";
import { normalizeTunerPresets, tunerPresetCommandValue, type AvrTunerPreset } from "../src/tunerPresetStore.js";
import { AvrContextRegistry } from "../src/avrContext.js";

const AVR = "TX-RZ50 1.2.3.4";
const OTHER_AVR = "TX-RZ50 1.2.3.5";

function preset(slot: number, name: string, band = "2", freq = "0"): AvrTunerPreset {
  return { slot, name, band, freq };
}

let registry: AvrContextRegistry;
const store = (avr: string) => registry.get(avr).tunerPresets;

describe("tunerPresetStore", () => {
  beforeEach(() => {
    registry = new AvrContextRegistry();
  });

  it("keeps the stations in AVR slot order and drops empty slots", () => {
    const presets = normalizeTunerPresets([preset(12, "NPO FunX  "), preset(1, "R10 80s   "), preset(26, "   "), preset(13, ""), preset(28, "STRKSTAD", "1", "107.20")]);

    expect(presets.map((p) => [p.slot, p.name])).toEqual([
      [1, "R10 80s"],
      [12, "NPO FunX"],
      [28, "STRKSTAD"]
    ]);
  });

  it("drops slots that cannot be recalled", () => {
    expect(normalizeTunerPresets([preset(0, "Zero"), preset(-1, "Negative"), preset(1.5, "Fraction"), preset(Number.NaN, "Broken")])).toEqual([]);
  });

  it("keeps the first slot of a station name reported more than once", () => {
    // The same station once on DAB and once on FM cannot be told apart in a dropdown of names.
    const presets = normalizeTunerPresets([preset(16, "STRKSTAD"), preset(28, "STRKSTAD", "1", "107.20"), preset(4, "strkstad")]);

    expect(presets).toEqual([{ slot: 4, name: "strkstad", band: "2", freq: "0" }]);
  });

  it("reports a change only when the effective list differs", () => {
    expect(store(AVR).set([preset(1, "R10 80s")])).toBe(true);
    expect(store(AVR).set([preset(1, "R10 80s")])).toBe(false);
    expect(store(AVR).set([preset(1, "R10 80s"), preset(2, "R10")])).toBe(true);
    // Dropping everything leaves the AVR without known stations.
    expect(store(AVR).set([])).toBe(true);
    expect(store(AVR).has()).toBe(false);
  });

  it("looks up a station by name and by slot", () => {
    store(AVR).set([preset(1, "R10 80s"), preset(28, "STRKSTAD", "1", "107.20")]);

    expect(store(AVR).findByName("strkstad")?.slot).toBe(28);
    expect(store(AVR).findByName("STRKSTAD")?.freq).toBe("107.20");
    expect(store(AVR).findByName("NPO FunX")).toBeUndefined();
    expect(store(AVR).findNameBySlot(1)).toBe("R10 80s");
    expect(store(AVR).findNameBySlot(27)).toBeUndefined();
  });

  it("offers the station names alphabetically", () => {
    store(AVR).set([preset(1, "STRKSTAD", "1", "107.20"), preset(28, "R10 80s")]);

    expect(store(AVR).names()).toEqual(["R10 80s", "STRKSTAD"]);
    expect(store(AVR).list()).toHaveLength(2);
  });

  it("keeps the presets of other AVRs apart", () => {
    store(AVR).set([preset(1, "R10 80s")]);
    store(OTHER_AVR).set([preset(2, "NPO FunX")]);

    expect(store(AVR).names()).toEqual(["R10 80s"]);
    expect(store(OTHER_AVR).names()).toEqual(["NPO FunX"]);

    store(AVR).clear();
    expect(store(AVR).has()).toBe(false);
    expect(store(OTHER_AVR).has()).toBe(true);
  });

  it("formats the PRS value as the slot number in upper case hex", () => {
    expect(tunerPresetCommandValue(1)).toBe("01");
    expect(tunerPresetCommandValue(12)).toBe("0C");
    expect(tunerPresetCommandValue(26)).toBe("1A");
    expect(tunerPresetCommandValue(40)).toBe("28");
  });
});
