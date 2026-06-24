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
    expect(mocks.driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main", expect.objectContaining({
      [uc.MediaPlayerAttributes.MediaTitle]: "Song"
    }));
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

    expect(mocks.driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main", expect.objectContaining({
      [uc.MediaPlayerAttributes.MediaImageUrl]: "http://example.com/img.jpg?hash=abc"
    }));
  });

  it("handles tuner/fm/dab source", async () => {
    const mocks = await createRenderer({
      avrStateApiMock: makeAvrStateApiMock({ getSource: vi.fn().mockReturnValue("fm") }),
      mediaStateStoreMock: makeMediaStateStoreMock({
        getNowPlaying: vi.fn().mockReturnValue({ station: "89.7 FM", artist: "FM Radio", title: "" }),
        getSharedAvrMediaState: vi.fn().mockReturnValue({ currentImageUrl: "", lastImageHash: "" })
      })
    });

    await mocks.renderer.renderZoneMedia("M 1.2.3.4 main", false);

    expect(mocks.driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main", expect.objectContaining({
      [uc.MediaPlayerAttributes.MediaArtist]: "FM Radio",
      [uc.MediaPlayerAttributes.MediaTitle]: "89.7 FM",
      [uc.MediaPlayerAttributes.MediaPosition]: 0
    }));
  });

  it("handles default (unknown) source by clearing media attributes", async () => {
    const mocks = await createRenderer({
      avrStateApiMock: makeAvrStateApiMock({ getSource: vi.fn().mockReturnValue("unknown") }),
      mediaStateStoreMock: makeMediaStateStoreMock()
    });

    await mocks.renderer.renderZoneMedia("M 1.2.3.4 main", false);

    expect(mocks.driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main", expect.objectContaining({
      [uc.MediaPlayerAttributes.MediaArtist]: "",
      [uc.MediaPlayerAttributes.MediaTitle]: "",
      [uc.MediaPlayerAttributes.MediaPosition]: 0
    }));
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
