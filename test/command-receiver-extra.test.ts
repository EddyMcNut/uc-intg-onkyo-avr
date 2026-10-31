import { describe, it, expect, vi, afterEach } from "vitest";
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

describe("handlePreset", () => {
  it("updates avrPreset on preset event", async () => {
    const { receiver } = await makeReceiver();
    const avrUpdates = { command: "preset", argument: "FM 101.5", zone: "main", iscpCommand: "PRSFM 101.5", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers.preset(avrUpdates, "entity1", "main");
    expect(receiver.avrPreset).toBe("FM 101.5");
  });
});

describe("handleAudioMuting", () => {
  it("sets muted true when argument is on", async () => {
    const { receiver, driverMock } = await makeReceiver();

    const avrUpdates = { command: "audio-muting", argument: "on", zone: "main", iscpCommand: "AMT01", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers["audio-muting"](avrUpdates, "M 1.2.3.4 main", "main");

    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main", { [uc.MediaPlayerAttributes.Muted]: true });
  });

  it("sets muted false when argument is off", async () => {
    const { receiver, driverMock } = await makeReceiver();

    const avrUpdates = { command: "audio-muting", argument: "off", zone: "main", iscpCommand: "AMT00", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers["audio-muting"](avrUpdates, "M 1.2.3.4 main", "main");

    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main", { [uc.MediaPlayerAttributes.Muted]: false });
  });
});

describe("handleVolume", () => {
  it("calculates with default scale 100 and adjustVolumeDispl true", async () => {
    const { receiver, driverMock } = await makeReceiver();

    const avrUpdates = { command: "volume", argument: 50, zone: "main", iscpCommand: "MVL50", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers.volume(avrUpdates, "M 1.2.3.4 main", "main");

    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main", { [uc.MediaPlayerAttributes.Volume]: 25 });
  });

  it("calculates with adjustVolumeDispl false", async () => {
    const { receiver, driverMock } = await makeReceiver({ config: makeIntegrationConfig({ adjustVolumeDispl: false }) });

    const avrUpdates = { command: "volume", argument: 50, zone: "main", iscpCommand: "MVL50", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers.volume(avrUpdates, "M 1.2.3.4 main", "main");

    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main", { [uc.MediaPlayerAttributes.Volume]: 50 });
  });

  it("calculates with volumeScale 200", async () => {
    const { receiver, driverMock } = await makeReceiver({ config: makeIntegrationConfig({ volumeScale: 200 }) });

    const avrUpdates = { command: "volume", argument: 50, zone: "main", iscpCommand: "MVL50", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers.volume(avrUpdates, "M 1.2.3.4 main", "main");

    // Math.round((Math.round(50/2) * 100) / 200) = Math.round(25 * 100 / 200) = Math.round(12.5) = 13
    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main", { [uc.MediaPlayerAttributes.Volume]: 13 });
  });

  it("falls back to 0-100 while the volume scale is still auto", async () => {
    const { receiver, driverMock } = await makeReceiver({ config: makeIntegrationConfig({ volumeScale: "auto" }) });

    const avrUpdates = { command: "volume", argument: 50, zone: "main", iscpCommand: "MVL50", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers.volume(avrUpdates, "M 1.2.3.4 main", "main");

    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main", { [uc.MediaPlayerAttributes.Volume]: 25 });
  });

  it("uses relative volume display", async () => {
    const { receiver, driverMock } = await makeReceiver({ config: makeIntegrationConfig({ volumeDisplay: "relative" }) });

    const avrUpdates = { command: "volume", argument: 50, zone: "main", iscpCommand: "MVL50", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers.volume(avrUpdates, "M 1.2.3.4 main", "main");

    // scaledValue = 25, relative => 25 - 82 = -57
    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main", { [uc.MediaPlayerAttributes.Volume]: -57 });
  });

  it("uses -oo dB for relative volume at or below zero", async () => {
    const { receiver, driverMock } = await makeReceiver({ config: makeIntegrationConfig({ volumeDisplay: "relative" }) });

    const avrUpdates = { command: "volume", argument: 0, zone: "main", iscpCommand: "MVL00", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers.volume(avrUpdates, "M 1.2.3.4 main", "main");

    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main_volume_sensor", expect.objectContaining({ [uc.SensorAttributes.Value]: "-oo dB" }));
  });
});

describe("handleIFV", () => {
  it("updates video_input_sensor when videoInputValue present", async () => {
    const { receiver, driverMock } = await makeReceiver();

    const avrUpdates = { command: "IFV", argument: { videoInputValue: "HDMI1" }, zone: "main", iscpCommand: "IFV...", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers.IFV(avrUpdates, "M 1.2.3.4 main", "main");

    expect(driverMock.updateEntityAttributes).toHaveBeenCalledWith("M 1.2.3.4 main_video_input_sensor", expect.objectContaining({ [uc.SensorAttributes.Value]: "HDMI1" }));
  });

  it("updates all three video sensors when all present", async () => {
    const { receiver, driverMock } = await makeReceiver();

    const avrUpdates = {
      command: "IFV",
      argument: { videoInputValue: "HDMI1", videoOutputValue: "1080p", outputDisplay: "4K" },
      zone: "main",
      iscpCommand: "IFV...",
      host: "1.2.3.4",
      port: 60128,
      model: "TX-RZ50"
    };
    const handlers = (receiver as any).eventHandlers;
    await handlers.IFV(avrUpdates, "M 1.2.3.4 main", "main");

    expect(driverMock.updateEntityAttributes).toHaveBeenCalledTimes(3);
  });
});

describe("handleSystemPower", () => {
  it("calls setPowerState with on", async () => {
    const { receiver, avrStateApiMock } = await makeReceiver();

    const avrUpdates = { command: "system-power", argument: "on", zone: "main", iscpCommand: "PWR01", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers["system-power"](avrUpdates, "M 1.2.3.4 main", "main");

    expect(avrStateApiMock.setPowerState).toHaveBeenCalledWith("M 1.2.3.4 main", "on", expect.anything());
  });

  it("clears sensors when power is standby", async () => {
    const { receiver, driverMock } = await makeReceiver();

    const avrUpdates = { command: "system-power", argument: "standby", zone: "main", iscpCommand: "PWR00", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const handlers = (receiver as any).eventHandlers;
    await handlers["system-power"](avrUpdates, "M 1.2.3.4 main", "main");

    expect(driverMock.updateEntityAttributes).toHaveBeenCalled();
  });
});

describe("additional command receiver branches", () => {
  it("handles standby cleanup, tuner inputs, partial sensors and ignored values", async () => {
    const driverMock = { updateEntityAttributes: vi.fn(), getConfigDirPath: vi.fn() };
    const eiscpMock = { on: vi.fn(), command: vi.fn().mockResolvedValue(undefined), raw: vi.fn() };
    const avrStateApiMock = makeAvrStateApiMock({ getSource: vi.fn().mockReturnValue("cd") });
    const { receiver } = await makeReceiver({ driverMock, eiscpMock, avrStateApiMock });
    const handlers = (receiver as any).eventHandlers;
    const base = { zone: "main", iscpCommand: "", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const entity = "TX-RZ50 1.2.3.4 main";

    await handlers["system-power"]({ ...base, command: "system-power", argument: "standby" }, entity, "main");
    await handlers["input-selector"]({ ...base, command: "input-selector", argument: ["dab", "DAB"] }, entity, "main");
    await handlers["input-selector"]({ ...base, command: "input-selector", argument: ["fm", "FM"] }, entity, "main");
    await handlers.IFV({ ...base, command: "IFV", argument: {} }, entity, "main");
    await handlers["tone-front"]({ ...base, command: "tone-front", argument: { bass: 1, treble: null } }, entity, "main");
    await handlers.vocal({ ...base, command: "vocal", argument: "not-a-number" }, entity, "main");
    await handlers["center-temporary-level"]({ ...base, command: "center-temporary-level", argument: "bad" }, entity, "main");
    await handlers["subwoofer-temporary-level"]({ ...base, command: "subwoofer-temporary-level", argument: "bad" }, entity, "main");
    await handlers.dirac({ ...base, command: "dirac", argument: "query" }, entity, "main");

    expect(eiscpMock.raw).toHaveBeenCalledWith("DSNQSTN");
    expect(eiscpMock.raw).toHaveBeenCalledWith("FLDQSTN");
    expect(driverMock.updateEntityAttributes).toHaveBeenCalled();
  });

  it("uses configured listening-mode aliases and options", async () => {
    const eiscpMock = { on: vi.fn(), command: vi.fn().mockRejectedValue(new Error("offline")), raw: vi.fn() };
    const { receiver } = await makeReceiver({
      eiscpMock,
      config: makeIntegrationConfig({
        avrs: [{ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", listeningModes: { "01": { name: "Direct", setting: "movie" } } }]
      })
    });
    const handlers = (receiver as any).eventHandlers;
    await handlers["listening-mode"](
      { command: "listening-mode", argument: "direct", iscpCommand: "LMD01", zone: "main", host: "1.2.3.4", port: 60128, model: "TX-RZ50" },
      "TX-RZ50 1.2.3.4 main",
      "main"
    );
    await handlers["listening-mode"](
      { command: "listening-mode", argument: "unknown", iscpCommand: "LMD", zone: "main", host: "1.2.3.4", port: 60128, model: "TX-RZ50" },
      "TX-RZ50 1.2.3.4 main",
      "main"
    );
  });
});

describe("dispatchZoneAgnosticCommand", () => {
  it("returns false for unknown command", async () => {
    const { receiver } = await makeReceiver();

    const avrUpdates = { command: "FOO", argument: "bar", zone: "main", iscpCommand: "FOObar", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    const result = await receiver.dispatchZoneAgnosticCommand(avrUpdates, "entity1", "main");
    expect(result).toBe(false);
  });

  it("hands the collected AVR info to the driver", async () => {
    const onAvrInfo = vi.fn();
    const mod = await import("../src/commandReceiver.js");
    const { CommandReceiver } = mod as any;
    const receiver = new CommandReceiver({ updateEntityAttributes: vi.fn() }, makeIntegrationConfig(), makeEiscpMock(), makeAvrStateApiMock(), "v-test", onAvrInfo);

    const avrUpdates = { command: "avr-info", argument: "40", zone: "main", iscpCommand: "NRI", host: "1.2.3.4", port: 60128, model: "TX-RZ50" };
    expect(await receiver.dispatchZoneAgnosticCommand(avrUpdates, "TX-RZ50 1.2.3.4 main", "main")).toBe(true);
    expect(onAvrInfo).toHaveBeenCalledWith("TX-RZ50 1.2.3.4 main");
  });
});

describe("cleanup", () => {
  it("does not throw when timer is null", async () => {
    const { receiver } = await makeReceiver();
    expect(() => receiver.cleanup()).not.toThrow();
  });
});

describe("updateConfig", () => {
  it("does not throw", async () => {
    const { receiver } = await makeReceiver();
    const newConfig = makeIntegrationConfig({ volumeScale: 200 });
    expect(() => receiver.updateConfig(newConfig)).not.toThrow();
  });
});

describe("abortTuneInPreload", () => {
  it("returns false for unknown entity", async () => {
    const { receiver } = await makeReceiver();
    expect(receiver.abortTuneInPreload("nonexistent")).toBe(false);
  });
});
