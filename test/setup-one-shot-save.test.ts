// The shortcut save: when the response to the initial form already contains the integration settings, the handler
// saves them at once, without going through the setup pages. The Remote's own UI never sends this (its initial form
// only offers Configure / Restore from backup); the page-by-page flow is covered in setup-wizard.test.ts.
import { describe, expect, it, vi } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";
import SetupHandler from "../src/setupHandler.js";
import { memoryConfigStore } from "./helpers/configStore.js";

describe("setup one-shot save", () => {
  it("saves at once when the first response already contains every setting", async () => {
    const configStore = memoryConfigStore();
    const onConfigSaved = vi.fn(async () => {});
    const queryInputSources = vi.fn(async () => ({ available: false, inputs: [] }));
    const setup = new SetupHandler({
      driver: {} as never,
      getConfigDirPath: () => undefined,
      configStore,
      onConfigSaved,
      onConfigCleared: async () => {},
      queryInputSources,
      log: console as never
    });

    const initial = await setup.handle(new uc.DriverSetupRequest(false, {}));
    expect(initial).toBeInstanceOf(uc.RequestUserInput);

    const result = await setup.handle(
      new uc.UserDataResponse({
        model: "TX-RZ50",
        ipAddress: "192.168.1.2",
        port: "60128",
        entityNameStyle: "short",
        volumeScale: "100",
        volumeDisplay: "absolute",
        adjustVolumeDispl: "true",
        createSensors: "true",
        createTunerPresets: "true",
        createRemoteEntity: "true",
        createDiracSelectEntity: "true",
        logLevel: "warn"
      })
    );

    // One response, no setup pages: saved directly, and the AVR is not probed for input names on this path.
    expect(result).toBeInstanceOf(uc.SetupComplete);
    expect(onConfigSaved).toHaveBeenCalledTimes(1);
    expect(queryInputSources).not.toHaveBeenCalled();
    expect(configStore.get().avrs).toEqual([
      expect.objectContaining({ model: "TX-RZ50", ip: "192.168.1.2", port: 60128, zone: "main", volumeScale: 100, entityNameStyle: "short", createRemoteEntity: true })
    ]);
  });
});
