import { describe, expect, it } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";
import SetupHandler from "../src/setupHandler.js";

function responseValues(action: uc.SetupAction): Record<string, unknown> {
  const values: Record<string, unknown> = {
    model: "TX-RZ50",
    ipAddress: "192.168.1.2",
    port: 60128,
    entityNameStyle: "short",
    volumeScale: "auto",
    volumeDisplay: "absolute",
    adjustVolumeDispl: "true",
    createSensors: "true",
    createTunerPresets: "true",
    createRemoteEntity: "true",
    createDiracSelectEntity: "true",
    logLevel: "warn"
  };
  if (action instanceof uc.RequestUserInput) {
    for (const setting of action.settings as Array<{ id: string }>) {
      if (setting.id.startsWith("ids_")) values[setting.id] = "exclude";
      if (setting.id.startsWith("lmd_")) values[setting.id] = "learn";
    }
  }
  return values;
}

describe("setup configuration flow", () => {
  it("walks the complete integration, input-source, and listening-mode flow", async () => {
    let saved = false;
    const setup = new SetupHandler({
      driver: {},
      getConfigDirPath: () => undefined,
      onConfigSaved: async () => {
        saved = true;
      },
      onConfigCleared: async () => {},
      queryInputSources: async () => ({
        available: true,
        inputs: [
          { id: "10", name: "BD/DVD" },
          { id: "NSV12", name: "Deezer" }
        ]
      }),
      log: console
    });

    let action: uc.SetupAction = await setup.handle(new uc.DriverSetupRequest(false, {}));
    expect(action).toBeInstanceOf(uc.RequestUserInput);
    for (let page = 0; page < 9; page++) {
      action = await setup.handle(new uc.UserDataResponse(responseValues(action)));
      if (action instanceof uc.SetupComplete) break;
    }
    expect(action).toBeInstanceOf(uc.SetupComplete);
    expect(saved).toBe(true);
  });
});
