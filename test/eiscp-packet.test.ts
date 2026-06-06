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
