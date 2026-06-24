import { describe, it, expect, vi } from "vitest";

function makeDeps(overrides: Record<string, any> = {}) {
  return {
    driver: { updateEntityAttributes: vi.fn() },
    eiscpInstance: { command: vi.fn() },
    state: {
      getEntitiesByPhysicalAvrAndSource: vi.fn().mockReturnValue([]),
      getSubSource: vi.fn().mockReturnValue("unknown"),
      setSubSource: vi.fn()
    },
    mediaStateStore: {
      updateNowPlaying: vi.fn(),
      clearNowPlaying: vi.fn()
    },
    getPhysicalAvrId: vi.fn().mockReturnValue("M 1.2.3.4"),
    getNetZones: vi.fn().mockReturnValue([]),
    getServiceAdapter: vi.fn().mockReturnValue(undefined),
    renderZoneMedia: vi.fn(),
    updateFrontPanelDisplay: vi.fn(),
    isNowPlayingDisplay: vi.fn().mockReturnValue(false),
    maybeRequestSongInfo: vi.fn(),
    ...overrides
  };
}

it("handleFld updates FM zones and front panel for FM source", async () => {
  const mod = await import("../src/zoneAgnosticFrontPanelRouter.js");
  const { ZoneAgnosticFrontPanelRouter } = mod as any;

  const deps = makeDeps();
  deps.state.getEntitiesByPhysicalAvrAndSource.mockReturnValue(["M 1.2.3.4 main"]);
  deps.getNetZones.mockReturnValue([]);

  const router = new ZoneAgnosticFrontPanelRouter(deps);

  await router.handleFld("M 1.2.3.4 main", "89.7 FM", "main");

  expect(deps.mediaStateStore.updateNowPlaying).toHaveBeenCalledWith("M 1.2.3.4 main", "fm", { station: "89.7 FM", artist: "FM Radio" });
  expect(deps.renderZoneMedia).toHaveBeenCalledWith("M 1.2.3.4 main", true);
  expect(deps.updateFrontPanelDisplay).toHaveBeenCalledWith(["M 1.2.3.4 main"], "89.7 FM");
});

it("handleFld updates NET zones when detected", async () => {
  const mod = await import("../src/zoneAgnosticFrontPanelRouter.js");
  const { ZoneAgnosticFrontPanelRouter } = mod as any;

  const serviceAdapter = { onServiceDetectedFromFld: vi.fn() };
  const deps = makeDeps({
    getNetZones: vi.fn().mockReturnValue(["M 1.2.3.4 main", "M 1.2.3.4 zone2"]),
    getServiceAdapter: vi.fn().mockReturnValue(serviceAdapter),
    state: {
      getEntitiesByPhysicalAvrAndSource: vi.fn().mockReturnValue([]),
      getSubSource: vi.fn().mockReturnValue("unknown"),
      setSubSource: vi.fn()
    }
  });

  const router = new ZoneAgnosticFrontPanelRouter(deps);

  await router.handleFld("M 1.2.3.4 main", "Spotify", "main");

  expect(deps.updateFrontPanelDisplay).toHaveBeenCalledWith(["M 1.2.3.4 main", "M 1.2.3.4 zone2"], "Spotify");
  expect(deps.state.setSubSource).toHaveBeenCalledWith("M 1.2.3.4 main", "spotify", deps.eiscpInstance, "main", deps.driver);
  expect(deps.state.setSubSource).toHaveBeenCalledWith("M 1.2.3.4 zone2", "spotify", deps.eiscpInstance, "main", deps.driver);
  expect(serviceAdapter.onServiceDetectedFromFld).toHaveBeenCalled();
  expect(deps.maybeRequestSongInfo).toHaveBeenCalledWith("spotify", 2);
});

it("handleFld does not set subsource when already correct", async () => {
  const mod = await import("../src/zoneAgnosticFrontPanelRouter.js");
  const { ZoneAgnosticFrontPanelRouter } = mod as any;

  const deps = makeDeps({
    getNetZones: vi.fn().mockReturnValue(["M 1.2.3.4 main"]),
    state: {
      getEntitiesByPhysicalAvrAndSource: vi.fn().mockReturnValue([]),
      getSubSource: vi.fn().mockReturnValue("spotify"),
      setSubSource: vi.fn()
    },
    isNowPlayingDisplay: vi.fn().mockReturnValue(false)
  });

  const router = new ZoneAgnosticFrontPanelRouter(deps);

  await router.handleFld("M 1.2.3.4 main", "Spotify", "main");

  expect(deps.state.setSubSource).not.toHaveBeenCalled();
});

it("handleFld skips setSubSource and serviceAdapter when isNowPlayingDisplay is true", async () => {
  const mod = await import("../src/zoneAgnosticFrontPanelRouter.js");
  const { ZoneAgnosticFrontPanelRouter } = mod as any;

  const deps = makeDeps({
    getNetZones: vi.fn().mockReturnValue(["M 1.2.3.4 main"]),
    isNowPlayingDisplay: vi.fn().mockReturnValue(true),
    state: {
      getEntitiesByPhysicalAvrAndSource: vi.fn().mockReturnValue([]),
      getSubSource: vi.fn().mockReturnValue("spotify"),
      setSubSource: vi.fn()
    }
  });

  const router = new ZoneAgnosticFrontPanelRouter(deps);

  await router.handleFld("M 1.2.3.4 main", "Spotify", "main");

  expect(deps.state.setSubSource).not.toHaveBeenCalled();
  expect(deps.getServiceAdapter).not.toHaveBeenCalled();
  expect(deps.maybeRequestSongInfo).toHaveBeenCalledWith("spotify", 1);
});

it("handleFld updates front panel for sourceEntityId when no FM or NET zones", async () => {
  const mod = await import("../src/zoneAgnosticFrontPanelRouter.js");
  const { ZoneAgnosticFrontPanelRouter } = mod as any;

  const deps = makeDeps();
  deps.state.getEntitiesByPhysicalAvrAndSource.mockReturnValue([]);
  deps.getNetZones.mockReturnValue([]);

  const router = new ZoneAgnosticFrontPanelRouter(deps);

  await router.handleFld("M 1.2.3.4 main", "Some text", "main");

  expect(deps.updateFrontPanelDisplay).toHaveBeenCalledWith(["M 1.2.3.4 main"], "Some text");
});

it("handleMetadata updates media state and calls service adapter", async () => {
  const mod = await import("../src/zoneAgnosticFrontPanelRouter.js");
  const { ZoneAgnosticFrontPanelRouter } = mod as any;

  const serviceAdapter = { handleMetadata: vi.fn() };
  const deps = makeDeps({
    getNetZones: vi.fn().mockReturnValue(["M 1.2.3.4 main"]),
    getServiceAdapter: vi.fn().mockReturnValue(serviceAdapter),
    state: {
      getEntitiesByPhysicalAvrAndSource: vi.fn().mockReturnValue([]),
      getSubSource: vi.fn().mockReturnValue("tidal"),
      setSubSource: vi.fn()
    }
  });

  const router = new ZoneAgnosticFrontPanelRouter(deps);

  await router.handleMetadata("M 1.2.3.4 main", { title: "Song Title", album: "Album Name", artist: "Artist Name" });

  expect(deps.mediaStateStore.updateNowPlaying).toHaveBeenCalledWith("M 1.2.3.4 main", "net", { title: "Song Title", album: "Album Name", artist: "Artist Name" });
  expect(deps.renderZoneMedia).toHaveBeenCalledWith("M 1.2.3.4 main", true);
  expect(serviceAdapter.handleMetadata).toHaveBeenCalledWith("M 1.2.3.4 main", "Artist Name");
});

it("handleMetadata returns early when argument is null", async () => {
  const mod = await import("../src/zoneAgnosticFrontPanelRouter.js");
  const { ZoneAgnosticFrontPanelRouter } = mod as any;

  const deps = makeDeps();
  const router = new ZoneAgnosticFrontPanelRouter(deps);

  await router.handleMetadata("M 1.2.3.4 main", null);

  expect(deps.mediaStateStore.updateNowPlaying).not.toHaveBeenCalled();
});
