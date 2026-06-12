// Uses c8 internal report API intentionally due Node 26 CLI/yargs incompatibility in this workspace.
// Keep c8 pinned in package.json and update this script together with c8 upgrades.
const { outputReport } = require("c8/lib/commands/report");

async function main() {
  await outputReport({
    include: ["dist/src/**/*.js"],
    exclude: ["dist/test/**/*.js"],
    extension: [".js"],
    reporter: ["text-summary", "lcov"],
    tempDirectory: ".coverage",
    "reports-dir": "coverage",
    all: true,
    resolve: false,
    allowExternal: false,
    excludeNodeModules: true,
    mergeAsync: false,
    skipFull: false
  });
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});