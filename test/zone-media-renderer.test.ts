import { describe, it, expect, vi } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";

function makeDriverMock() {
  return { updateEntityAttributes: vi.fn() };
}

function makeMediaStateStoreMock(overrides: Record<string, any> = {}) {
  return {
    getNowPlaying: vi.fn().mockReturnValue({ title: "", album: "", artist: "" }),
    getSharedAvrMediaState: vi.fn().mockReturnValue({ currentImageUrl: "", lastImageHash: "" }),
    getCurrentTrackId: vi.fn().mockReturnValue(""),
    setCurrentTrackId: vi.fn(),
    getPhysicalAvrId: vi.fn().mockReturnValue("M 1.2.3.4"),
    ...overrides
  };
}

function makeAvrStateApiMock(overrides: Record<string, any> = {}) {
  return {
    getSource: vi.fn().mockReturnValue("unknown"),
    getEntitiesByPhysicalAvrAndSource: vi.fn().mockReturnValue([]),
    ...overrides
  };
}

function makeConfig(overrides: Record<string, any> = {}) {
  return {
    avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main" }],
    model: "TX-RZ50",
    ip: "1.2.3.4",
    volumeScale: 100,
    albumArtURL: undefined,
    ...overrides
  };
}

async function createRenderer(overrides: Record<string, any> = {}) {
  const mod = await import("../src/zoneMediaRenderer.js");
  const { ZoneMediaRenderer } = mod as any;
  const driverMock = overrides.driverMock ?? makeDriverMock();
  const mediaStateStoreMock = overrides.mediaStateStoreMock ?? makeMediaStateStoreMock();
  const avrStateApiMock = overrides.avrStateApiMock ?? makeAvrStateApiMock();
  const config = overrides.config ?? makeConfig();
  const renderer = new ZoneMediaRenderer(driverMock, config, mediaStateStoreMock, avrStateApiMock);
  return { renderer, driverMock, mediaStateStoreMock, avrStateApiMock };
}

describe("renderZoneMedia", () => {
  it("updates media attributes for net source when track changed", async () => {
    const mocks = await createRenderer({
      avrStateApiMock: makeAvrStateApiMock({ getSource: vi.fn().mockReturnValue("net") }),
      mediaStateStoreMock: makeMediaStateStoreMock({
        getNowPlaying: vi.fn().mockReturnValue({ title: "Song", album: "Album", artist: "Artist" }),
        getCurrentTrackId: vi.fn().mockReturnValue("old|track|id"),
        getSharedAvrMediaState: vi.fn().mockReturnValue({ currentImageUrl: "", lastImageHash: "" })
      })
    });

    await mocks.renderer.renderZoneMedia("M 1.2.3.4 main", false);

    expect(mocks.mediaStateStoreMock.setCurrentTrackId).toHaveBeenCalledWith("M 1.2.3.4 main", "Song|Album|Artist");
    expect(mocks.driverMock.updateEntityAttributes).toHaveBeenCalledWith(
      "M 1.2.3.4 main",
      expect.objectContaining({
        [uc.MediaPlayerAttributes.MediaTitle]: "Song"
      })
    );
  });

  it("collects album art after Network is normalized to the internal net source", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      headers: { get: () => '"tunein-art"' },
      ok: true
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { avrStateManager } = await import("../src/avrState.js");
      const entityId = `M 1.2.3.4 main network-normalization-${Date.now()}`;
      avrStateManager.setSource(entityId, "Network");

      const mocks = await createRenderer({
        config: makeConfig({ albumArtURL: "album_art.cgi" }),
        avrStateApiMock: makeAvrStateApiMock({ getSource: vi.fn(() => avrStateManager.getSource(entityId)) }),
        mediaStateStoreMock: makeMediaStateStoreMock({
          getNowPlaying: vi.fn().mockReturnValue({ title: "TuneIn station", album: "", artist: "TuneIn" }),
          getCurrentTrackId: vi.fn().mockReturnValue("old|track|id"),
          getSharedAvrMediaState: vi.fn().mockReturnValue({ currentImageUrl: "", lastImageHash: "" })
        })
      });

      await mocks.renderer.renderZoneMedia(entityId, false);

      expect(avrStateManager.getSource(entityId)).toBe("net");
      expect(fetchMock).toHaveBeenCalledWith("http://1.2.3.4/album_art.cgi", { method: "HEAD" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not update attributes for net source when track unchanged and not forced", async () => {
    const mocks = await createRenderer({
      avrStateApiMock: makeAvrStateApiMock({ getSource: vi.fn().mockReturnValue("net") }),
      mediaStateStoreMock: makeMediaStateStoreMock({
        getNowPlaying: vi.fn().mockReturnValue({ title: "Song", album: "Album", artist: "Artist" }),
        getCurrentTrackId: vi.fn().mockReturnValue("Song|Album|Artist"),
        getSharedAvrMediaState: vi.fn().mockReturnValue({ currentImageUrl: "", lastImageHash: "" })
      })
    });

    await mocks.renderer.renderZoneMedia("M 1.2.3.4 main", false);

    expect(mocks.mediaStateStoreMock.setCurrentTrackId).not.toHaveBeenCalled();
    expect(mocks.driverMock.updateEntityAttributes).not.toHaveBeenCalled();
  });

  it("forces update when forceUpdate is true", async () => {
    const mocks = await createRenderer({
      avrStateApiMock: makeAvrStateApiMock({ getSource: vi.fn().mockReturnValue("net") }),
      mediaStateStoreMock: makeMediaStateStoreMock({
        getNowPlaying: vi.fn().mockReturnValue({ title: "Song", album: "Album", artist: "Artist" }),
        getCurrentTrackId: vi.fn().mockReturnValue("Song|Album|Artist"),
        getSharedAvrMediaState: vi.fn().mockReturnValue({ currentImageUrl: "", lastImageHash: "" })
      })
    });

    await mocks.renderer.renderZoneMedia("M 1.2.3.4 main", true);

    expect(mocks.mediaStateStoreMock.setCurrentTrackId).toHaveBeenCalled();
    expect(mocks.driverMock.updateEntityAttributes).toHaveBeenCalled();
  });

  it("updates image URL when sharedState has currentImageUrl", async () => {
    const mocks = await createRenderer({
      avrStateApiMock: makeAvrStateApiMock({ getSource: vi.fn().mockReturnValue("net") }),
      mediaStateStoreMock: makeMediaStateStoreMock({
        getNowPlaying: vi.fn().mockReturnValue({ title: "Song", album: "Album", artist: "Artist" }),
        getCurrentTrackId: vi.fn().mockReturnValue("old|track|id"),
        getSharedAvrMediaState: vi.fn().mockReturnValue({ currentImageUrl: "http://example.com/img.jpg?hash=abc", lastImageHash: "abc" })
      })
    });

    await mocks.renderer.renderZoneMedia("M 1.2.3.4 main", false);

    expect(mocks.driverMock.updateEntityAttributes).toHaveBeenCalledWith(
      "M 1.2.3.4 main",
      expect.objectContaining({
        [uc.MediaPlayerAttributes.MediaImageUrl]: "http://example.com/img.jpg?hash=abc"
      })
    );
  });

  it.each(["tuner", "fm", "am", "dab"])("handles %s source", async (source) => {
    const mocks = await createRenderer({
      avrStateApiMock: makeAvrStateApiMock({ getSource: vi.fn().mockReturnValue(source) }),
      mediaStateStoreMock: makeMediaStateStoreMock({
        getNowPlaying: vi.fn().mockReturnValue({ station: "89.7 FM", artist: "FM Radio", title: "" }),
        getSharedAvrMediaState: vi.fn().mockReturnValue({ currentImageUrl: "", lastImageHash: "" })
      })
    });

    await mocks.renderer.renderZoneMedia("M 1.2.3.4 main", false);

    expect(mocks.driverMock.updateEntityAttributes).toHaveBeenCalledWith(
      "M 1.2.3.4 main",
      expect.objectContaining({
        [uc.MediaPlayerAttributes.MediaArtist]: "FM Radio",
        [uc.MediaPlayerAttributes.MediaTitle]: "89.7 FM",
        [uc.MediaPlayerAttributes.MediaPosition]: 0
      })
    );

    const call = mocks.driverMock.updateEntityAttributes.mock.calls.find((c: any[]) => c[0] === "M 1.2.3.4 main");
    expect(call[1][uc.MediaPlayerAttributes.MediaImageUrl]).toContain("data:image/svg+xml");
    expect(call[1][uc.MediaPlayerAttributes.MediaImageUrl]).toContain("%231a6fd1");
  });

  it("creates radio icon artwork for dab source", async () => {
    const mocks = await createRenderer({
      avrStateApiMock: makeAvrStateApiMock({ getSource: vi.fn().mockReturnValue("dab") }),
      mediaStateStoreMock: makeMediaStateStoreMock({
        getNowPlaying: vi.fn().mockReturnValue({ station: "Radio 4", artist: "DAB Radio", title: "" }),
        getSharedAvrMediaState: vi.fn().mockReturnValue({ currentImageUrl: "", lastImageHash: "" })
      })
    });

    await mocks.renderer.renderZoneMedia("M 1.2.3.4 main", false);

    expect(mocks.driverMock.updateEntityAttributes).toHaveBeenCalledWith(
      "M 1.2.3.4 main",
      expect.objectContaining({
        [uc.MediaPlayerAttributes.MediaTitle]: "Radio 4",
        [uc.MediaPlayerAttributes.MediaArtist]: "DAB Radio"
      })
    );

    const call = mocks.driverMock.updateEntityAttributes.mock.calls.find((c: any[]) => c[0] === "M 1.2.3.4 main");
    const imageUrl: string = call[1][uc.MediaPlayerAttributes.MediaImageUrl];
    expect(imageUrl).toContain("data:image/svg+xml");
    expect(imageUrl).toContain("M495 401Q515");
    expect(imageUrl).not.toContain("Radio 4");
  });

  it("creates radio icon artwork regardless of station name", async () => {
    const mocks = await createRenderer({
      avrStateApiMock: makeAvrStateApiMock({ getSource: vi.fn().mockReturnValue("fm") }),
      mediaStateStoreMock: makeMediaStateStoreMock({
        getNowPlaying: vi.fn().mockReturnValue({ station: "", artist: "FM Radio", title: "" }),
        getSharedAvrMediaState: vi.fn().mockReturnValue({ currentImageUrl: "", lastImageHash: "" })
      })
    });

    await mocks.renderer.renderZoneMedia("M 1.2.3.4 main", false);

    const call = mocks.driverMock.updateEntityAttributes.mock.calls.find((c: any[]) => c[0] === "M 1.2.3.4 main");
    expect(call[1][uc.MediaPlayerAttributes.MediaImageUrl]).toContain("data:image/svg+xml");
    expect(call[1][uc.MediaPlayerAttributes.MediaTitle]).toBe("Tuner");
  });

  it("handles default (unknown) source by clearing media attributes", async () => {
    const mocks = await createRenderer({
      avrStateApiMock: makeAvrStateApiMock({ getSource: vi.fn().mockReturnValue("unknown") }),
      mediaStateStoreMock: makeMediaStateStoreMock()
    });

    await mocks.renderer.renderZoneMedia("M 1.2.3.4 main", false);

    expect(mocks.driverMock.updateEntityAttributes).toHaveBeenCalledWith(
      "M 1.2.3.4 main",
      expect.objectContaining({
        [uc.MediaPlayerAttributes.MediaArtist]: "",
        [uc.MediaPlayerAttributes.MediaTitle]: "",
        [uc.MediaPlayerAttributes.MediaPosition]: 0
      })
    );
  });
});

describe("updateConfig", () => {
  it("updates config on renderer", async () => {
    const mocks = await createRenderer();
    const newConfig = makeConfig({ volumeScale: 200 });
    expect(() => mocks.renderer.updateConfig(newConfig)).not.toThrow();
  });
});

describe("maybeUpdateImage", () => {
  it("returns early when albumArtURL is not configured", async () => {
    const mocks = await createRenderer();
    await mocks.renderer.maybeUpdateImage("M 1.2.3.4 main");
    expect(mocks.driverMock.updateEntityAttributes).not.toHaveBeenCalled();
  });

  it("returns early when albumArtURL is na", async () => {
    const mocks = await createRenderer({ config: makeConfig({ albumArtURL: "na" }) });
    await mocks.renderer.maybeUpdateImage("M 1.2.3.4 main");
    expect(mocks.driverMock.updateEntityAttributes).not.toHaveBeenCalled();
  });
});
