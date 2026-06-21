import test from "ava";
import path from "path";
import { pathToFileURL } from "url";

async function importDist(modulePath: string): Promise<Record<string, unknown>> {
  return import(pathToFileURL(path.resolve(process.cwd(), modulePath)).href);
}

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

test.serial("IscpCommandParser handles truncated and valid NLA frames", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness();
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const result1 = parser.parse("NLA", "X");
  t.is(result1, null);

  const result2 = parser.parse("NLA", "X123");
  t.is(result2, null);

  const result3 = parser.parse("NLA", "XYZAB");
  t.is(result3, null);

  const validNla = 'X0001S<?xml version="1.0"?><response status="ok"><items offset="0000"><item title="Test" url="0"/></items></response>';
  const result4 = parser.parse("NLA", validNla);
  t.is(result4?.command, "NLA");
  t.true((result4?.argument as string)?.includes("<response"));
});

test.serial("IscpCommandParser parses malformed and valid NTM payloads", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ subSource: "spotify" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const result1 = parser.parse("NTM", "abc:def:ghi/xyz:pqr:stu");
  t.is(result1?.command, "NTM");
  const parts = (result1?.argument as string)?.split("/");
  t.is(parts?.[0], "0");
  t.is(parts?.[1], "0");

  const result2 = parser.parse("NTM", "10:abc:30/01:02:03");
  t.is(result2?.command, "NTM");
  const parts2 = (result2?.argument as string)?.split("/");
  t.is(parts2?.[0], "0");
  t.is(parts2?.[1], "3723");

  const result3 = parser.parse("NTM", "01:23:45/02:34:56");
  t.is(result3?.argument as string, "5025/9296");
});

test.serial("IscpCommandParser metadata flows keep raw values and support patch/get", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness();
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const result1 = parser.parse("NTI", "4F6E6B796F");
  t.truthy(result1);
  t.is(result1?.command, "metadata");
  const metadata = result1?.argument as any;
  t.truthy(metadata);
  t.is(metadata?.artist, "4F6E6B796F");

  const result2 = parser.parse("NAT", "Test Title");
  t.is(result2?.command, "metadata");
  t.is((result2?.argument as any)?.title, "Test Title");

  const result3 = parser.parse("NTI", "Test Artist");
  t.is(result3?.command, "metadata");
  t.is((result3?.argument as any)?.artist, "Test Artist");

  parser.patchMetadata({ album: "Test Album" });
  t.is(parser.getMetadata().album, "Test Album");
});

test.serial("IscpCommandParser maps unknown commands to null and zone commands correctly", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ subSource: "spotify" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  t.is(parser.parse("ZZZ", "1234"), null);

  const result = parser.parse("ZVL", "2A");
  t.truthy(result);
  t.is(result?.zone, "zone2");
  t.is(result?.command, "volume");
  t.is(result?.argument, 42);
});

test.serial("IscpCommandParser handles NLS validation and NLA extraction", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness();
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  t.is(parser.parse("NLS", "U0-Menu Item")?.command, "NLS");
  t.is(parser.parse("NLS", "X0-Menu Item"), null);

  const badNla = parser.parse("NLA", "A0001S<xml></xml>");
  t.is(badNla, null);
  const goodNla = parser.parse("NLA", "X0001S<xml></xml>");
  t.is(goodNla?.command, "NLA");
  t.is(goodNla?.argument, "<xml></xml>");
});

test.serial("IscpCommandParser emits NLT_CONTEXT for My Presets on NET source", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ source: "net", subSource: "tunein" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const result = parser.parse("NLT", "01010000000101my presets");
  t.is(result?.command, "NLT_CONTEXT");
  t.is(result?.argument, "My Presets");
});

test.serial("IscpCommandParser updates browse state from NLT headers per active subsource", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const deezerState = { harvestMode: false, nlsCursorOffset: 0, totalListItemCount: 0, nlsLayerNumber: 0 };
  const h1 = makeParserHarness({ subSource: "deezer", deezerState });
  const parser1 = new IscpCommandParser(h1.getEntityId, h1.stateReader, h1.deezerStoreApi, h1.tidalStoreApi, h1.tuneInStoreApi);
  parser1.parse("NLT", "0101000A001402browse");
  t.is(deezerState.nlsCursorOffset, 10);
  t.is(deezerState.totalListItemCount, 20);
  t.is(deezerState.nlsLayerNumber, 2);

  const tidalState = { harvestMode: true, nlsCursorOffset: 9, totalListItemCount: 0, nlsLayerNumber: 0 };
  const h2 = makeParserHarness({ subSource: "tidal", tidalState });
  const parser2 = new IscpCommandParser(h2.getEntityId, h2.stateReader, h2.deezerStoreApi, h2.tidalStoreApi, h2.tuneInStoreApi);
  parser2.parse("NLT", "0101000A001403browse");
  t.is(tidalState.nlsCursorOffset, 9);
  t.is(tidalState.totalListItemCount, 20);
  t.is(tidalState.nlsLayerNumber, 3);

  const tuneInMenuState = { harvestMode: false, nlsCursorOffset: 0, totalListItemCount: 0, nlsLayerNumber: 0 };
  const h3 = makeParserHarness({ subSource: "tunein", tuneInMenuState });
  const parser3 = new IscpCommandParser(h3.getEntityId, h3.stateReader, h3.deezerStoreApi, h3.tidalStoreApi, h3.tuneInStoreApi);
  parser3.parse("NLT", "0101000A001404browse");
  t.is(tuneInMenuState.nlsCursorOffset, 10);
  t.is(tuneInMenuState.totalListItemCount, 20);
  t.is(tuneInMenuState.nlsLayerNumber, 4);
});

test.serial("IscpCommandParser FLD routing suppresses NET scrolling and handles FM/default", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const netDifferent = makeParserHarness({ source: "net", subSource: "tidal" });
  const parserNetDifferent = new IscpCommandParser(netDifferent.getEntityId, netDifferent.stateReader, netDifferent.deezerStoreApi, netDifferent.tidalStoreApi, netDifferent.tuneInStoreApi);
  const detected = parserNetDifferent.parse("FLD", toHex("Spotify / Track"));
  t.is(detected?.command, "FLD");
  t.is(detected?.argument, "Spotify");

  const netSame = makeParserHarness({ source: "net", subSource: "spotify" });
  const parserNetSame = new IscpCommandParser(netSame.getEntityId, netSame.stateReader, netSame.deezerStoreApi, netSame.tidalStoreApi, netSame.tuneInStoreApi);
  t.is(parserNetSame.parse("FLD", toHex("Spotify / Track")), null);
  t.is(parserNetSame.parse("FLD", toHex("Random Scrolling Text")), null);

  const fm = makeParserHarness({ source: "fm", subSource: "fm" });
  const parserFm = new IscpCommandParser(fm.getEntityId, fm.stateReader, fm.deezerStoreApi, fm.tidalStoreApi, fm.tuneInStoreApi);
  const fmResult = parserFm.parse("FLD", toHex("StationAB"));
  t.is(fmResult?.command, "FLD");
  t.is(fmResult?.argument, "Station");

  const other = makeParserHarness({ source: "cd", subSource: "cd" });
  const parserOther = new IscpCommandParser(other.getEntityId, other.stateReader, other.deezerStoreApi, other.tidalStoreApi, other.tuneInStoreApi);
  const otherResult = parserOther.parse("FLD", toHex("Display1234"));
  t.is(otherResult?.command, "FLD");
  t.is(otherResult?.argument, "Display");
});

test.serial("IscpCommandParser maps TuneIn NAT title to canonical service name", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ subSource: "tunein" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const result = parser.parse("NAT", "ignored-title");
  t.is(result?.command, "metadata");
  t.is((result?.argument as any)?.title, "TuneIn");
});

test.serial("IscpCommandParser parses IFA payload into normalized audio fields", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ source: "net", subSource: "spotify" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const result = parser.parse("IFA", " HDMI1 ,PCM,48kHz,2ch,PCM,2ch");
  t.is(result?.command, "IFA");
  const audio = result?.argument as Record<string, string>;
  t.is(audio.inputSource, "HDMI1");
  t.is(audio.inputFormat, "PCM");
  t.is(audio.audioInputValue, "PCM | 48kHz 2ch");
  t.is(audio.audioOutputValue, "PCM | 2ch");

  const noFormat = parser.parse("IFA", "NET,,, ,PCM,2ch");
  const noFormatAudio = noFormat?.argument as Record<string, string>;
  t.is(noFormatAudio.audioInputValue, "NET");
});

test.serial("IscpCommandParser parses IFV payload and handles unknown resolution display", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ source: "net", subSource: "spotify" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const unknownRes = parser.parse("IFV", "IN,Unknown,YCbCr,10bit,TV,Unknown,RGB,8bit,,HDR10");
  t.is(unknownRes?.command, "IFV");
  const unknownVideo = unknownRes?.argument as Record<string, string>;
  t.is(unknownVideo.videoInputValue, "---");
  t.is(unknownVideo.videoOutputValue, "---");

  const knownRes = parser.parse("IFV", "IN,1080p,YCbCr,10bit,TV,2160p,RGB,8bit,,HDR10");
  const knownVideo = knownRes?.argument as Record<string, string>;
  t.is(knownVideo.videoInputValue, "1080p | YCbCr 10bit | HDR10");
  t.is(knownVideo.videoOutputValue, "2160p | RGB 8bit | HDR10");
});

test.serial("IscpCommandParser merges multi-frame metadata payloads", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ source: "net", subSource: "spotify" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const value = "Track TitleISCP!1NTIArtist NameISCP!1NALAlbum Name";
  const result = parser.parse("NAT", value);
  t.is(result?.command, "metadata");
  const md = result?.argument as Record<string, string>;
  t.is(md.title, "Track Title");
  t.is(md.artist, "Artist Name");
  t.is(md.album, "Album Name");
});

test.serial("IscpCommandParser emits NLT when service text indicates subsource switch", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ source: "net", subSource: "tidal" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const result = parser.parse("NLT", "01010000000101Spotify / Track");
  t.is(result?.command, "NLT");
  t.is(result?.argument, "Spotify");
});

test.serial("IscpCommandParser decodes generic hex payloads for mapped commands without int range", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const h = makeParserHarness({ source: "net", subSource: "spotify" });
  const parser = new IscpCommandParser(h.getEntityId, h.stateReader, h.deezerStoreApi, h.tidalStoreApi, h.tuneInStoreApi);

  const single = parser.parse("SLI", "414243");
  t.is(single?.command, "input-selector");
  t.is(single?.argument, "ABC");

  const multi = parser.parse("SLI", "4142,4344");
  t.is(multi?.command, "input-selector");
  t.deepEqual(multi?.argument, ["AB", "CD"]);
});

test.serial("IscpCommandParser FLD sanitizes characters and skips service text outside NET", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const fm = makeParserHarness({ source: "fm", subSource: "fm" });
  const parserFm = new IscpCommandParser(fm.getEntityId, fm.stateReader, fm.deezerStoreApi, fm.tidalStoreApi, fm.tuneInStoreApi);
  const fmResult = parserFm.parse("FLD", toHex("Sta*tion[]AB"));
  t.is(fmResult?.command, "FLD");
  t.is(fmResult?.argument, "Station");

  const other = makeParserHarness({ source: "cd", subSource: "cd" });
  const parserOther = new IscpCommandParser(other.getEntityId, other.stateReader, other.deezerStoreApi, other.tidalStoreApi, other.tuneInStoreApi);
  t.is(parserOther.parse("FLD", toHex("Spotify")), null);
});
