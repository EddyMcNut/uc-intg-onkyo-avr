import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // These files are generated command/mapping data or integration-wiring/network transport
      // rather than practical unit-test targets.
      exclude: ["src/eiscp-commands.ts", "src/eiscp-mappings.ts", "src/driver.ts", "src/eiscp.ts", "src/setupHandler.ts"],
      reporter: ["text-summary", "lcov"],
    },
  },
});
