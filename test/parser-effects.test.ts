import { testAvrContexts } from "./helpers/contexts.js";
import { describe, expect, it, vi } from "vitest";
import { createParserEffects, type ParserEffects } from "../src/parserEffects.js";
import { IscpCommandParser } from "../src/eiscp-command-parser.js";
import { AvrContextRegistry } from "../src/avrContext.js";
import { AvrInfoStore, type AvrInfo } from "../src/avrInfoStore.js";

function menuState(overrides: Record<string, unknown> = {}) {
  return { nlsCursorOffset: 0, totalListItemCount: 0, nlsLayerNumber: 0, harvestMode: false, browseListFrozen: false, ...overrides } as any;
}

describe("parserEffects", () => {
  it("applies an NLT list header to the active menu-browse service", () => {
    const tidal = menuState();
    const effects = createParserEffects({ tidal: { getBrowseState: () => tidal } }, testAvrContexts);
    effects.applyListHeader("e", "tidal", { cursorOffset: 3, totalCount: 40, layerNumber: 2 });
    expect(tidal).toMatchObject({ nlsCursorOffset: 3, totalListItemCount: 40, nlsLayerNumber: 2 });
  });

  it("keeps the cursor during harvest and the layer while the list is frozen", () => {
    const deezer = menuState({ harvestMode: true, browseListFrozen: true, nlsCursorOffset: 9, nlsLayerNumber: 4 });
    createParserEffects({ deezer: { getBrowseState: () => deezer } }, testAvrContexts).applyListHeader("e", "deezer", { cursorOffset: 1, totalCount: 7, layerNumber: 2 });
    expect(deezer).toMatchObject({ nlsCursorOffset: 9, totalListItemCount: 7, nlsLayerNumber: 4 });
  });

  it("updates the TuneIn menu layer even when frozen, and ignores services without a store", () => {
    const tuneIn = menuState({ browseListFrozen: true });
    const effects = createParserEffects({ tuneInMenu: { getBrowseState: () => tuneIn } }, testAvrContexts);
    effects.applyListHeader("e", "tunein", { cursorOffset: 2, totalCount: 5, layerNumber: 3 });
    expect(tuneIn).toMatchObject({ nlsCursorOffset: 2, totalListItemCount: 5, nlsLayerNumber: 3 });
    expect(() => effects.applyListHeader("e", "spotify", { cursorOffset: 1, totalCount: 1, layerNumber: 1 })).not.toThrow();
    expect(() => effects.applyListHeader("e", "toString", { cursorOffset: 1, totalCount: 1, layerNumber: 1 })).not.toThrow();
  });

  it("applies a service-entry header unless the list is frozen", () => {
    const musicServer = menuState();
    const effects = createParserEffects({ musicServer: { getBrowseState: () => musicServer } }, testAvrContexts);
    effects.applyServiceEntryListHeader("e", "music-server", { cursorOffset: 4, totalCount: 12, layerNumber: 1 });
    expect(musicServer).toMatchObject({ nlsCursorOffset: 4, totalListItemCount: 12, nlsLayerNumber: 1 });

    musicServer.browseListFrozen = true;
    effects.applyServiceEntryListHeader("e", "music-server", { cursorOffset: 8, totalCount: 30, layerNumber: 3 });
    expect(musicServer).toMatchObject({ nlsCursorOffset: 4, totalListItemCount: 30, nlsLayerNumber: 1 });
  });
});

describe("parserEffects.storeAvrInfo logging", () => {
  const ENTITY = "TX-RZ50 1.2.3.4 main";
  const presets = (name: string) => [
    { slot: 1, name, band: "2", freq: "0" },
    { slot: 2, name: "Arrow", band: "1", freq: "107.20" },
    { slot: 3, name: "", band: "0", freq: "0" }
  ];
  const info = (name = "R10 80s") => ({ presets: presets(name), presetCount: 3 }) as unknown as AvrInfo;

  async function withLevel(level: "warn" | "debug", run: (logged: () => string[]) => void): Promise<void> {
    const loggers = await import("../src/loggers.js");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      loggers.setLogLevel(level);
      spy.mockClear();
      run(() => spy.mock.calls.map((call) => String(call[1])));
    } finally {
      loggers.setLogLevel("warn");
      spy.mockRestore();
    }
  }

  it("stores the AVR info without building the preset summary below debug level", async () => {
    const contexts = new AvrContextRegistry();
    const effects = createParserEffects({}, contexts);
    const dabPresets = vi.spyOn(AvrInfoStore.prototype, "dabPresets");
    const fmPresets = vi.spyOn(AvrInfoStore.prototype, "fmPresets");

    await withLevel("warn", (logged) => {
      effects.storeAvrInfo(ENTITY, info());
      expect(logged()).toEqual([]);
    });

    expect(contexts.forEntity(ENTITY)!.avrInfo.get()?.presets).toHaveLength(3);
    expect(dabPresets).not.toHaveBeenCalled();
    expect(fmPresets).not.toHaveBeenCalled();
    dabPresets.mockRestore();
    fmPresets.mockRestore();
  });

  it("lists the presets at debug level only when they changed", async () => {
    const effects = createParserEffects({}, new AvrContextRegistry());

    await withLevel("debug", (logged) => {
      effects.storeAvrInfo(ENTITY, info());
      expect(logged().filter((line) => line.includes("DAB presets"))).toHaveLength(1);
      expect(logged().filter((line) => line.includes("FM presets"))).toHaveLength(1);

      effects.storeAvrInfo(ENTITY, info());
      expect(logged().filter((line) => line.includes("DAB presets"))).toHaveLength(1);
      expect(logged().at(-1)).toContain("3 preset slot(s) unchanged");

      effects.storeAvrInfo(ENTITY, info("NPO Radio 2"));
      expect(logged().filter((line) => line.includes("DAB presets"))).toHaveLength(2);
      expect(logged().at(-3)).toContain("NPO Radio 2");
    });
  });
});

describe("IscpCommandParser reports state updates instead of writing them", () => {
  function spyEffects(): ParserEffects & { [K in keyof ParserEffects]: ReturnType<typeof vi.fn> } {
    return { applyListHeader: vi.fn(), applyServiceEntryListHeader: vi.fn(), storeAvrInfo: vi.fn() } as any;
  }
  const stateReader = (subSource: string) => ({ getSource: () => "net", getSubSource: () => subSource });

  it("passes the decoded NLT header for the current sub-source", () => {
    const effects = spyEffects();
    new IscpCommandParser(() => "e", stateReader("tidal"), effects, testAvrContexts).parse("NLT", "0101000300280200Some Folder");
    expect(effects.applyListHeader).toHaveBeenCalledWith("e", "tidal", { cursorOffset: 3, totalCount: 40, layerNumber: 2 });
  });

  it("passes the header that arrives with a service title before the sub-source is committed", () => {
    const effects = spyEffects();
    const result = new IscpCommandParser(() => "e", stateReader("unknown"), effects, testAvrContexts).parse("NLT", "0101000A001404Music Server");
    expect(effects.applyServiceEntryListHeader).toHaveBeenCalledWith("e", "music-server", { cursorOffset: 10, totalCount: 20, layerNumber: 4 });
    expect(result).toMatchObject({ command: "NLT", argument: "Music Server" });
  });

  it("hands the parsed NRI document to storeAvrInfo", () => {
    const effects = spyEffects();
    const xml = '<?xml version="1.0"?><response status="ok"><device id="TX-RZ50"><model>TX-RZ50</model><presetlist count="0"></presetlist></device></response>';
    const result = new IscpCommandParser(() => "e", stateReader("unknown"), effects, testAvrContexts).parse("NRI", xml);
    expect(result).toMatchObject({ command: "avr-info", argument: "0" });
    expect(effects.storeAvrInfo).toHaveBeenCalledTimes(1);
    expect(effects.storeAvrInfo.mock.calls[0][0]).toBe("e");
    expect(effects.storeAvrInfo.mock.calls[0][1]).toMatchObject({ model: "TX-RZ50" });
  });
});
