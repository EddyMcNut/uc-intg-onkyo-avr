import test from "ava";
import { pathToFileURL } from "url";
import path from "path";

test("extracts concatenated ISCP frames individually", async (t) => {
  const packetModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/eiscp-packet.js")).href);
  const { createEiscpPacket, extractAllIscpMessages } = packetModule;

  const packet = Buffer.concat([createEiscpPacket("NLSC0P"), createEiscpPacket("NLSU0-89.7 | WTMD (Alternative Rock)"), createEiscpPacket("NLSU1-America's Country (Country)")]);

  const messages = extractAllIscpMessages(packet);

  t.deepEqual(messages, ["NLSC0P", "NLSU0-89.7 | WTMD (Alternative Rock)", "NLSU1-America's Country (Country)"]);
});

test("createEiscpPacket adds !1 prefix and valid ISCP header", async (t) => {
  const packetModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/eiscp-packet.js")).href);
  const { createEiscpPacket, extractIscpMessage } = packetModule;

  const packet = createEiscpPacket("PWRQSTN");

  t.is(packet.toString("ascii", 0, 4), "ISCP");
  t.is(packet.readUInt32BE(4), 16);
  // extractIscpMessage strips the "!1" prefix and returns the logical command body.
  t.is(extractIscpMessage(packet), "PWRQSTN");
});

test("extractAllIscpMessages falls back to single-frame extraction for malformed input", async (t) => {
  const packetModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/eiscp-packet.js")).href);
  const { createEiscpPacket, extractAllIscpMessages } = packetModule;

  const validPacket = createEiscpPacket("NATSong");
  const corrupted = Buffer.from(validPacket);
  // Corrupt header size so multi-frame extractor rejects frame and uses fallback path.
  corrupted.writeUInt32BE(1, 4);

  const messages = extractAllIscpMessages(corrupted);
  t.is(messages.length, 1);
  t.true(typeof messages[0] === "string");
});
