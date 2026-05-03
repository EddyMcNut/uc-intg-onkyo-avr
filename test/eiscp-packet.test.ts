import test from "ava";
import { pathToFileURL } from "url";
import path from "path";

test("EiscpDriver extracts concatenated ISCP frames individually", async (t) => {
  const eiscpModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/eiscp.js")).href);

  const EiscpDriver = eiscpModule.EiscpDriver as any;
  const driver = new EiscpDriver({ host: "1.2.3.4", model: "M" });

  const packet = Buffer.concat([driver.eiscp_packet("NLSC0P"), driver.eiscp_packet("NLSU0-89.7 | WTMD (Alternative Rock)"), driver.eiscp_packet("NLSU1-America's Country (Country)")]);

  const messages = driver.eiscp_packet_extract_all(packet);

  t.deepEqual(messages, ["NLSC0P", "NLSU0-89.7 | WTMD (Alternative Rock)", "NLSU1-America's Country (Country)"]);
});
