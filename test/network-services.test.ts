import { describe, expect, it } from "vitest";
import { NETWORK_SERVICE_DEFINITIONS, findNetworkService, hasServiceCapability, toServiceId, toSourceId } from "../src/networkServices.js";
import { ALBUM_ART, MEDIA_BROWSING, SONG_INFO } from "../src/constants.js";
import { BROWSE_SERVICE_IDS } from "../src/browseServiceContract.js";
import { NSS_SERVICE_NAMES } from "../src/eiscpCommandWorkflow.js";

const sorted = (values: readonly string[]): string[] => [...values].sort();

describe("networkServices table", () => {
  // The constants used to be hand-written lists; they are now derived from the table and must not change.
  it("derives the same capability lists as the former hand-written constants", () => {
    expect(sorted(ALBUM_ART)).toEqual(sorted(["tunein", "spotify", "deezer", "tidal", "amazonmusic", "dts-play-fi"]));
    expect(sorted(MEDIA_BROWSING)).toEqual(sorted(["tunein", "tidal", "deezer", "music-server"]));
    expect(sorted(SONG_INFO)).toEqual(sorted(["tunein", "spotify", "deezer", "tidal", "amazonmusic", "dts-play-fi", "airplay"]));
    expect(NETWORK_SERVICE_DEFINITIONS.filter((s) => s.capabilities.noTitle).map((s) => s.id)).toEqual(["tunein"]);
  });

  it("keeps the display names in detection order", () => {
    expect(NETWORK_SERVICE_DEFINITIONS.map((s) => s.displayName)).toEqual([
      "TuneIn",
      "Spotify",
      "Deezer",
      "Tidal",
      "AmazonMusic",
      "Chromecast built-in",
      "DTS Play-Fi",
      "AirPlay",
      "Alexa",
      "Music Server",
      "USB",
      "Play Queue"
    ]);
  });

  it("has unique ids, and every id is already in canonical form", () => {
    const ids = NETWORK_SERVICE_DEFINITIONS.map((service) => service.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(toServiceId(id)).toBe(id);
  });

  it("agrees with the browse contract and the NSS code table", () => {
    for (const id of BROWSE_SERVICE_IDS) expect(hasServiceCapability(id, "browse")).toBe(true);
    for (const [nss, names] of Object.entries(NSS_SERVICE_NAMES)) {
      for (const name of names) expect(findNetworkService(name)?.nss).toBe(nss);
    }
  });
});

describe("toServiceId", () => {
  it("resolves display names, AVR spellings and aliases to the service id", () => {
    expect(toServiceId("Music Server")).toBe("music-server");
    expect(toServiceId("musicserver")).toBe("music-server");
    expect(toServiceId("TuneIn Radio")).toBe("tunein");
    expect(toServiceId("Amazon Music")).toBe("amazonmusic");
    expect(toServiceId("DTS Play-Fi")).toBe("dts-play-fi");
    expect(toServiceId("Chromecast")).toBe("chromecast-built-in");
    expect(toServiceId("TIDAL")).toBe("tidal");
  });

  it("returns unknown names in dashed form", () => {
    expect(toServiceId(" My Presets ")).toBe("my-presets");
    expect(toServiceId("unknown")).toBe("unknown");
    expect(toServiceId("")).toBe("");
  });
});

describe("toSourceId", () => {
  it("maps friendly source names to the canonical source id", () => {
    expect(toSourceId("Network")).toBe("net");
    expect(toSourceId("NET")).toBe("net");
    expect(toSourceId("Music Server")).toBe("music-server");
    expect(toSourceId("Internet Radio")).toBe("internet-radio");
    expect(toSourceId("iRadio Favorite")).toBe("internet-radio-favorite");
  });

  it("leaves other sources in dashed form", () => {
    expect(toSourceId("DAB")).toBe("dab");
    expect(toSourceId(" BD/DVD ")).toBe("bd/dvd");
  });
});
