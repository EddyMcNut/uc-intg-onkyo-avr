import { describe, it, expect } from "vitest";

describe("simpleCommands", () => {
  it("exports ALL_SIMPLE_COMMANDS as an array", async () => {
    const mod = await import("../src/simpleCommands.js");
    expect(Array.isArray(mod.ALL_SIMPLE_COMMANDS)).toBe(true);
    expect(mod.ALL_SIMPLE_COMMANDS.length).toBeGreaterThan(0);
    expect(mod.SIMPLE_COMMANDS_MAP).toBeDefined();
    expect(typeof mod.ALL_INPUT_SELECTOR_NAMES).toBe("object");
  });
});
