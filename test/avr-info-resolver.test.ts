import { describe, it, expect, beforeEach } from "vitest";
import { resolveAvrInfo, configPatchFor, type AvrInfoZoneResolution } from "../src/avrInfoResolver.js";
import { AvrContextRegistry } from "../src/avrContext.js";
import { parseAvrInfo } from "../src/avrInfoStore.js";
import { buildEntityId, buildPhysicalAvrId, type AvrConfig } from "../src/configManager.js";

const MODEL = "TX-RZ50";
const IP = "1.2.3.4";
const MAIN = buildEntityId(MODEL, IP, "main");
const ZONE2 = buildEntityId(MODEL, IP, "zone2");

function zone(zoneName: "main" | "zone2", overrides: Partial<AvrConfig> = {}): AvrConfig {
  return { model: MODEL, ip: IP, port: 60128, zone: zoneName, volumeScale: 100, useAvrReportedInputs: false, createTunerPresets: false, ...overrides } as AvrConfig;
}

function nri(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" ?><response><device><model>${MODEL}</model><zonelist count="2"><zone id="1" value="1" name="Main" volmax="100" /><zone id="2" value="2" name="Zone2" volmax="80" /></zonelist>${body}</device></response>`;
}

const SELECTORS = '<selectorlist count="2"><selector id="10" name="BD/DVD" /><selector id="01" name="CBL/SAT" /></selectorlist>';
const PRESETS =
  '<presetlist count="3"><preset id="01" band="2" freq="0" name="R10 80s" /><preset id="02" band="2" freq="0" name="" /><preset id="03" band="1" freq="107.20" name="Arrow" /></presetlist>';

describe("resolveAvrInfo", () => {
  let contexts: AvrContextRegistry;

  function seed(body: string): void {
    contexts.get(buildPhysicalAvrId(MODEL, IP)).avrInfo.set(parseAvrInfo(nri(body))!);
  }

  const context = () => contexts.get(buildPhysicalAvrId(MODEL, IP));

  beforeEach(() => {
    contexts = new AvrContextRegistry();
  });

  it("returns undefined for an entity that is not a configured AVR", () => {
    expect(resolveAvrInfo([zone("main")], "not-an-entity", contexts)).toBeUndefined();
    expect(resolveAvrInfo([zone("main")], buildEntityId("TX-NR860", "5.6.7.8", "main"), contexts)).toBeUndefined();
  });

  it("resolves an 'auto' volume scale per zone and leaves a manual one alone", () => {
    seed("");
    const result = resolveAvrInfo([zone("main", { volumeScale: "auto" }), zone("zone2", { volumeScale: "auto" })], MAIN, contexts)!;

    expect(result.zones.map((z) => z.volumeScale?.scale)).toEqual([100, 80]);
    expect(result.zones.map((z) => z.zoneEntry)).toEqual([MAIN, ZONE2]);

    const manual = resolveAvrInfo([zone("main")], MAIN, contexts)!;
    expect(manual.zones[0].volumeScale).toBeUndefined();
    expect(configPatchFor(manual.zones[0])).toBeUndefined();
  });

  it("stores the reported inputs once for the AVR and marks every later zone as changed", () => {
    seed(SELECTORS);
    const result = resolveAvrInfo([zone("main", { useAvrReportedInputs: true }), zone("zone2", { useAvrReportedInputs: true })], MAIN, contexts)!;

    expect(context().inputs.has()).toBe(true);
    expect(result.inputsUpdate).toEqual({ zoneEntry: MAIN, reason: expect.stringContaining("AVR reports 2 input(s)") });
    expect(result.zones.map((z) => [z.inputsResolved, z.avrDataChanged])).toEqual([
      [true, true],
      [true, true]
    ]);
    expect(configPatchFor(result.zones[0])).toBeUndefined();
  });

  it("reports no change when the same inputs arrive again", () => {
    seed(SELECTORS);
    const avrs = [zone("main", { useAvrReportedInputs: true })];
    resolveAvrInfo(avrs, MAIN, contexts);

    const again = resolveAvrInfo(avrs, MAIN, contexts)!;

    expect(again.inputsUpdate).toBeUndefined();
    expect(again.zones[0]).toMatchObject({ inputsResolved: true, avrDataChanged: false });
  });

  it("switches AVR-reported inputs off and forgets old inputs when the AVR reports none", () => {
    seed(SELECTORS);
    resolveAvrInfo([zone("main", { useAvrReportedInputs: true })], MAIN, contexts);
    seed("");

    const result = resolveAvrInfo([zone("main", { useAvrReportedInputs: true })], MAIN, contexts)!;

    expect(context().inputs.has()).toBe(false);
    expect(result.zones[0].disableReportedInputs).toContain("integration mappings are used");
    expect(result.zones[0].avrDataChanged).toBe(true);
    expect(configPatchFor(result.zones[0])).toEqual({ useAvrReportedInputs: false });
  });

  it("does not look at inputs for a zone with a manual input list", () => {
    seed(SELECTORS);
    const result = resolveAvrInfo([zone("main")], MAIN, contexts)!;

    expect(context().inputs.has()).toBe(false);
    expect(result.zones[0]).toMatchObject({ inputsResolved: false, avrDataChanged: false });
  });

  it("collects the named tuner presets once, in the order the first enabled zone asks for", () => {
    seed(PRESETS);
    const result = resolveAvrInfo([zone("main", { createTunerPresets: "preset-order" }), zone("zone2", { createTunerPresets: "alphabetical" })], MAIN, contexts)!;

    expect(result.presetsChanged).toBe(true);
    expect(result.presetsUpdate).toEqual({ zoneEntry: MAIN, names: ["R10 80s", "Arrow"] });
    expect(result.zones.map((z) => [z.tunerPresets, z.avrDataChanged])).toEqual([
      [true, true],
      [true, true]
    ]);

    const again = resolveAvrInfo([zone("main", { createTunerPresets: "preset-order" })], MAIN, contexts)!;
    expect(again.presetsChanged).toBe(false);
    expect(again.presetsUpdate).toBeUndefined();
    expect(again.zones[0].tunerPresets).toBe(true);
  });

  it("does not collect tuner presets when no zone has them enabled", () => {
    seed(PRESETS);
    const result = resolveAvrInfo([zone("main")], MAIN, contexts)!;

    expect(result.presetsChanged).toBe(false);
    expect(context().tunerPresets.has()).toBe(false);
    expect(result.zones[0].tunerPresets).toBe(false);
  });
});

describe("configPatchFor", () => {
  const base: AvrInfoZoneResolution = { avrConfig: zone("main"), zoneEntry: MAIN, inputsResolved: false, tunerPresets: false, avrDataChanged: false };

  it("combines the volume scale and the input switch into one patch", () => {
    expect(configPatchFor({ ...base, volumeScale: { scale: 80, reason: "r", discovered: true }, disableReportedInputs: "none" })).toEqual({
      volumeScale: 80,
      volumeScaleDiscovered: true,
      useAvrReportedInputs: false
    });
  });

  it("returns undefined when nothing was resolved", () => {
    expect(configPatchFor(base)).toBeUndefined();
  });
});
