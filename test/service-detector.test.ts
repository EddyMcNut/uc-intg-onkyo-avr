import { describe, expect, it } from "vitest";
import { detectServiceFromText, getCanonicalServiceName } from "../src/serviceDetector.js";
import { toServiceId } from "../src/networkServices.js";
import { ALBUM_ART, MEDIA_BROWSING, SONG_INFO } from "../src/constants.js";
import { MUSIC_SERVER_SERVICE_ID } from "../src/browseServiceContract.js";

describe("serviceDetector", () => {
  it("normalizes display names to the sub-source id stored in avrState", () => {
    expect(toServiceId(" Music Server ")).toBe("music-server");
    expect(toServiceId("DTS Play-Fi")).toBe("dts-play-fi");
    expect(toServiceId("Chromecast built-in")).toBe("chromecast-built-in");
  });

  // Regression: detection used to return "music server" while the state stored "music-server".
  it("returns service ids that match the capability lists and browse ids", () => {
    expect(detectServiceFromText("Music Server")).toBe(MUSIC_SERVER_SERVICE_ID);
    expect(detectServiceFromText("Now Playing: DTS Play-Fi / Track")).toBe("dts-play-fi");
    expect(MEDIA_BROWSING).toContain(detectServiceFromText("Music Server"));
    expect(ALBUM_ART).toContain(detectServiceFromText("DTS Play-Fi"));
    expect(SONG_INFO).toContain(detectServiceFromText("DTS Play-Fi"));
  });

  it("maps a service id back to its display name", () => {
    expect(getCanonicalServiceName("music-server")).toBe("Music Server");
    expect(getCanonicalServiceName("dts-play-fi")).toBe("DTS Play-Fi");
    expect(getCanonicalServiceName("tunein")).toBe("TuneIn");
    expect(getCanonicalServiceName("unknown-service")).toBeUndefined();
  });
});
