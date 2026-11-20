import { describe, expect, it } from "vitest";
import {
  DONT_INCLUDE_INPUT_SOURCE,
  DISCOVERED_INPUT_SOURCE,
  findConfiguredInputId,
  getAliasesForReportedInput,
  getInputSourceAliases,
  getKnownInputSources,
  isNetworkInputSource,
  resolveConfiguredInputSources
} from "../src/inputSourcePreferences.js";
import { collectAvrInputSources } from "../src/inputSourceResolver.js";
import { normalizeInputSourceSettings } from "../src/configConstants.js";

describe("input source preferences", () => {
  it("groups known SLI aliases and resolves known and NRI service aliases", () => {
    expect(getKnownInputSources().length).toBeGreaterThan(0);
    expect(getInputSourceAliases("02")).toContain("game");
    expect(getAliasesForReportedInput("NSV12", "Deezer")).toEqual(["deezer"]);
    expect(getAliasesForReportedInput("02", "GAME")).toContain("game");
    expect(getAliasesForReportedInput("unknown", "Custom source")).toEqual([]);
  });

  it("normalizes settings and resolves learned, aliases, exclusions, and duplicates", () => {
    const settings = normalizeInputSourceSettings({
      "02": { name: "GAME", setting: DISCOVERED_INPUT_SOURCE },
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

// Pins the NRI service-name behavior that is now derived from the networkServices table.
describe("AVR-reported network service names", () => {
  it.each([
    ["TuneIn Radio", ["tunein"]],
    ["Spotify", ["spotify"]],
    ["Deezer", ["deezer"]],
    ["TIDAL", ["tidal"]],
    ["Amazon Music", ["amazonmusic"]],
    ["Chromecast built-in", ["chromecast"]],
    ["DTS Play-Fi", ["dts-play-fi"]],
    ["AirPlay", ["airplay"]],
    ["Amazon Alexa", ["alexa"]],
    ["Music Server", ["music-server"]]
  ])("maps %s to its input-selector aliases and marks it as a network source", (name, aliases) => {
    expect(getAliasesForReportedInput("XX", name)).toEqual(aliases);
    expect(isNetworkInputSource("XX", name)).toBe(true);
  });

  it("does not treat USB, Play Queue or the SLI 27 music-server input as network sources", () => {
    expect(getAliasesForReportedInput("XX", "USB")).toEqual([]);
    expect(isNetworkInputSource("XX", "USB")).toBe(false);
    expect(isNetworkInputSource("XX", "Play Queue")).toBe(false);
    // SLI 27 (musicserver / p4s / dlna) is a regular input, unlike the NSS10 Music Server network service.
    expect(getAliasesForReportedInput("27", "Music Server")).toEqual(["musicserver", "p4s", "dlna"]);
    expect(isNetworkInputSource("27", "Music Server")).toBe(false);
  });
});
