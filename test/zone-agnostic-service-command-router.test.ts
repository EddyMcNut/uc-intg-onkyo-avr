import { describe, it, expect, vi } from "vitest";

function makeMockAdapter(name: string) {
  return {
    service: name,
    getActiveZones: vi.fn(),
    handleNltContext: vi.fn(),
    handleNls: vi.fn(),
    handleNla: vi.fn(),
    handleMetadata: vi.fn()
  };
}

it("dispatchNltContext calls handleNltContext on all adapters", async () => {
  const mod = await import("../src/zoneAgnosticServiceCommandRouter.js");
  const { ZoneAgnosticServiceCommandRouter } = mod as any;

  const a1 = makeMockAdapter("spotify");
  const a2 = makeMockAdapter("tidal");
  const router = new ZoneAgnosticServiceCommandRouter([a1, a2]);

  router.dispatchNltContext("entity1", "Some Title");

  expect(a1.handleNltContext).toHaveBeenCalledWith("entity1", "Some Title");
  expect(a2.handleNltContext).toHaveBeenCalledWith("entity1", "Some Title");
});

it("dispatchNltContext handles adapter without handleNltContext", async () => {
  const mod = await import("../src/zoneAgnosticServiceCommandRouter.js");
  const { ZoneAgnosticServiceCommandRouter } = mod as any;

  const a1 = makeMockAdapter("spotify");
  (a1 as any).handleNltContext = undefined;
  const router = new ZoneAgnosticServiceCommandRouter([a1]);

  expect(() => router.dispatchNltContext("e1", "title")).not.toThrow();
});

it("dispatchNls calls handleNls on all adapters", async () => {
  const mod = await import("../src/zoneAgnosticServiceCommandRouter.js");
  const { ZoneAgnosticServiceCommandRouter } = mod as any;

  const a1 = makeMockAdapter("spotify");
  const a2 = makeMockAdapter("tidal");
  const router = new ZoneAgnosticServiceCommandRouter([a1, a2]);

  router.dispatchNls("entity1", "entry1");

  expect(a1.handleNls).toHaveBeenCalledWith("entity1", "entry1");
  expect(a2.handleNls).toHaveBeenCalledWith("entity1", "entry1");
});

it("dispatchNla calls handleNla on all adapters", async () => {
  const mod = await import("../src/zoneAgnosticServiceCommandRouter.js");
  const { ZoneAgnosticServiceCommandRouter } = mod as any;

  const a1 = makeMockAdapter("spotify");
  const router = new ZoneAgnosticServiceCommandRouter([a1]);

  router.dispatchNla("entity1", "<xml>payload</xml>");

  expect(a1.handleNla).toHaveBeenCalledWith("entity1", "<xml>payload</xml>");
});

it("dispatchMetadata calls handleMetadata on all adapters", async () => {
  const mod = await import("../src/zoneAgnosticServiceCommandRouter.js");
  const { ZoneAgnosticServiceCommandRouter } = mod as any;

  const a1 = makeMockAdapter("spotify");
  const router = new ZoneAgnosticServiceCommandRouter([a1]);

  router.dispatchMetadata("entity1", "Artist Name");

  expect(a1.handleMetadata).toHaveBeenCalledWith("entity1", "Artist Name");
});

it("works with empty adapters array", async () => {
  const mod = await import("../src/zoneAgnosticServiceCommandRouter.js");
  const { ZoneAgnosticServiceCommandRouter } = mod as any;

  const router = new ZoneAgnosticServiceCommandRouter([]);

  expect(() => {
    router.dispatchNltContext("e1", "title");
    router.dispatchNls("e1", "entry");
    router.dispatchNla("e1", "<xml/>");
    router.dispatchMetadata("e1", "artist");
  }).not.toThrow();
});
