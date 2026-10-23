import { describe, it, expect } from "vitest";

describe("simpleCommands", () => {
  it("exports ALL_SIMPLE_COMMANDS as an array", async () => {
    const mod = await import("../src/simpleCommands.js");
    expect(Array.isArray(mod.ALL_SIMPLE_COMMANDS)).toBe(true);
    expect(mod.ALL_SIMPLE_COMMANDS.length).toBeGreaterThan(0);
    expect(mod.SIMPLE_COMMANDS_MAP).toBeDefined();
    expect(typeof mod.ALL_INPUT_SELECTOR_NAMES).toBe("object");
  });

  it("replaces spaces with underscores in generated command IDs", async () => {
    const { SIMPLE_COMMANDS_MAP, ALL_SIMPLE_COMMANDS } = await import("../src/simpleCommands.js");

    const spacedId = "LISTENING_MODE_DOLBY_PLIIX_GAME";
    expect(spacedId in SIMPLE_COMMANDS_MAP).toBe(true);
    expect(SIMPLE_COMMANDS_MAP[spacedId]).toBe("listening-mode Dolby-PLIIx-Game");

    for (const cmd of ALL_SIMPLE_COMMANDS) {
      expect(cmd).not.toMatch(/[\s-]/);
    }
  });

  it("adds and replaces learned listening-mode commands", async () => {
    const { addListeningModeSimpleCommands, SIMPLE_COMMANDS_MAP } = await import("../src/simpleCommands.js");
    const { getKnownListeningModes } = await import("../src/listeningModePreferences.js");
    const knownCode = getKnownListeningModes().find((mode) => mode.aliases.includes("direct"))!.code;

    addListeningModeSimpleCommands({
      [knownCode]: { name: "Direct learned", setting: "learned" },
      "00": { name: "Custom Stereo", setting: "learned" },
      "03": { name: "Disabled", setting: "disable" },
      "02": { name: "Excluded", setting: "exclude" },
      "04": { name: "  ", setting: "learn" }
    });

    expect(SIMPLE_COMMANDS_MAP.LISTENING_MODE_CUSTOM_STEREO).toBe("listening-mode Custom Stereo");
    expect(SIMPLE_COMMANDS_MAP.LISTENING_MODE_DIRECT_LEARNED).toBe("listening-mode Direct learned");
    addListeningModeSimpleCommands({ "00": { name: "Custom Stereo", setting: "learn" } });
    expect(SIMPLE_COMMANDS_MAP.LISTENING_MODE_CUSTOM_STEREO).toBe("listening-mode Custom Stereo");
  });
});
