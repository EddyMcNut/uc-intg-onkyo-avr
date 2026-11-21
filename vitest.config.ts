import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Generated command/mapping data only; all hand-written code is measured.
      exclude: ["src/eiscp-commands.ts", "src/eiscp-mappings.ts"],
      reporter: ["text-summary", "lcov"],
    },
  },
});
