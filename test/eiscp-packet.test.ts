import { describe, it, expect } from "vitest";
import path from "path";

it("extracts concatenated ISCP frames individually", async () => {
  const packetModule = await import("../src/eiscp-packet.js");
  const { createEiscpPacket, extractAllIscpMessages } = packetModule;

  const packet = Buffer.concat([createEiscpPacket("NLSC0P"), createEiscpPacket("NLSU0-89.7 | WTMD (Alternative Rock)"), createEiscpPacket("NLSU1-America's Country (Country)")]);

  const messages = extractAllIscpMessages(packet);

  expect(messages).toEqual(["NLSC0P", "NLSU0-89.7 | WTMD (Alternative Rock)", "NLSU1-America's Country (Country)"]);
});

it("createEiscpPacket adds !1 prefix and valid ISCP header", async () => {
  const packetModule = await import("../src/eiscp-packet.js");
  const { createEiscpPacket, extractIscpMessage } = packetModule;

  const packet = createEiscpPacket("PWRQSTN");

  expect(packet.toString("ascii", 0, 4)).toBe("ISCP");
  expect(packet.readUInt32BE(4)).toBe(16);
  // extractIscpMessage strips the "!1" prefix and returns the logical command body.
  expect(extractIscpMessage(packet)).toBe("PWRQSTN");
});

it("extractAllIscpMessages falls back to single-frame extraction for malformed input", async () => {
  const packetModule = await import("../src/eiscp-packet.js");
  const { createEiscpPacket, extractAllIscpMessages } = packetModule;

  const validPacket = createEiscpPacket("NATSong");
  const corrupted = Buffer.from(validPacket);
  // Corrupt header size so multi-frame extractor rejects frame and uses fallback path.
  corrupted.writeUInt32BE(1, 4);

  const messages = extractAllIscpMessages(corrupted);
  expect(messages.length).toBe(1);
  expect(typeof messages[0] === "string").toBe(true);
});
