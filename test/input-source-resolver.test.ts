import { describe, it, expect, beforeEach } from "vitest";
import { getEffectiveInputSourceOptions, resolveInputSourceList } from "../src/inputSourceResolver.js";
import { clearAllAvrInputs, setAvrInputs } from "../src/inputSourceStore.js";
import { parseAvrInfo, setAvrInfo, resetAvrInfo } from "../src/avrInfoStore.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AvrConfig } from "../src/configManager.js";

const ENTITY_ID = "TX-RZ50 192.168.2.103 main";
const AVR_CONFIG = { model: "TX-RZ50", ip: "192.168.2.103", zone: "main", useAvrReportedInputs: true } as AvrConfig;

function nriXml(selectorList: string): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" ?>`,
    `<response><device><model>TX-RZ50</model>`,
    `<zonelist count="1"><zone id="1" value="1" name="Main" volmax="100" /></zonelist>`,
    selectorList,
    `</device></response>`
  ].join("");
}

describe("inputSourceResolver", () => {
  beforeEach(() => {
    clearAllAvrInputs();
    resetAvrInfo(ENTITY_ID);
  });

  it("keeps 'auto' and returns the inputs the AVR reported", () => {
    setAvrInfo(ENTITY_ID, parseAvrInfo(nriXml('<selectorlist count="2"><selector id="10" name="BD/DVD" /><selector id="01" name="CBL/SAT" /></selectorlist>')));

    const resolution = resolveInputSourceList(AVR_CONFIG, ENTITY_ID);

    // Sorted by name, so the option list is presented in a stable order.
    expect(resolution?.inputs).toEqual([
      { id: "10", name: "BD/DVD" },
      { id: "01", name: "CBL/SAT" }
    ]);
    expect(resolution?.reason).toContain("2 input(s)");
  });

  it("falls back to integration mappings when the AVR reports no inputs", () => {
    setAvrInfo(ENTITY_ID, parseAvrInfo(nriXml("")));

    const resolution = resolveInputSourceList(AVR_CONFIG, ENTITY_ID);

    expect(resolution?.inputs).toBeUndefined();
    expect(resolution?.reason).toContain("no input sources");
  });

  it("falls back to integration mappings when nothing was collected at all", () => {
    expect(resolveInputSourceList(AVR_CONFIG, ENTITY_ID)?.inputs).toBeUndefined();
  });

  it("ignores reported inputs without a usable name", () => {
    setAvrInfo(ENTITY_ID, parseAvrInfo(nriXml('<selectorlist count="2"><selector id="10" name="" /><selector id="" name="TV" /></selectorlist>')));

    const resolution = resolveInputSourceList(AVR_CONFIG, ENTITY_ID);

    expect(resolution?.inputs).toBeUndefined();
    expect(resolution?.reason).toContain("no usable");
  });

  it("skips the placeholder entry 'Source' some AVRs report", () => {
    setAvrInfo(ENTITY_ID, parseAvrInfo(nriXml('<selectorlist count="3"><selector id="10" name="BD/DVD" /><selector id="12" name="TV" /><selector id="80" name="Source" /></selectorlist>')));

    const resolution = resolveInputSourceList(AVR_CONFIG, ENTITY_ID);

    expect(resolution?.inputs).toEqual([
      { id: "10", name: "BD/DVD" },
      { id: "12", name: "TV" }
    ]);
  });

  it("falls back when the AVR only reports placeholder inputs", () => {
    setAvrInfo(ENTITY_ID, parseAvrInfo(nriXml('<selectorlist count="1"><selector id="80" name="SOURCE" /></selectorlist>')));

    const resolution = resolveInputSourceList(AVR_CONFIG, ENTITY_ID);

    expect(resolution?.inputs).toBeUndefined();
  });

  it("does nothing when AVR-reported names are disabled", () => {
    setAvrInfo(ENTITY_ID, parseAvrInfo(nriXml('<selectorlist count="1"><selector id="10" name="BD/DVD" /></selectorlist>')));

    expect(resolveInputSourceList({ ...AVR_CONFIG, useAvrReportedInputs: false }, ENTITY_ID)).toBeUndefined();
  });

  it("reads the inputs of a real AVR payload", () => {
    const xml = readFileSync(path.join(__dirname, "fixtures", "nri-response.xml"), "utf-8");
    setAvrInfo(ENTITY_ID, parseAvrInfo(xml));

    const resolution = resolveInputSourceList(AVR_CONFIG, ENTITY_ID);

    expect(resolution?.inputs?.map((input) => input.name)).toContain("BD/DVD");
    expect(resolution?.inputs?.find((input) => input.name === "DAB")?.id).toBe("33");
  });

  it("adds enabled NRI network services and sorts them with selectors", () => {
    setAvrInfo(
      ENTITY_ID,
      parseAvrInfo(
        nriXml(
          [
            '<selectorlist count="1"><selector id="10" name="BD/DVD" /></selectorlist>',
            '<netservicelist count="3"><netservice id="0a" name="Spotify" value="1" />',
            '<netservice id="0e" name="TuneIn Radio" value="1" />',
            '<netservice id="40" name="Chromecast built-in" value="2" enable="1" /></netservicelist>'
          ].join("")
        )
      )
    );

    expect(resolveInputSourceList(AVR_CONFIG, ENTITY_ID)?.inputs).toEqual([
      { id: "10", name: "BD/DVD" },
      { id: "40", name: "Chromecast built-in" },
      { id: "0a", name: "Spotify" },
      { id: "0e", name: "TuneIn Radio" }
    ]);
  });

  it("renames configured aliases when the AVR reports the same ID and keeps unmatched aliases", () => {
    setAvrInfo(ENTITY_ID, parseAvrInfo(nriXml('<selectorlist count="2"><selector id="10" name="Blu-ray" /><selector id="12" name="Television" /></selectorlist>')));
    setAvrInputs("TX-RZ50 192.168.2.103", [
      { id: "10", name: "Blu-ray" },
      { id: "12", name: "Television" }
    ]);
    const config = { ...AVR_CONFIG, inputSelectorOptions: ["bd", "tv", "cd"] };

    expect(getEffectiveInputSourceOptions(config, "TX-RZ50 192.168.2.103", ["bd", "tv", "cd"])).toEqual(["Blu-ray", "Television", "cd"]);
  });
});
