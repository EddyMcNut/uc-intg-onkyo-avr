import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Generated command/mapping data, and integration wiring that is not yet split into testable parts.
      exclude: ["src/eiscp-commands.ts", "src/eiscp-mappings.ts", "src/driver.ts", "src/setupHandler.ts"],
      reporter: ["text-summary", "lcov"],
    },
  },
});
