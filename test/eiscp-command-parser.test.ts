import test from "ava";
import path from "path";
import { pathToFileURL } from "url";

async function importDist(modulePath: string): Promise<Record<string, unknown>> {
  return import(pathToFileURL(path.resolve(process.cwd(), modulePath)).href);
}

test.serial("IscpCommandParser handles truncated NLA frames without crashing", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const mockStateReader = { getSource: () => "net", getSubSource: () => "tidal" };
  const mockTidalStoreApi = { getBrowseState: () => null };
  const mockTuneInStoreApi = { getBrowseState: () => null };
  const getEntityId = () => "entity1";

  const parser = new IscpCommandParser(getEntityId, mockStateReader, mockTidalStoreApi, mockTuneInStoreApi);

  // Truncated NLA frames (< 6 chars) should return null (no-op) without error
  const result1 = parser.parse("NLA", "X");
  t.is(result1, null, "NLA < 6 chars should return null");

  const result2 = parser.parse("NLA", "X123");
  t.is(result2, null, "NLA with only 4 chars should return null");

  const result3 = parser.parse("NLA", "XYZAB");
  t.is(result3, null, "NLA with only 5 chars should return null");

  // Valid NLA (X****S<...XML>): must be 6+ chars, start with X, have S at position 5 (0-indexed), and contain XML
  // Example: "X001S<..." where positions are: 0=X, 1=0, 2=0, 3=1, 4=S, 5=<
  const validNla = 'X0001S<?xml version="1.0"?><response status="ok"><items offset="0000"><item title="Test" url="0"/></items></response>';
  const result4 = parser.parse("NLA", validNla);
  t.is(result4?.command, "NLA", "Valid NLA should parse as NLA command");
  t.true((result4?.argument as string)?.includes("<"), "Valid NLA should preserve XML content");
});

test.serial("IscpCommandParser handles malformed NTM time frames", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const mockStateReader = { getSource: () => "net", getSubSource: () => "spotify" };
  const mockTidalStoreApi = { getBrowseState: () => null };
  const mockTuneInStoreApi = { getBrowseState: () => null };
  const getEntityId = () => "entity1";

  const parser = new IscpCommandParser(getEntityId, mockStateReader, mockTidalStoreApi, mockTuneInStoreApi);

  // Malformed times (non-numeric parts) should produce zero values instead of NaN
  const result1 = parser.parse("NTM", "abc:def:ghi/xyz:pqr:stu");
  t.is(result1?.command, "NTM", "Malformed NTM should parse as NTM command");
  const parts = (result1?.argument as string)?.split("/");
  t.is(parts?.[0], "0", "Non-numeric time should convert to 0");
  t.is(parts?.[1], "0", "Non-numeric duration should convert to 0");

  // Mixed valid/invalid should also zero entire part
  const result2 = parser.parse("NTM", "10:abc:30/01:02:03");
  t.is(result2?.command, "NTM");
  const parts2 = (result2?.argument as string)?.split("/");
  t.is(parts2?.[0], "0", "Time part with non-numeric should zero entire part");
  t.is(parts2?.[1], "3723", "Valid duration (01:02:03 = 3600+120+3 = 3723) should parse");
});

test.serial("IscpCommandParser handles hex-encoded metadata commands", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const mockStateReader = { getSource: () => "net", getSubSource: () => "tidal" };
  const mockTidalStoreApi = { getBrowseState: () => null };
  const mockTuneInStoreApi = { getBrowseState: () => null };
  const getEntityId = () => "entity1";

  const parser = new IscpCommandParser(getEntityId, mockStateReader, mockTidalStoreApi, mockTuneInStoreApi);

  // Hex-encoded metadata via NTI (Title Information) - note: raw hex value is stored, not decoded
  // The driver/higher-level code is responsible for decoding hex if needed
  const result1 = parser.parse("NTI", "4F6E6B796F");
  t.truthy(result1, "NTI with hex should parse");
  t.is(result1?.command, "metadata", "NTI routes to metadata handler");
  const metadata = result1?.argument as any;
  t.truthy(metadata, "Metadata object should exist");
  t.is(metadata?.artist, "4F6E6B796F", "NTI stores hex value in artist field (not decoded by parser)");

  // Another test: verify NAT creates title field and NTI creates artist field independently
  const result2 = parser.parse("NAT", "Test Title");
  t.is(result2?.command, "metadata");
  t.is((result2?.argument as any)?.title, "Test Title");

  const result3 = parser.parse("NTI", "Test Artist");
  t.is(result3?.command, "metadata");
  t.is((result3?.argument as any)?.artist, "Test Artist");
});

test.serial("IscpCommandParser handles edge case times", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const mockStateReader = { getSource: () => "net", getSubSource: () => "spotify" };
  const mockTidalStoreApi = { getBrowseState: () => null };
  const mockTuneInStoreApi = { getBrowseState: () => null };
  const getEntityId = () => "entity1";

  const parser = new IscpCommandParser(getEntityId, mockStateReader, mockTidalStoreApi, mockTuneInStoreApi);

  // Whitespace-only time parts should produce 0/0
  const result1 = parser.parse("NTM", "0:0:0/0:0:0");
  t.is(result1?.command, "NTM");
  t.is(result1?.argument as string, "0/0");

  // Valid time should parse correctly
  const result2 = parser.parse("NTM", "01:23:45/02:34:56");
  t.is(result2?.command, "NTM");
  const [pos, dur] = (result2?.argument as string)?.split("/");
  t.is(pos, String(1 * 3600 + 23 * 60 + 45), "Valid position should convert to seconds (5025)");
  t.is(dur, String(2 * 3600 + 34 * 60 + 56), "Valid duration should convert to seconds (9296)");
});

test.serial("IscpCommandParser returns null for unknown commands", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const mockStateReader = { getSource: () => "net", getSubSource: () => "tidal" };
  const mockTidalStoreApi = { getBrowseState: () => null };
  const mockTuneInStoreApi = { getBrowseState: () => null };
  const getEntityId = () => "entity1";

  const parser = new IscpCommandParser(getEntityId, mockStateReader, mockTidalStoreApi, mockTuneInStoreApi);

  const result = parser.parse("ZZZ", "1234");
  t.is(result, null);
});

test.serial("IscpCommandParser remaps zone-specific volume commands", async (t) => {
  const parserModule = await importDist("dist/src/eiscp-command-parser.js");
  const { IscpCommandParser } = parserModule as { IscpCommandParser: new (...deps: any) => any };

  const mockStateReader = { getSource: () => "net", getSubSource: () => "spotify" };
  const mockTidalStoreApi = { getBrowseState: () => null };
  const mockTuneInStoreApi = { getBrowseState: () => null };
  const getEntityId = () => "entity1";

  const parser = new IscpCommandParser(getEntityId, mockStateReader, mockTidalStoreApi, mockTuneInStoreApi);

  const result = parser.parse("ZVL", "2A");
  t.truthy(result);
  t.is(result?.zone, "zone2");
  t.is(result?.command, "volume");
  t.is(result?.argument, 42);
});
