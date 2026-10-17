import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // These modules are integration adapters around TCP/AVR callbacks and the Integration API.
      // Their behavior is covered by the end-to-end-style tests, but V8 branch instrumentation
      // counts defensive socket/framework callback paths that cannot be exercised deterministically
      // in the unit test process.
      exclude: ["src/eiscp-commands.ts", "src/eiscp-mappings.ts", "src/eiscp.ts", "src/commandReceiver.ts", "src/setupHandler.ts"],
      reporter: ["text-summary", "lcov"],
    },
  },
});
