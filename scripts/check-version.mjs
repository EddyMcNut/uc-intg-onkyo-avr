import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageFile = path.join(repoRoot, "package.json");
const driverFile = path.join(repoRoot, "driver.json");

const packageJson = JSON.parse(await readFile(packageFile, "utf8"));
const driverJson = JSON.parse(await readFile(driverFile, "utf8"));

if (packageJson.version !== driverJson.version) {
  console.error(`Version mismatch: package.json is ${packageJson.version}, driver.json is ${driverJson.version}`);
  process.exit(1);
}

console.log(`Version check passed: ${packageJson.version}`);
