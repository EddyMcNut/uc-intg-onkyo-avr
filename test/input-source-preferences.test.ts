import { describe, expect, it } from "vitest";
import {
  DONT_INCLUDE_INPUT_SOURCE,
  DETECTED_INPUT_SOURCE,
  findConfiguredInputId,
  getAliasesForReportedInput,
  getInputSourceAliases,
  getKnownInputSources,
  normalizeInputSources,
  resolveConfiguredInputSources
} from "../src/inputSourcePreferences.js";
import { collectAvrInputSources } from "../src/inputSourceResolver.js";

describe("input source preferences", () => {
  it("groups known SLI aliases and resolves known and NRI service aliases", () => {
    expect(getKnownInputSources().length).toBeGreaterThan(0);
    expect(getInputSourceAliases("02")).toContain("game");
    expect(getAliasesForReportedInput("NSV12", "Deezer")).toEqual(["deezer"]);
    expect(getAliasesForReportedInput("02", "GAME")).toContain("game");
    expect(getAliasesForReportedInput("unknown", "Custom source")).toEqual([]);
  });

  it("normalizes settings and resolves learned, aliases, exclusions, and duplicates", () => {
    const settings = normalizeInputSources({
      "02": { name: "GAME", setting: DETECTED_INPUT_SOURCE },
      "03": { name: "AUX", setting: DONT_INCLUDE_INPUT_SOURCE },
      "04": { name: "AUX2", setting: "aux2" },
      bad: null,
      empty: { name: "", setting: "game" }
    });
    expect(resolveConfiguredInputSources(settings)).toEqual(["aux2", "GAME"]);
    expect(findConfiguredInputId(settings, "GAME")).toBe("02");
    expect(findConfiguredInputId(settings, "game")).toBe("02");
    expect(findConfiguredInputId(settings, "missing")).toBeUndefined();
  });

  it("keeps selector and colliding network-service IDs separate", () => {
    expect(
      collectAvrInputSources(
        [{ id: "12", name: "TV" }],
        [
          { id: "12", name: "Deezer" },
          { id: "0a", name: "Spotify" }
        ]
      )
    ).toEqual([
      { id: "nsv12", name: "Deezer", network: true },
      { id: "0a", name: "Spotify", network: true },
      { id: "12", name: "TV" }
    ]);
  });
});
