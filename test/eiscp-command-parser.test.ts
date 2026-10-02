import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const realResponseXml = readFileSync(resolve(here, "fixtures/nri-response.xml"), "utf-8");

function toHex(text: string): string {
  return Buffer.from(text, "ascii").toString("hex");
}

function makeParserHarness(options?: { source?: string; subSource?: string; deezerState?: any; tidalState?: any; tuneInMenuState?: any }) {
  const source = options?.source ?? "net";
  const subSource = options?.subSource ?? "tidal";
  const deezerState = options?.deezerState ?? null;
  const tidalState = options?.tidalState ?? null;
  const tuneInMenuState = options?.tuneInMenuState ?? null;

  const stateReader = {
    getSource: () => source,
    getSubSource: () => subSource
  };
  const deezerStoreApi = { getBrowseState: () => deezerState };
  const tidalStoreApi = { getBrowseState: () => tidalState };
  const tuneInStoreApi = { getBrowseState: () => tuneInMenuState };
  const getEntityId = () => "entity1";

  return { stateReader, deezerStoreApi, tidalStoreApi, tuneInStoreApi, getEntityId };
}

it("IscpCommandParser handles truncated and valid NLA frames", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness();
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const result1 = parser.parse("NLA", "X");
  expect(result1).toBe(null);

  const result2 = parser.parse("NLA", "X123");
  expect(result2).toBe(null);

  const result3 = parser.parse("NLA", "XYZAB");
  expect(result3).toBe(null);

  const validNla = 'X0001S<?xml version="1.0"?><response status="ok"><items offset="0000"><item title="Test" url="0"/></items></response>';
  const result4 = parser.parse("NLA", validNla);
  expect(result4?.command).toBe("NLA");
  expect((result4?.argument as string)?.includes("<response")).toBe(true);
});

it("IscpCommandParser parses malformed and valid NTM payloads", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ subSource: "spotify" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const result1 = parser.parse("NTM", "abc:def:ghi/xyz:pqr:stu");
  expect(result1?.command).toBe("NTM");
  const parts = (result1?.argument as string)?.split("/");
  expect(parts?.[0]).toBe("0");
  expect(parts?.[1]).toBe("0");

  const result2 = parser.parse("NTM", "10:abc:30/01:02:03");
  expect(result2?.command).toBe("NTM");
  const parts2 = (result2?.argument as string)?.split("/");
  expect(parts2?.[0]).toBe("0");
  expect(parts2?.[1]).toBe("3723");

  const result3 = parser.parse("NTM", "01:23:45/02:34:56");
  expect(result3?.argument as string).toBe("5025/9296");
});

it("IscpCommandParser metadata flows keep raw values and support patch/get", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness();
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const result1 = parser.parse("NTI", "4F6E6B796F");
  expect(result1).toBeTruthy();
  expect(result1?.command).toBe("metadata");
  const metadata = result1?.argument as any;
  expect(metadata).toBeTruthy();
  expect(metadata?.artist).toBe("4F6E6B796F");

  const result2 = parser.parse("NAT", "Test Title");
  expect(result2?.command).toBe("metadata");
  expect((result2?.argument as any)?.title).toBe("Test Title");

  const result3 = parser.parse("NTI", "Test Artist");
  expect(result3?.command).toBe("metadata");
  expect((result3?.argument as any)?.artist).toBe("Test Artist");

  parser.patchMetadata({ album: "Test Album" });
  expect(parser.getMetadata().album).toBe("Test Album");
});

it("IscpCommandParser maps unknown commands to null and zone commands correctly", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ subSource: "spotify" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  expect(parser.parse("ZZZ", "1234")).toBe(null);

  const result = parser.parse("ZVL", "2A");
  expect(result).toBeTruthy();
  expect(result?.zone).toBe("zone2");
  expect(result?.command).toBe("volume");
  expect(result?.argument).toBe(42);
});

it("IscpCommandParser handles NLS validation and NLA extraction", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness();
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  expect(parser.parse("NLS", "U0-Menu Item")?.command).toBe("NLS");
  expect(parser.parse("NLS", "X0-Menu Item")).toBe(null);

  const badNla = parser.parse("NLA", "A0001S<xml></xml>");
  expect(badNla).toBe(null);
  const goodNla = parser.parse("NLA", "X0001S<xml></xml>");
  expect(goodNla?.command).toBe("NLA");
  expect(goodNla?.argument).toBe("<xml></xml>");
});

it("IscpCommandParser emits NLT_CONTEXT for My Presets on NET source", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ source: "net", subSource: "tunein" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const result = parser.parse("NLT", "01010000000101my presets");
  expect(result?.command).toBe("NLT_CONTEXT");
  expect(result?.argument).toBe("My Presets");
});

it("IscpCommandParser updates browse state from NLT headers per active subsource", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const deezerState = { harvestMode: false, nlsCursorOffset: 0, totalListItemCount: 0, nlsLayerNumber: 0 };
  const h1 = makeParserHarness({ subSource: "deezer", deezerState });
  const parser1 = new IscpCommandParser(h1.getEntityId, h1.stateReader, h1.deezerStoreApi, h1.tidalStoreApi, h1.tuneInStoreApi);
  parser1.parse("NLT", "0101000A001402browse");
  expect(deezerState.nlsCursorOffset).toBe(10);
  expect(deezerState.totalListItemCount).toBe(20);
  expect(deezerState.nlsLayerNumber).toBe(2);

  const tidalState = { harvestMode: true, nlsCursorOffset: 9, totalListItemCount: 0, nlsLayerNumber: 0 };
  const h2 = makeParserHarness({ subSource: "tidal", tidalState });
  const parser2 = new IscpCommandParser(h2.getEntityId, h2.stateReader, h2.deezerStoreApi, h2.tidalStoreApi, h2.tuneInStoreApi);
  parser2.parse("NLT", "0101000A001403browse");
  expect(tidalState.nlsCursorOffset).toBe(9);
  expect(tidalState.totalListItemCount).toBe(20);
  expect(tidalState.nlsLayerNumber).toBe(3);

  const tuneInMenuState = { harvestMode: false, nlsCursorOffset: 0, totalListItemCount: 0, nlsLayerNumber: 0 };
  const h3 = makeParserHarness({ subSource: "tunein", tuneInMenuState });
  const parser3 = new IscpCommandParser(h3.getEntityId, h3.stateReader, h3.deezerStoreApi, h3.tidalStoreApi, h3.tuneInStoreApi);
  parser3.parse("NLT", "0101000A001404browse");
  expect(tuneInMenuState.nlsCursorOffset).toBe(10);
  expect(tuneInMenuState.totalListItemCount).toBe(20);
  expect(tuneInMenuState.nlsLayerNumber).toBe(4);
});

it("IscpCommandParser FLD routing suppresses NET scrolling and handles FM/default", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const netDifferent = makeParserHarness({ source: "net", subSource: "tidal" });
  const parserNetDifferent = new IscpCommandParser(netDifferent.getEntityId, netDifferent.stateReader, netDifferent.deezerStoreApi, netDifferent.tidalStoreApi, netDifferent.tuneInStoreApi);
  const detected = parserNetDifferent.parse("FLD", toHex("Spotify / Track"));
  expect(detected?.command).toBe("FLD");
  expect(detected?.argument).toBe("Spotify");

  const netSame = makeParserHarness({ source: "net", subSource: "spotify" });
  const parserNetSame = new IscpCommandParser(netSame.getEntityId, netSame.stateReader, netSame.deezerStoreApi, netSame.tidalStoreApi, netSame.tuneInStoreApi);
  expect(parserNetSame.parse("FLD", toHex("Spotify / Track"))).toBe(null);
  expect(parserNetSame.parse("FLD", toHex("Random Scrolling Text"))).toBe(null);

  const fm = makeParserHarness({ source: "fm", subSource: "fm" });
  const parserFm = new IscpCommandParser(fm.getEntityId, fm.stateReader, fm.deezerStoreApi, fm.tidalStoreApi, fm.tuneInStoreApi);
  const fmResult = parserFm.parse("FLD", toHex("StationAB"));
  expect(fmResult?.command).toBe("FLD");
  expect(fmResult?.argument).toBe("Station");

  const other = makeParserHarness({ source: "cd", subSource: "cd" });
  const parserOther = new IscpCommandParser(other.getEntityId, other.stateReader, other.deezerStoreApi, other.tidalStoreApi, other.tuneInStoreApi);
  const otherResult = parserOther.parse("FLD", toHex("Display1234"));
  expect(otherResult?.command).toBe("FLD");
  expect(otherResult?.argument).toBe("Display");
});

it("IscpCommandParser maps TuneIn NAT title to canonical service name", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ subSource: "tunein" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const result = parser.parse("NAT", "ignored-title");
  expect(result?.command).toBe("metadata");
  expect((result?.argument as any)?.title).toBe("TuneIn");
});

it("IscpCommandParser parses IFA payload into normalized audio fields", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ source: "net", subSource: "spotify" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const result = parser.parse("IFA", " HDMI1 ,PCM,48kHz,2ch,PCM,2ch");
  expect(result?.command).toBe("IFA");
  const audio = result?.argument as Record<string, string>;
  expect(audio.inputSource).toBe("HDMI1");
  expect(audio.inputFormat).toBe("PCM");
  expect(audio.audioInputValue).toBe("PCM | 48kHz 2ch");
  expect(audio.audioOutputValue).toBe("PCM | 2ch");

  const noFormat = parser.parse("IFA", "NET,,, ,PCM,2ch");
  const noFormatAudio = noFormat?.argument as Record<string, string>;
  expect(noFormatAudio.audioInputValue).toBe("NET");
});

it("IscpCommandParser parses IFV payload and handles unknown resolution display", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ source: "net", subSource: "spotify" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const unknownRes = parser.parse("IFV", "IN,Unknown,YCbCr,10bit,TV,Unknown,RGB,8bit,,HDR10");
  expect(unknownRes?.command).toBe("IFV");
  const unknownVideo = unknownRes?.argument as Record<string, string>;
  expect(unknownVideo.videoInputValue).toBe("---");
  expect(unknownVideo.videoOutputValue).toBe("---");

  const knownRes = parser.parse("IFV", "IN,1080p,YCbCr,10bit,TV,2160p,RGB,8bit,,HDR10");
  const knownVideo = knownRes?.argument as Record<string, string>;
  expect(knownVideo.videoInputValue).toBe("1080p | YCbCr 10bit | HDR10");
  expect(knownVideo.videoOutputValue).toBe("2160p | RGB 8bit | HDR10");
});

it("IscpCommandParser merges multi-frame metadata payloads", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ source: "net", subSource: "spotify" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const value = "Track TitleISCP!1NTIArtist NameISCP!1NALAlbum Name";
  const result = parser.parse("NAT", value);
  expect(result?.command).toBe("metadata");
  const md = result?.argument as Record<string, string>;
  expect(md.title).toBe("Track Title");
  expect(md.artist).toBe("Artist Name");
  expect(md.album).toBe("Album Name");
});

it("IscpCommandParser emits NLT when service text indicates subsource switch", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ source: "net", subSource: "tidal" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const result = parser.parse("NLT", "01010000000101Spotify / Track");
  expect(result?.command).toBe("NLT");
  expect(result?.argument).toBe("Spotify");
});

it("IscpCommandParser decodes generic hex payloads for mapped commands without int range", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ source: "net", subSource: "spotify" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const single = parser.parse("SLI", "414243");
  expect(single?.command).toBe("input-selector");
  expect(single?.argument).toBe("ABC");

  const multi = parser.parse("SLI", "4142,4344");
  expect(multi?.command).toBe("input-selector");
  expect(multi?.argument).toEqual(["AB", "CD"]);
});

it("IscpCommandParser FLD sanitizes characters and skips service text outside NET", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const fm = makeParserHarness({ source: "fm", subSource: "fm" });
  const parserFm = new IscpCommandParser(fm.getEntityId, fm.stateReader, fm.deezerStoreApi, fm.tidalStoreApi, fm.tuneInStoreApi);
  const fmResult = parserFm.parse("FLD", toHex("Sta*tion[]AB"));
  expect(fmResult?.command).toBe("FLD");
  expect(fmResult?.argument).toBe("Station");

  const other = makeParserHarness({ source: "cd", subSource: "cd" });
  const parserOther = new IscpCommandParser(other.getEntityId, other.stateReader, other.deezerStoreApi, other.tidalStoreApi, other.tuneInStoreApi);
  expect(parserOther.parse("FLD", toHex("Spotify"))).toBe(null);
});

it("IscpCommandParser decodes VOC responses as numeric vocal levels", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness();
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const level2 = parser.parse("VOC", "02");
  expect(level2?.command).toBe("vocal");
  expect(level2?.argument).toBe(2);

  const level0 = parser.parse("VOC", "00");
  expect(level0?.command).toBe("vocal");
  expect(level0?.argument).toBe(0);
});

it("IscpCommandParser maps DSS query responses (100/200/300/400) to dirac slot keys", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness();
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const off = parser.parse("DSS", "100");
  expect(off?.command).toBe("dirac");
  expect(off?.argument).toBe("off");

  const slot1 = parser.parse("DSS", "200");
  expect(slot1?.argument).toBe("slot1");

  const slot2 = parser.parse("DSS", "300");
  expect(slot2?.argument).toBe("slot2");

  const slot3 = parser.parse("DSS", "400");
  expect(slot3?.argument).toBe("slot3");

  const query = parser.parse("DSS", "QSTN");
  expect(query?.argument).toBe("query");
});

it("IscpCommandParser decodes TFR tone-front responses into bass and treble", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness();
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const flat = parser.parse("TFR", "B00T00");
  expect(flat?.command).toBe("tone-front");
  expect(flat?.argument).toEqual({ bass: "0", treble: "0" });

  const bassUp = parser.parse("TFR", "B+AT-4");
  expect(bassUp?.argument).toEqual({ bass: "10", treble: "-4" });

  const bassDown = parser.parse("TFR", "B-6T+2");
  expect(bassDown?.argument).toEqual({ bass: "-6", treble: "2" });

  const malformed = parser.parse("TFR", "BUP");
  expect(malformed).toBe(null);
});

it("IscpCommandParser decodes CTL center-temporary-level responses in 0.5 dB steps", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness();
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const plus14 = parser.parse("CTL", "+0E");
  expect(plus14?.command).toBe("center-temporary-level");
  expect(plus14?.argument).toBe(7);

  const minus = parser.parse("CTL", "-0C");
  expect(minus?.command).toBe("center-temporary-level");
  expect(minus?.argument).toBe(-6);

  const half = parser.parse("CTL", "-01");
  expect(half?.command).toBe("center-temporary-level");
  expect(half?.argument).toBe(-0.5);

  const zero = parser.parse("CTL", "00");
  expect(zero?.command).toBe("center-temporary-level");
  expect(zero?.argument).toBe(0);
});

it("IscpCommandParser decodes SWL subwoofer-temporary-level responses in 0.5 dB steps", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness();
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const minusHalf = parser.parse("SWL", "-01");
  expect(minusHalf?.command).toBe("subwoofer-temporary-level");
  expect(minusHalf?.argument).toBe(-0.5);

  const plus = parser.parse("SWL", "+0C");
  expect(plus?.command).toBe("subwoofer-temporary-level");
  expect(plus?.argument).toBe(6);

  const minusF = parser.parse("SWL", "-0F");
  expect(minusF?.argument).toBe(-7.5);

  const zero = parser.parse("SWL", "00");
  expect(zero?.argument).toBe(0);
});

describe("IscpCommandParser NJA handling", () => {
  async function makeParser() {
    const parserModule = await import("../src/eiscp-command-parser.js");
    const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };
    const h = makeParserHarness();
    return new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);
  }

  it("drops jacket art pushes in both documented forms instead of reporting them as unknown", async () => {
    const parser = await makeParser();

    // The URL form, as pushed by a TX-RZ50 while playing.
    expect(parser.parse("NJA", "2-http://fe80::209:b0ff:fe60:5e06/album_art.cgi")).toBe(null);
    // The inline forms: image type 0 = BMP, 1 = JPEG, followed by a packet flag.
    expect(parser.parse("NJA", "00ffd8ffe000104a464946")).toBe(null);
    expect(parser.parse("NJA", "11ffd8ffe000104a464946")).toBe(null);
    // "No Image" form.
    expect(parser.parse("NJA", "n-")).toBe(null);
  });

  it("logs the pushed jacket art URL at debug level only", async () => {
    const loggers = await import("../src/loggers.js");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const parser = await makeParser();
      for (const level of ["warn", "info", "error"] as const) {
        loggers.setLogLevel(level);
        spy.mockClear();
        parser.parse("NJA", "2-http://192.168.2.103/album_art.cgi");
        expect(
          spy.mock.calls.some((call) => String(call[1]).includes("jacket art")),
          `no jacket art log expected at ${level}`
        ).toBe(false);
      }

      loggers.setLogLevel("debug");
      spy.mockClear();
      parser.parse("NJA", "2-http://192.168.2.103/album_art.cgi");
      const logged = spy.mock.calls.find((call) => String(call[1]).includes("jacket art by URL"));
      expect(String(logged?.[1])).toContain("http://192.168.2.103/album_art.cgi");
    } finally {
      loggers.setLogLevel("warn");
      spy.mockRestore();
    }
  });
});

describe("IscpCommandParser NRI handling", () => {
  const entityId = "TX-RZ50 1.2.3.4 main";

  async function makeNriParser() {
    const parserModule = await import("../src/eiscp-command-parser.js");
    const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };
    const store = await import("../src/avrInfoStore.js");
    const h = makeParserHarness();
    h.getEntityId = () => entityId;
    const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);
    return { parser, store };
  }

  it("stores the preset list from an NRI reply and reports it as handled", async () => {
    const { parser, store } = await makeNriParser();
    store.resetAvrInfo(entityId);

    const result = parser.parse("NRI", realResponseXml);

    // The command name must be used, not the raw NRI opcode: the command receiver dispatches on
    // the name, and logging the opcode made every reply show up as an unknown command type.
    expect(result?.command).toBe("avr-info");
    expect(result?.argument).toBe("40");

    const dabPresets = store.listDabPresets(entityId);
    expect(dabPresets).toHaveLength(25);
    expect(dabPresets[0]).toMatchObject({ slot: 1, name: "R10 80s" });

    store.resetAvrInfo(entityId);
  });

  it("dumps the full NRI payload only at debug log level", async () => {
    const loggers = await import("../src/loggers.js");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      for (const level of ["warn", "info", "error"] as const) {
        loggers.setLogLevel(level);
        spy.mockClear();
        const { parser, store } = await makeNriParser();
        store.resetAvrInfo(entityId);
        parser.parse("NRI", realResponseXml);
        const dumped = spy.mock.calls.some((call) => String(call[1]).includes("Complete NRI payload"));
        expect(dumped, `payload should not be dumped at log level ${level}`).toBe(false);
      }

      loggers.setLogLevel("debug");
      spy.mockClear();
      const { parser, store } = await makeNriParser();
      store.resetAvrInfo(entityId);
      parser.parse("NRI", realResponseXml);
      const dumped = spy.mock.calls.some((call) => String(call[1]).includes("Complete NRI payload"));
      expect(dumped, "payload should be dumped at log level debug").toBe(true);

      // The dump must be the whole document, formatted but otherwise lossless. util.format has
      // already collapsed the arguments into a single string by the time console.log is called.
      const dumpedLine = String(spy.mock.calls.find((call) => String(call[1]).includes("Complete NRI payload"))?.[1]);
      const dumpedXml = dumpedLine.split("chars):\n")[1];
      expect(dumpedXml.replace(/\n/g, "")).toBe(realResponseXml.replace(/\x1a+$/, ""));

      store.resetAvrInfo(entityId);
    } finally {
      loggers.setLogLevel("warn");
      spy.mockRestore();
    }
  });

  it("ignores NRI replies that carry no XML", async () => {
    const { parser, store } = await makeNriParser();
    store.resetAvrInfo(entityId);

    expect(parser.parse("NRI", "")).toBe(null);
    expect(parser.parse("NRI", "X----")).toBe(null);
    expect(store.getAvrInfo(entityId)).toBeNull();
  });

  it("does not overwrite a good snapshot with an unparsable payload", async () => {
    const { parser, store } = await makeNriParser();
    store.resetAvrInfo(entityId);

    parser.parse("NRI", realResponseXml);
    const before = store.getAvrInfo(entityId);

    expect(parser.parse("NRI", '<?xml version="1.0"?><response status="ok"><popup/></response>')).toBe(null);
    expect(store.getAvrInfo(entityId)).toBe(before);

    store.resetAvrInfo(entityId);
  });
});

it("IscpCommandParser reports the input name the AVR gave for an input it collected", async () => {
  const parserModule = await import("../src/eiscp-command-parser.js");
  const inputSourceStore = (await import("../src/inputSourceStore.js")) as any;
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  // The store is keyed by physical AVR id, so it is looked up via the zone entity id.
  inputSourceStore.setAvrInputs("TX-RZ50 1.2.3.4", [
    { id: "33", name: "DAB" },
    { id: "10", name: "BD/DVD" }
  ]);

  const parser = new IscpCommandParser(() => "TX-RZ50 1.2.3.4 main", makeParserHarness().stateReader, null, null, null);

  // SLI33 is "dab" in the hardcoded table, but the AVR calls it "DAB".
  expect(parser.parse("SLI", "33").argument).toBe("DAB");
  // An input that is not in the collected list falls back to the command table.
  expect(parser.parse("SLI", "12").argument).toBe("tv");
  expect(parser.parse("SLI", "01").argument).toEqual(["video2", "cbl", "sat"]);

  inputSourceStore.clearAllAvrInputs();
});
