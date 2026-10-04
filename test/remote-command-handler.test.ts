import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import * as uc from "@unfoldedcircle/integration-api";
import { clearAllAvrInputs, setAvrInputs } from "../src/inputSourceStore.js";

vi.mock("../src/utils.js", () => ({
  ensureEiscpConnected: vi.fn().mockResolvedValue(true),
  delay: vi.fn().mockResolvedValue(undefined),
  toHex: (n: number, w: number) => n.toString(16).toUpperCase().padStart(w, "0")
}));

const AVR_ENTRY = "TX-RZ50 192.168.1.100 main";
const REMOTE_ID = `${AVR_ENTRY}_remote`;

function makeMockEiscp(connected = true) {
  const eiscp: any = new EventEmitter();
  eiscp.connected = connected;
  eiscp.connect = vi.fn().mockResolvedValue({ model: "TX-RZ50", host: "192.168.1.100", port: 60128 });
  eiscp.waitForConnect = vi.fn().mockResolvedValue(undefined);
  eiscp.command = vi.fn().mockResolvedValue(undefined);
  eiscp.raw = vi.fn().mockResolvedValue(undefined);
  return eiscp;
}

function makeHandler(overrides: any = {}) {
  const driver = { updateEntityAttributes: vi.fn() };
  const mockEiscp = makeMockEiscp();
  const connMgr = {
    getPhysicalConnection: vi.fn().mockReturnValue({ eiscp: mockEiscp, commandReceiver: undefined })
  };
  const instance = {
    config: {
      model: "TX-RZ50",
      ip: "192.168.1.100",
      port: 60128,
      zone: "main",
      volumeDisplay: "absolute",
      volumeScale: 100,
      adjustVolumeDispl: true,
      queueThreshold: 200
    }
  };
  const avrMgr = { get: vi.fn().mockReturnValue(instance) };
  const avrStateApi = {
    isEntityOn: vi.fn().mockReturnValue(true),
    refreshAvrState: vi.fn().mockResolvedValue(undefined)
  };

  return { driver, mockEiscp, connMgr, avrMgr, avrStateApi, instance };
}

async function createHandler(mock: ReturnType<typeof makeHandler>) {
  const { remoteEntityCommandHandler } = await import("../src/remoteEntityCommandHandler.js");
  return new remoteEntityCommandHandler(mock.driver as any, mock.connMgr as any, mock.avrMgr as any, mock.avrStateApi as any);
}

describe("remoteEntityCommandHandler", () => {
  it("returns NotFound when no AVR instance found", async () => {
    const mock = makeHandler();
    mock.avrMgr.get.mockReturnValue(undefined);
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.RemoteCommands.On, {});

    expect(result).toBe(uc.StatusCodes.NotFound);
    expect(mock.mockEiscp.command).not.toHaveBeenCalled();
  });

  it("returns ServiceUnavailable when no physical connection found", async () => {
    const mock = makeHandler();
    mock.connMgr.getPhysicalConnection.mockReturnValue(undefined);
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.RemoteCommands.On, {});

    expect(result).toBe(uc.StatusCodes.ServiceUnavailable);
  });

  it("returns Timeout when AVR cannot be connected", async () => {
    const mock = makeHandler();
    const { ensureEiscpConnected } = await import("../src/utils.js");
    (ensureEiscpConnected as any).mockResolvedValueOnce(false);
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.RemoteCommands.On, {});

    expect(result).toBe(uc.StatusCodes.Timeout);
  });

  it("sends power on for RemoteCommands.On and updates state", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.RemoteCommands.On, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("system-power on");
    expect(mock.driver.updateEntityAttributes).toHaveBeenCalledWith(REMOTE_ID, { [uc.RemoteAttributes.State]: uc.RemoteStates.On });
  });

  it("sends power off for RemoteCommands.Off and updates state", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.RemoteCommands.Off, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("system-power standby");
    expect(mock.driver.updateEntityAttributes).toHaveBeenCalledWith(REMOTE_ID, { [uc.RemoteAttributes.State]: uc.RemoteStates.Off });
  });

  it("toggles power based on current state", async () => {
    const mock = makeHandler();
    mock.avrStateApi.isEntityOn.mockReturnValue(false);
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.RemoteCommands.Toggle, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("system-power on");
    expect(mock.driver.updateEntityAttributes).toHaveBeenCalledWith(REMOTE_ID, { [uc.RemoteAttributes.State]: uc.RemoteStates.On });
  });

  it("handles media-player style command from button mapping (VolumeUp)", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.VolumeUp, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.raw).toHaveBeenCalledWith("MVLUP1");
  });

  it("sends preset command for ChannelDown", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.ChannelDown, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("preset down");
  });

  it("sets volume via raw MVL hex and respects adjustVolumeDispl", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.Volume, { volume: 50 });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.raw).toHaveBeenCalledWith("MVL64");
  });

  it("ignores volume slider when volumeDisplay is relative", async () => {
    const mock = makeHandler();
    mock.instance.config.volumeDisplay = "relative";
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.Volume, { volume: 50 });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.raw).not.toHaveBeenCalled();
  });

  it("sends audio-muting toggle for MuteToggle", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.MuteToggle, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("audio-muting toggle");
  });

  it("selects a known input selector for SelectSource", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.SelectSource, { source: "TV" });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("input-selector tv");
  });

  it("routes a generated reported-source command with spaces through input-selector", async () => {
    setAvrInputs("TX-RZ50 192.168.1.100", [{ id: "0e", name: "TuneIn Radio" }]);
    try {
      const mock = makeHandler();
      const handler = await createHandler(mock);
      const entity = { id: REMOTE_ID, attributes: {} };
      const result = await handler.handle(entity, "INPUT_REPORTED_TuneIn%20Radio", {});

      expect(result).toBe(uc.StatusCodes.Ok);
      expect(mock.mockEiscp.command).toHaveBeenCalledWith({ zone: "main", command: "input-selector", args: "tunein radio" });
    } finally {
      clearAllAvrInputs();
    }
  });

  it("passes multi-zone commands through for SelectSource", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.SelectSource, { source: "multi-zone input-selector BD" });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("multi-zone input-selector bd");
  });

  it("rejects invalid raw source commands", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.SelectSource, { source: "raw MV L@@@" });

    expect(result).toBe(uc.StatusCodes.BadRequest);
    expect(mock.mockEiscp.raw).not.toHaveBeenCalled();
  });

  it("executes simple commands from simple_commands list", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, "DIMMER_BRIGHT", {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("dimmer-level bright");
  });

  it("executes vocal up/down as stateful absolute levels", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    let currentLevel = 1;
    mock.mockEiscp.raw = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === "VOCQSTN") {
        setImmediate(() => mock.mockEiscp.emit("data", { command: "vocal", argument: currentLevel }));
      }
      return Promise.resolve();
    });

    const entity = { id: REMOTE_ID, attributes: {} };
    const upResult = await handler.handle(entity, "VOCAL_UP", {});
    currentLevel = 2;
    const downResult = await handler.handle(entity, "VOCAL_DOWN", {});

    expect(upResult).toBe(uc.StatusCodes.Ok);
    expect(downResult).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.raw).toHaveBeenCalledWith("VOCQSTN");
    expect(mock.mockEiscp.raw).toHaveBeenCalledWith("VOC02");
    expect(mock.mockEiscp.raw).toHaveBeenCalledWith("VOC01");
  });

  it("clamps vocal level at 0 and 5", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    let currentLevel = 5;
    mock.mockEiscp.raw = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === "VOCQSTN") {
        setImmediate(() => mock.mockEiscp.emit("data", { command: "vocal", argument: currentLevel }));
      }
      return Promise.resolve();
    });

    const entity = { id: REMOTE_ID, attributes: {} };
    await handler.handle(entity, "VOCAL_UP", {});
    currentLevel = 0;
    await handler.handle(entity, "VOCAL_DOWN", {});

    expect(mock.mockEiscp.raw).toHaveBeenCalledWith("VOC05");
    expect(mock.mockEiscp.raw).toHaveBeenCalledWith("VOC00");
  });

  it("returns Ok without sending when vocal level query times out", async () => {
    vi.useFakeTimers();
    try {
      const mock = makeHandler();
      const handler = await createHandler(mock);
      const entity = { id: REMOTE_ID, attributes: {} };

      const pending = handler.handle(entity, "VOCAL_UP", {});
      await vi.advanceTimersByTimeAsync(2000);
      const result = await pending;

      expect(result).toBe(uc.StatusCodes.Ok);
      expect(mock.mockEiscp.raw).toHaveBeenCalledWith("VOCQSTN");
      expect(mock.mockEiscp.raw).not.toHaveBeenCalledWith("VOC02");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns NotImplemented for unknown command IDs", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, "NONEXISTENT_CMD", {});

    expect(result).toBe(uc.StatusCodes.NotImplemented);
  });

  it("returns BadRequest for SendCmd without a command", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.RemoteCommands.SendCmd, {});

    expect(result).toBe(uc.StatusCodes.BadRequest);
  });

  it("executes SendCmd with a command", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.RemoteCommands.SendCmd, { command: "INPUT_BD" });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("input-selector bd");
  });

  it("returns BadRequest for SendCmdSequence without a sequence", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.RemoteCommands.SendCmdSequence, {});

    expect(result).toBe(uc.StatusCodes.BadRequest);
  });

  it("executes each command in SendCmdSequence", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.RemoteCommands.SendCmdSequence, { sequence: ["INPUT_BD", "DIMMER_BRIGHT"] });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("input-selector bd");
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("dimmer-level bright");
  });

  it("zone-prefixes simple commands for non-main zones", async () => {
    const mock = makeHandler();
    mock.instance.config.zone = "zone2";
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, "DIMMER_BRIGHT", {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("zone2.dimmer-level bright");
  });

  it("toggles power off when the AVR is currently on", async () => {
    const mock = makeHandler();
    mock.avrStateApi.isEntityOn.mockReturnValue(true);
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.RemoteCommands.Toggle, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("system-power standby");
    expect(mock.driver.updateEntityAttributes).toHaveBeenCalledWith(REMOTE_ID, { [uc.RemoteAttributes.State]: uc.RemoteStates.Off });
  });

  it("accepts undefined params", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.RemoteCommands.On, undefined);

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("system-power on");
  });

  it("sends volume down for MediaPlayerCommands.VolumeDown", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.VolumeDown, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.raw).toHaveBeenCalledWith("MVLDOWN1");
  });

  it("sends audio-muting on for Mute", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.Mute, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("audio-muting on");
  });

  it("sends audio-muting off for Unmute", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.Unmute, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("audio-muting off");
  });

  it("sends preset up for ChannelUp", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.ChannelUp, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("preset up");
  });

  it.each([
    [uc.MediaPlayerCommands.CursorUp, "setup up"],
    [uc.MediaPlayerCommands.CursorDown, "setup down"],
    [uc.MediaPlayerCommands.CursorLeft, "setup left"],
    [uc.MediaPlayerCommands.CursorRight, "setup right"],
    [uc.MediaPlayerCommands.CursorEnter, "setup enter"]
  ])("sends setup command for %s", async (cmd, expected) => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, cmd as uc.MediaPlayerCommands, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith(expected);
  });

  it("sends setup menu for Settings", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.Settings, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("setup menu");
  });

  it.each([
    [uc.MediaPlayerCommands.Home, "setup exit"],
    [uc.MediaPlayerCommands.Back, "setup exit"]
  ])("sends setup exit for %s", async (cmd, expected) => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, cmd as uc.MediaPlayerCommands, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith(expected);
  });

  it("refreshes AVR state for Info", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.Info, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.avrStateApi.refreshAvrState).toHaveBeenCalled();
  });

  it("sends network-usb play for PlayPause", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.PlayPause, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("network-usb play");
  });

  it.each([
    [uc.MediaPlayerCommands.Next, "network-usb trup"],
    [uc.MediaPlayerCommands.Previous, "network-usb trdn"]
  ])("sends network-usb transport command for %s", async (cmd, expected) => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, cmd as uc.MediaPlayerCommands, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith(expected);
  });

  it("does nothing for Volume without a volume param", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.Volume, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.raw).not.toHaveBeenCalled();
  });

  it("falls back to volumeScale 100 when not configured", async () => {
    const mock = makeHandler();
    mock.instance.config.volumeScale = 0;
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.Volume, { volume: 50 });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.raw).toHaveBeenCalledWith("MVL64");
  });

  it("sets volume without doubling when adjustVolumeDispl is false", async () => {
    const mock = makeHandler();
    mock.instance.config.adjustVolumeDispl = false;
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.Volume, { volume: 50 });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.raw).toHaveBeenCalledWith("MVL32");
  });

  it("defaults adjustVolumeDispl to true when not configured", async () => {
    const mock = makeHandler();
    mock.instance.config.adjustVolumeDispl = undefined;
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.Volume, { volume: 50 });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.raw).toHaveBeenCalledWith("MVL64");
  });

  it("defaults volumeDisplay to absolute when not configured", async () => {
    const mock = makeHandler();
    mock.instance.config.volumeDisplay = undefined;
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.Volume, { volume: 50 });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.raw).toHaveBeenCalledWith("MVL64");
  });

  it("does nothing for SelectSource without a source", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.SelectSource, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).not.toHaveBeenCalled();
    expect(mock.mockEiscp.raw).not.toHaveBeenCalled();
  });

  it("does nothing for SelectSource with a non-string source", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.SelectSource, { source: 123 });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).not.toHaveBeenCalled();
    expect(mock.mockEiscp.raw).not.toHaveBeenCalled();
  });

  it("sends a valid raw command for SelectSource", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.SelectSource, { source: "raw MVL99" });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.raw).toHaveBeenCalledWith("MVL99");
  });

  it("rejects raw source commands that are too long", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.SelectSource, { source: `raw ${"A".repeat(21)}` });

    expect(result).toBe(uc.StatusCodes.BadRequest);
    expect(mock.mockEiscp.raw).not.toHaveBeenCalled();
  });

  it("rejects source commands with invalid characters", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.SelectSource, { source: "foo@bar" });

    expect(result).toBe(uc.StatusCodes.BadRequest);
    expect(mock.mockEiscp.command).not.toHaveBeenCalled();
  });

  it("sends unknown but valid source commands through", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.MediaPlayerCommands.SelectSource, { source: "somecommand" });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledWith("somecommand");
  });

  it("repeats SendCmd and applies the delay between repeats", async () => {
    const mock = makeHandler();
    const { delay } = await import("../src/utils.js");
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.RemoteCommands.SendCmd, { command: "INPUT_BD", repeat: 2, delay: 10 });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.command).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(10);
  });

  it("returns the failing status from a repeated SendCmd", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.RemoteCommands.SendCmd, { command: "NONEXISTENT_CMD" });

    expect(result).toBe(uc.StatusCodes.NotImplemented);
  });

  it("applies the delay between commands in SendCmdSequence", async () => {
    const mock = makeHandler();
    const { delay } = await import("../src/utils.js");
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.RemoteCommands.SendCmdSequence, { sequence: ["INPUT_BD", "DIMMER_BRIGHT"], delay: 10 });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(delay).toHaveBeenCalledWith(10);
  });

  it("returns the failing status from a command in SendCmdSequence", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, uc.RemoteCommands.SendCmdSequence, { sequence: ["NONEXISTENT_CMD"] });

    expect(result).toBe(uc.StatusCodes.NotImplemented);
  });
});
