import { describe, it, expect } from "vitest";

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
