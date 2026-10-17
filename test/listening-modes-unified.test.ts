import { describe, expect, it } from "vitest";
import { normalizeListeningModes, resolveListeningModes } from "../src/listeningModePreferences.js";

describe("unified listening modes", () => {
  it("preserves learned names and filters disabled modes", () => {
    const modes = normalizeListeningModes({
      "00": { name: "Stereo", setting: "learn" },
      "0F": { name: "Mono", setting: "disable" },
      "0D": { name: "Theater-Dimensional", setting: "dolby-surround-front-stage-surround" }
    });
    expect(resolveListeningModes(modes, [{ code: "00", name: "Stereo" }])).toEqual(["dolby-surround-front-stage-surround", "Stereo"]);
  });
});
