import { describe, it, expect, vi } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";

vi.mock("../src/utils.js", () => ({
  ensureEiscpConnected: vi.fn().mockResolvedValue(true),
  delay: vi.fn().mockResolvedValue(undefined),
  toHex: (n: number, w: number) => n.toString(16).toUpperCase().padStart(w, "0")
}));

const AVR_ENTRY = "TX-RZ50 192.168.1.100 main";
const REMOTE_ID = `${AVR_ENTRY}_remote`;

function makeMockEiscp(connected = true) {
  return {
    get connected() {
      return connected;
    },
    connect: vi.fn().mockResolvedValue({ model: "TX-RZ50", host: "192.168.1.100", port: 60128 }),
    waitForConnect: vi.fn().mockResolvedValue(undefined),
    command: vi.fn().mockResolvedValue(undefined),
    raw: vi.fn().mockResolvedValue(undefined)
  };
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
  const { RemoteCommandHandler } = await import("../src/remoteCommandHandler.js");
  return new RemoteCommandHandler(mock.driver as any, mock.connMgr as any, mock.avrMgr as any, mock.avrStateApi as any);
}

describe("RemoteCommandHandler", () => {
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

  it("returns NotImplemented for unknown command IDs", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, "NONEXISTENT_CMD", {});

    expect(result).toBe(uc.StatusCodes.NotImplemented);
  });

  it("executes raw commands prefixed with 'raw '", async () => {
    const mock = makeHandler();
    const handler = await createHandler(mock);

    const entity = { id: REMOTE_ID, attributes: {} };
    const result = await handler.handle(entity, "raw MVL40", {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mock.mockEiscp.raw).toHaveBeenCalledWith("MVL40");
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
});
