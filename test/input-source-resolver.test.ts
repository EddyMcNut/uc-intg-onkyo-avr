import { describe, it, expect, beforeEach } from "vitest";
import { resolveInputSourceList } from "../src/inputSourceResolver.js";
import { clearAllAvrInputs } from "../src/inputSourceStore.js";
import { parseAvrInfo, setAvrInfo, resetAvrInfo } from "../src/avrInfoStore.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AvrConfig } from "../src/configManager.js";

const ENTITY_ID = "TX-RZ50 192.168.2.103 main";
const AVR_CONFIG = { model: "TX-RZ50", ip: "192.168.2.103", zone: "main", inputSourceList: "auto" } as AvrConfig;

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

    expect(resolution?.mode).toBe("auto");
    // Sorted by name, so the option list is presented in a stable order.
    expect(resolution?.inputs).toEqual([
      { id: "10", name: "BD/DVD" },
      { id: "01", name: "CBL/SAT" }
    ]);
    expect(resolution?.reason).toContain("2 input(s)");
  });

  it("falls back to 'manual' when the AVR reports no inputs", () => {
    setAvrInfo(ENTITY_ID, parseAvrInfo(nriXml("")));

    const resolution = resolveInputSourceList(AVR_CONFIG, ENTITY_ID);

    expect(resolution?.mode).toBe("manual");
    expect(resolution?.inputs).toBeUndefined();
    expect(resolution?.reason).toContain("no input sources");
  });

  it("falls back to 'manual' when nothing was collected at all", () => {
    expect(resolveInputSourceList(AVR_CONFIG, ENTITY_ID)?.mode).toBe("manual");
  });

  it("ignores reported inputs without a usable name", () => {
    setAvrInfo(ENTITY_ID, parseAvrInfo(nriXml('<selectorlist count="2"><selector id="10" name="" /><selector id="" name="TV" /></selectorlist>')));

    const resolution = resolveInputSourceList(AVR_CONFIG, ENTITY_ID);

    expect(resolution?.mode).toBe("manual");
    expect(resolution?.reason).toContain("without usable names");
  });

  it("skips the placeholder entry 'Source' some AVRs report", () => {
    setAvrInfo(ENTITY_ID, parseAvrInfo(nriXml('<selectorlist count="3"><selector id="10" name="BD/DVD" /><selector id="12" name="TV" /><selector id="80" name="Source" /></selectorlist>')));

    const resolution = resolveInputSourceList(AVR_CONFIG, ENTITY_ID);

    expect(resolution?.mode).toBe("auto");
    expect(resolution?.inputs).toEqual([
      { id: "10", name: "BD/DVD" },
      { id: "12", name: "TV" }
    ]);
  });

  it("falls back to 'manual' when the AVR only reports placeholder inputs", () => {
    setAvrInfo(ENTITY_ID, parseAvrInfo(nriXml('<selectorlist count="1"><selector id="80" name="SOURCE" /></selectorlist>')));

    const resolution = resolveInputSourceList(AVR_CONFIG, ENTITY_ID);

    expect(resolution?.mode).toBe("manual");
    expect(resolution?.reason).toContain("placeholder");
  });

  it("does nothing when the setting is already 'manual'", () => {
    setAvrInfo(ENTITY_ID, parseAvrInfo(nriXml('<selectorlist count="1"><selector id="10" name="BD/DVD" /></selectorlist>')));

    expect(resolveInputSourceList({ ...AVR_CONFIG, inputSourceList: "manual" }, ENTITY_ID)).toBeUndefined();
  });

  it("reads the inputs of a real AVR payload", () => {
    const xml = readFileSync(path.join(__dirname, "fixtures", "nri-response.xml"), "utf-8");
    setAvrInfo(ENTITY_ID, parseAvrInfo(xml));

    const resolution = resolveInputSourceList(AVR_CONFIG, ENTITY_ID);

    expect(resolution?.mode).toBe("auto");
    expect(resolution?.inputs?.map((input) => input.name)).toContain("BD/DVD");
    expect(resolution?.inputs?.find((input) => input.name === "DAB")?.id).toBe("33");
  });
});
