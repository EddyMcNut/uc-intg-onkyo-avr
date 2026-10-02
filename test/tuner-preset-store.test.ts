import { describe, it, expect, beforeEach } from "vitest";
import {
  clearAllTunerPresets,
  clearTunerPresets,
  findTunerPresetByName,
  findTunerPresetNameBySlot,
  getTunerPresetNames,
  getTunerPresets,
  hasTunerPresets,
  normalizeTunerPresets,
  setTunerPresets,
  tunerPresetCommandValue,
  type AvrTunerPreset
} from "../src/tunerPresetStore.js";

const AVR = "TX-RZ50 1.2.3.4";
const OTHER_AVR = "TX-RZ50 1.2.3.5";

function preset(slot: number, name: string, band = "2", freq = "0"): AvrTunerPreset {
  return { slot, name, band, freq };
}

describe("tunerPresetStore", () => {
  beforeEach(() => {
    clearAllTunerPresets();
  });

  it("keeps the stations in AVR slot order and drops empty slots", () => {
    const presets = normalizeTunerPresets([
      preset(12, "NPO FunX  "),
      preset(1, "R10 80s   "),
      preset(26, "   "),
      preset(13, ""),
      preset(28, "STRKSTAD", "1", "107.20")
    ]);

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
    expect(setTunerPresets(AVR, [preset(1, "R10 80s")])).toBe(true);
    expect(setTunerPresets(AVR, [preset(1, "R10 80s")])).toBe(false);
    expect(setTunerPresets(AVR, [preset(1, "R10 80s"), preset(2, "R10")])).toBe(true);
    // Dropping everything leaves the AVR without known stations.
    expect(setTunerPresets(AVR, [])).toBe(true);
    expect(hasTunerPresets(AVR)).toBe(false);
  });

  it("looks up a station by name and by slot", () => {
    setTunerPresets(AVR, [preset(1, "R10 80s"), preset(28, "STRKSTAD", "1", "107.20")]);

    expect(findTunerPresetByName(AVR, "strkstad")?.slot).toBe(28);
    expect(findTunerPresetByName(AVR, "STRKSTAD")?.freq).toBe("107.20");
    expect(findTunerPresetByName(AVR, "NPO FunX")).toBeUndefined();
    expect(findTunerPresetNameBySlot(AVR, 1)).toBe("R10 80s");
    expect(findTunerPresetNameBySlot(AVR, 27)).toBeUndefined();
  });

  it("offers the station names in slot order", () => {
    setTunerPresets(AVR, [preset(28, "STRKSTAD", "1", "107.20"), preset(1, "R10 80s")]);

    expect(getTunerPresetNames(AVR)).toEqual(["R10 80s", "STRKSTAD"]);
    expect(getTunerPresets(AVR)).toHaveLength(2);
  });

  it("keeps the presets of other AVRs apart", () => {
    setTunerPresets(AVR, [preset(1, "R10 80s")]);
    setTunerPresets(OTHER_AVR, [preset(2, "NPO FunX")]);

    expect(getTunerPresetNames(AVR)).toEqual(["R10 80s"]);
    expect(getTunerPresetNames(OTHER_AVR)).toEqual(["NPO FunX"]);

    clearTunerPresets(AVR);
    expect(hasTunerPresets(AVR)).toBe(false);
    expect(hasTunerPresets(OTHER_AVR)).toBe(true);
  });

  it("formats the PRS value as the slot number in upper case hex", () => {
    expect(tunerPresetCommandValue(1)).toBe("01");
    expect(tunerPresetCommandValue(12)).toBe("0C");
    expect(tunerPresetCommandValue(26)).toBe("1A");
    expect(tunerPresetCommandValue(40)).toBe("28");
  });
});