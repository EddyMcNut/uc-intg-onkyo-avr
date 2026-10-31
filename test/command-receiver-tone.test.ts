import { describe, it, expect, vi } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";

function makeIntegrationConfig(overrides: Record<string, any> = {}) {
  return {
    avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", volumeScale: 100, adjustVolumeDispl: true, volumeDisplay: "absolute" }],
    volumeScale: 100,
    adjustVolumeDispl: true,
    volumeDisplay: "absolute",
    model: "TX-RZ50",
    ip: "1.2.3.4",
    ...overrides
  };
}

function makeEiscpMock() {
  return { on: vi.fn(), command: vi.fn(), raw: vi.fn() };
}

function makeAvrStateApiMock(overrides: Record<string, any> = {}) {
  return {
    setPowerState: vi.fn(),
    setSource: vi.fn(),
    setVolume: vi.fn(),
    setAudioFormat: vi.fn(),
    getSource: vi.fn().mockReturnValue("unknown"),
    getAudioFormat: vi.fn().mockReturnValue("unknown"),
    isEntityOn: vi.fn().mockReturnValue(true),
    getEntitiesByPhysicalAvrAndSource: vi.fn().mockReturnValue([]),
    ...overrides
  };
}

async function makeReceiver(overrides: Record<string, any> = {}) {
  const mod = await import("../src/commandReceiver.js");
  const { CommandReceiver } = mod as any;
  const driverMock = overrides.driverMock ?? { updateEntityAttributes: vi.fn(), getConfigDirPath: vi.fn() };
  const config = overrides.config ?? makeIntegrationConfig();
  const eiscpMock = overrides.eiscpMock ?? makeEiscpMock();
  const avrStateApiMock = overrides.avrStateApiMock ?? makeAvrStateApiMock();
  const receiver = new CommandReceiver(driverMock, config, eiscpMock, avrStateApiMock);
  return { receiver, driverMock, eiscpMock, avrStateApiMock };
}

describe("handleToneFront", () => {
  it("updates bass and treble sensors from the tone-front payload", async () => {
    const { receiver, driverMock } = await makeReceiver();
    const avrUpdates = { command: "tone-front", argument: { bass: "10", treble: "-4" }, zone: "main", iscpCommand: "TFRB+AT-4", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers["tone-front"](avrUpdates, "M 1.2.3.4 main", "main");

    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main_bass_sensor", expect.objectContaining({ [uc.SensorAttributes.Value]: "10" }));
    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main_treble_sensor", expect.objectContaining({ [uc.SensorAttributes.Value]: "-4" }));
    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main_bass_sensor", expect.objectContaining({ [uc.SensorAttributes.State]: uc.SensorStates.On }));
    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main_treble_sensor", expect.objectContaining({ [uc.SensorAttributes.State]: uc.SensorStates.On }));
  });

  it("ignores malformed tone-front payloads without bass/treble", async () => {
    const { receiver, driverMock } = await makeReceiver();
    const avrUpdates = { command: "tone-front", argument: "N/A", zone: "main", iscpCommand: "TFRQSTN", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers["tone-front"](avrUpdates, "M 1.2.3.4 main", "main");
    expect(driverMock.updateEntityAttributes).not.toHaveBeenCalled();
  });
});

describe("handleVocal", () => {
  it("updates vocal sensor with the numeric level", async () => {
    const { receiver, driverMock } = await makeReceiver();
    const avrUpdates = { command: "vocal", argument: 3, zone: "main", iscpCommand: "VOC03", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers.vocal(avrUpdates, "M 1.2.3.4 main", "main");

    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main_vocal_sensor", expect.objectContaining({ [uc.SensorAttributes.Value]: "3" }));
    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main_vocal_sensor", expect.objectContaining({ [uc.SensorAttributes.State]: uc.SensorStates.On }));
  });
});

describe("handleCenterLevel", () => {
  it("reports center level in dB with one decimal", async () => {
    const { receiver, driverMock } = await makeReceiver();
    const avrUpdates = { command: "center-temporary-level", argument: 7, zone: "main", iscpCommand: "CTL+0E", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers["center-temporary-level"](avrUpdates, "M 1.2.3.4 main", "main");

    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main_temp_center_sensor", expect.objectContaining({ [uc.SensorAttributes.Value]: "7.0 dB" }));
  });

  it("reports negative half-step center level", async () => {
    const { receiver, driverMock } = await makeReceiver();
    const avrUpdates = { command: "center-temporary-level", argument: -0.5, zone: "main", iscpCommand: "CTL-01", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers["center-temporary-level"](avrUpdates, "M 1.2.3.4 main", "main");

    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main_temp_center_sensor", expect.objectContaining({ [uc.SensorAttributes.Value]: "-0.5 dB" }));
  });
});

describe("handleSubwooferLevel", () => {
  it("reports subwoofer level in dB with one decimal", async () => {
    const { receiver, driverMock } = await makeReceiver();
    const avrUpdates = { command: "subwoofer-temporary-level", argument: -0.5, zone: "main", iscpCommand: "SWL-01", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers["subwoofer-temporary-level"](avrUpdates, "M 1.2.3.4 main", "main");

    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main_temp_subwoofer_sensor", expect.objectContaining({ [uc.SensorAttributes.Value]: "-0.5 dB" }));
  });

  it("reports positive subwoofer level in dB", async () => {
    const { receiver, driverMock } = await makeReceiver();
    const avrUpdates = { command: "subwoofer-temporary-level", argument: 6, zone: "main", iscpCommand: "SWL+0C", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers["subwoofer-temporary-level"](avrUpdates, "M 1.2.3.4 main", "main");

    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main_temp_subwoofer_sensor", expect.objectContaining({ [uc.SensorAttributes.Value]: "6.0 dB" }));
  });
});
