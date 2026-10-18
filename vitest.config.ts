import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // These files are generated command/mapping data rather than executable logic.
      exclude: ["src/eiscp-commands.ts", "src/eiscp-mappings.ts"],
      reporter: ["text-summary", "lcov"],
    },
  },
});
