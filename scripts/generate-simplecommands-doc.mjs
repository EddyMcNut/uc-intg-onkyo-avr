import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const driverFile = path.join(repoRoot, "driver.json");
const distSimpleCommands = path.join(repoRoot, "dist", "simpleCommands.js");
const outFile = path.join(repoRoot, "docs", "generated-simplecommands.md");

if (!existsSync(driverFile)) {
  console.error(`Missing ${path.relative(repoRoot, driverFile)}`);
  process.exit(1);
}

if (!existsSync(distSimpleCommands)) {
  console.error(`${path.relative(repoRoot, distSimpleCommands)} not found. Run 'npm run build' first.`);
  process.exit(1);
}

const driverJson = JSON.parse(await readFile(driverFile, "utf8"));
const version = driverJson.version;

const { ALL_SIMPLE_COMMANDS } = await import(pathToFileURL(distSimpleCommands));
const simpleCommands = [...ALL_SIMPLE_COMMANDS].sort();

const markdown = [
  "# Generated Simple Commands",
  "",
  "This integration creates a list of simple commands which are available for you in Web Configurator.",
  "",
  `These are the available \`simple commands\` in \`v${version}\` (${simpleCommands.length} commands):`,
  "",
  ...simpleCommands.map((cmd) => `- \`${cmd}\``),
  ""
].join("\n");

await writeFile(outFile, markdown);
console.log(`Wrote ${simpleCommands.length} simple commands (v${version}) to ${path.relative(repoRoot, outFile)}`);
