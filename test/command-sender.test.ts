import { describe, it, expect } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";

type MockEiscp = {
  connected: boolean;
  eiscpConfig: { sendDelay: number };
  commands: string[];
  raws: string[];
  command: (cmd: string) => Promise<void>;
  raw: (cmd: string) => Promise<void>;
  connect: (_opts: unknown) => Promise<void>;
  waitForConnect: (_timeout?: number) => Promise<void>;
};

function makeMockEiscp(connected = true): MockEiscp {
  return {
    connected,
    eiscpConfig: { sendDelay: 1 },
    commands: [],
    raws: [],
    async command(cmd: string): Promise<void> {
      this.commands.push(cmd);
    },
    async raw(cmd: string): Promise<void> {
      this.raws.push(cmd);
    },
    async connect(): Promise<void> {
      this.connected = true;
    },
    async waitForConnect(): Promise<void> {
      return;
    }
  };
}

function makeConfig() {
  return {
    queueThreshold: -1,
    volumeScale: 100,
    volumeDisplay: "absolute",
    adjustVolumeDispl: true,
    avrs: [
      {
        model: "TX-RZ50",
        ip: "192.168.2.103",
        port: 60128,
        zone: "main",
        netMenuDelay: 250
      },
      {
        model: "TX-RZ50",
        ip: "192.168.2.103",
        port: 60128,
        zone: "zone2",
        netMenuDelay: 250
      },
      {
        model: "TX-RZ50",
        ip: "192.168.2.103",
        port: 60128,
        zone: "zone3",
        netMenuDelay: 250
      }
    ]
  } as any;
}

it("CommandSender rejects malformed entity ids and unknown AVR targets", async () => {
  const commandSenderModule = await import("../src/commandSender.js");
  const { CommandSender } = commandSenderModule as { CommandSender: new (...deps: any[]) => any };

  const mockDriver = {} as any;
  const mockEiscp = makeMockEiscp(true);
  const mockAvrState = {
    getSubSource: () => "spotify",
    refreshAvrState: async () => undefined
  } as any;

  const sender = new CommandSender(mockDriver, makeConfig(), mockEiscp as any, mockAvrState, undefined);

  const malformed = await sender.sharedCmdHandler({ id: "invalid" } as any, uc.MediaPlayerCommands.On);
  expect(malformed).toBe(uc.StatusCodes.BadRequest);

  const unknown = await sender.sharedCmdHandler({ id: "Other 1.2.3.4 main" } as any, uc.MediaPlayerCommands.On);
  expect(unknown).toBe(uc.StatusCodes.BadRequest);
});

it("CommandSender executes core command branches and zone-specific routing", async () => {
  const commandSenderModule = await import("../src/commandSender.js");
  const { CommandSender } = commandSenderModule as { CommandSender: new (...deps: any[]) => any };

  const mockDriver = {} as any;
  const mockEiscp = makeMockEiscp(true);
  let refreshCalls = 0;
  const mockAvrState = {
    getSubSource: () => "spotify",
    async refreshAvrState(): Promise<void> {
      refreshCalls += 1;
    }
  } as any;

  const sender = new CommandSender(mockDriver, makeConfig(), mockEiscp as any, mockAvrState, undefined);

  const mainEntity = { id: "TX-RZ50 192.168.2.103 main", attributes: { state: uc.MediaPlayerStates.Off } } as any;
  const zone2Entity = { id: "TX-RZ50 192.168.2.103 zone2", attributes: { state: uc.MediaPlayerStates.On } } as any;
  const zone3Entity = { id: "TX-RZ50 192.168.2.103 zone3", attributes: { state: uc.MediaPlayerStates.On } } as any;

  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.On)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Off)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Toggle)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(zone2Entity, uc.MediaPlayerCommands.Toggle)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.MuteToggle)).toBe(uc.StatusCodes.Ok);

  expect(await sender.sharedCmdHandler(zone3Entity, uc.MediaPlayerCommands.VolumeUp)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(zone3Entity, uc.MediaPlayerCommands.VolumeDown)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(zone2Entity, uc.MediaPlayerCommands.Volume, { volume: 50 })).toBe(uc.StatusCodes.Ok);

  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.ChannelUp)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.ChannelDown)).toBe(uc.StatusCodes.Ok);

  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.SelectSource, { source: "cd" })).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.SelectSource, { source: "multi-zone-all-up" })).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.SelectSource, { source: "raw mvl20" })).toBe(uc.StatusCodes.Ok);

  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.PlayPause)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Next)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Previous)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Settings)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Home)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.CursorEnter)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.CursorUp)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.CursorDown)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.CursorLeft)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.CursorRight)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Info)).toBe(uc.StatusCodes.Ok);

  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.PlayMedia, {})).toBe(uc.StatusCodes.NotFound);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Shuffle)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Repeat)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, "browse")).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, "unknown-command")).toBe(uc.StatusCodes.NotImplemented);

  expect(mockEiscp.commands.includes("system-power on")).toBe(true);
  expect(mockEiscp.commands.includes("system-power standby")).toBe(true);
  expect(mockEiscp.commands.includes("zone2.system-power standby")).toBe(true);
  expect(mockEiscp.commands.includes("audio-muting toggle")).toBe(true);
  expect(mockEiscp.commands.includes("preset up")).toBe(true);
  expect(mockEiscp.commands.includes("preset down")).toBe(true);
  expect(mockEiscp.commands.includes("input-selector cd")).toBe(true);
  expect(mockEiscp.commands.includes("multi-zone-all-up")).toBe(true);
  expect(mockEiscp.commands.includes("network-usb play")).toBe(true);
  expect(mockEiscp.commands.includes("network-usb trup")).toBe(true);
  expect(mockEiscp.commands.includes("network-usb trdn")).toBe(true);
  expect(mockEiscp.commands.includes("setup menu")).toBe(true);
  expect(mockEiscp.commands.includes("setup exit")).toBe(true);
  expect(mockEiscp.commands.includes("setup enter")).toBe(true);
  expect(mockEiscp.commands.includes("setup up")).toBe(true);
  expect(mockEiscp.commands.includes("setup down")).toBe(true);
  expect(mockEiscp.commands.includes("setup left")).toBe(true);
  expect(mockEiscp.commands.includes("setup right")).toBe(true);

  expect(mockEiscp.raws.includes("VL3UP1")).toBe(true);
  expect(mockEiscp.raws.includes("VL3DOWN1")).toBe(true);
  expect(mockEiscp.raws.includes("ZVL64")).toBe(true);
  expect(mockEiscp.raws.includes("MVL20")).toBe(true);
  expect(refreshCalls).toBe(1);
});

it("CommandSender handles relative volume ignore and throttle", async () => {
  const commandSenderModule = await import("../src/commandSender.js");
  const { CommandSender } = commandSenderModule as { CommandSender: new (...deps: any[]) => any };

  const config = makeConfig();
  config.volumeDisplay = "relative";
  config.queueThreshold = 999999;

  const mockDriver = {} as any;
  const mockEiscp = makeMockEiscp(false);
  const mockAvrState = {
    getSubSource: () => "spotify",
    refreshAvrState: async () => undefined
  } as any;

  const sender = new CommandSender(mockDriver, config, mockEiscp as any, mockAvrState, undefined);

  const mainEntity = { id: "TX-RZ50 192.168.2.103 main", attributes: { state: uc.MediaPlayerStates.On } } as any;

  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.On)).toBe(uc.StatusCodes.Ok);

  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.SelectSource, { source: "cd;rm -rf" })).toBe(uc.StatusCodes.BadRequest);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.SelectSource, { source: "raw $$$" })).toBe(uc.StatusCodes.BadRequest);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.SelectSource, { source: `raw ${"A".repeat(21)}` })).toBe(uc.StatusCodes.BadRequest);

  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Volume, { volume: 77 })).toBe(uc.StatusCodes.Ok);
  expect(mockEiscp.raws.length).toBe(0);

  (sender as any).lastCommandTime = Date.now();
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Next)).toBe(uc.StatusCodes.Ok);
  expect(mockEiscp.commands.includes("network-usb trup")).toBe(false);
});

it("CommandSender handles known simple commands via handleSimpleCommand fallthrough", async () => {
  const commandSenderModule = await import("../src/commandSender.js");
  const { CommandSender } = commandSenderModule as { CommandSender: new (...deps: any[]) => any };

  const mockDriver = {} as any;
  const mockEiscp = makeMockEiscp(true);
  const mockAvrState = {
    getSubSource: () => "spotify",
    refreshAvrState: async () => undefined
  } as any;

  const sender = new CommandSender(mockDriver, makeConfig(), mockEiscp as any, mockAvrState, undefined);

  const mainEntity = { id: "TX-RZ50 192.168.2.103 main", attributes: { state: uc.MediaPlayerStates.On } } as any;
  const zone2Entity = { id: "TX-RZ50 192.168.2.103 zone2", attributes: { state: uc.MediaPlayerStates.On } } as any;

  // Known simple command on main zone
  expect(await sender.sharedCmdHandler(mainEntity, "INPUT_CD")).toBe(uc.StatusCodes.Ok);
  expect(mockEiscp.commands.includes("input-selector cd")).toBe(true);

  // Known simple command on zone2
  expect(await sender.sharedCmdHandler(zone2Entity, "INPUT_CD")).toBe(uc.StatusCodes.Ok);
  expect(mockEiscp.commands.includes("zone2.input-selector cd")).toBe(true);

  // NSS simple command on main zone
  expect(await sender.sharedCmdHandler(mainEntity, "INPUT_TUNEIN")).toBe(uc.StatusCodes.Ok);
  expect(mockEiscp.commands.includes("input-selector tunein")).toBe(true);

  // Unknown simple command returns NotImplemented
  expect(await sender.sharedCmdHandler(mainEntity, "INPUT_NONEXISTENT")).toBe(uc.StatusCodes.NotImplemented);
});

it("CommandSender covers connection-failure, queueThreshold-fallback, main-zone volume, and edge SelectSource branches", async () => {
  const commandSenderModule = await import("../src/commandSender.js");
  const { CommandSender } = commandSenderModule as { CommandSender: new (...deps: any[]) => any };

  // Eiscp that fails to connect (connect does not set connected, waitForConnect throws)
  const failEiscp: MockEiscp = {
    connected: false,
    eiscpConfig: { sendDelay: 50 },
    commands: [],
    raws: [],
    async command(cmd: string): Promise<void> {
      this.commands.push(cmd);
    },
    async raw(cmd: string): Promise<void> {
      this.raws.push(cmd);
    },
    async connect(): Promise<void> {
      /* do nothing, stays disconnected */
    },
    async waitForConnect(): Promise<void> {
      throw new Error("not connected");
    }
  };

  // Config without queueThreshold, volumeScale, adjustVolumeDispl (so fallbacks are used)
  const cfg = {
    volumeDisplay: "absolute",
    avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main" }]
  } as any;

  const mockDriver = {} as any;
  const mockAvrState = { getSubSource: () => "spotify", refreshAvrState: async () => undefined } as any;
  const sender = new CommandSender(mockDriver, cfg, failEiscp as any, mockAvrState, undefined);

  const mainEntity = { id: "TX-RZ50 192.168.2.103 main", attributes: { state: uc.MediaPlayerStates.Off } } as any;

  // L55 — ensureEiscpConnected returns false → Timeout
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.On)).toBe(uc.StatusCodes.Timeout);
});

it("CommandSender routes main-zone VolumeUp/Down and Volume with fallback settings", async () => {
  const commandSenderModule = await import("../src/commandSender.js");
  const { CommandSender } = commandSenderModule as { CommandSender: new (...deps: any[]) => any };

  const eiscp: MockEiscp = {
    connected: true,
    eiscpConfig: { sendDelay: 1 },
    commands: [],
    raws: [],
    async command(cmd: string): Promise<void> {
      this.commands.push(cmd);
    },
    async raw(cmd: string): Promise<void> {
      this.raws.push(cmd);
    },
    async connect(): Promise<void> {
      this.connected = true;
    },
    async waitForConnect(): Promise<void> {
      return;
    }
  };

  const cfg = {
    volumeDisplay: "absolute",
    avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main" }]
  } as any;

  const mockDriver = {} as any;
  const mockAvrState = { getSubSource: () => "spotify", refreshAvrState: async () => undefined } as any;
  const sender = new CommandSender(mockDriver, cfg, eiscp as any, mockAvrState, undefined);

  const mainEntity = { id: "TX-RZ50 192.168.2.103 main", attributes: { state: uc.MediaPlayerStates.On } } as any;

  // Bypass throttle so queueThreshold fallback doesn't block commands
  (sender as any).lastCommandTime = -999999;

  // L126/L134 — main zone VolumeUp/VolumeDown → uses fallback "MVLUP1"/"MVLDOWN1"
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.VolumeUp)).toBe(uc.StatusCodes.Ok);
  expect(eiscp.raws.includes("MVLUP1")).toBe(true);

  (sender as any).lastCommandTime = -999999;
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.VolumeDown)).toBe(uc.StatusCodes.Ok);
  expect(eiscp.raws.includes("MVLDOWN1")).toBe(true);

  // L141 — Volume without volume param → returns Ok without sending
  (sender as any).lastCommandTime = -999999;
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Volume)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Volume, {})).toBe(uc.StatusCodes.Ok);

  // L148/L149/L152 — Volume with volume param uses fallback volumeScale (100), adjustVolumeDispl (true), and "MVL" prefix
  (sender as any).lastCommandTime = -999999;
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Volume, { volume: 50 })).toBe(uc.StatusCodes.Ok);
  expect(eiscp.raws.includes("MVL64")).toBe(true);
});

it("CommandSender covers SelectSource edge branches", async () => {
  const commandSenderModule = await import("../src/commandSender.js");
  const { CommandSender } = commandSenderModule as { CommandSender: new (...deps: any[]) => any };

  const eiscp: MockEiscp = {
    connected: true,
    eiscpConfig: { sendDelay: 1 },
    commands: [],
    raws: [],
    async command(cmd: string): Promise<void> {
      this.commands.push(cmd);
    },
    async raw(cmd: string): Promise<void> {
      this.raws.push(cmd);
    },
    async connect(): Promise<void> {
      this.connected = true;
    },
    async waitForConnect(): Promise<void> {
      return;
    }
  };

  const cfg = { queueThreshold: -1, avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main" }] } as any;

  const mockDriver = {} as any;
  const mockAvrState = { getSubSource: () => "spotify", refreshAvrState: async () => undefined } as any;
  const sender = new CommandSender(mockDriver, cfg, eiscp as any, mockAvrState, undefined);

  const mainEntity = { id: "TX-RZ50 192.168.2.103 main", attributes: { state: uc.MediaPlayerStates.On } } as any;

  // L173 — SelectSource without source param → returns Ok
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.SelectSource)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.SelectSource, {})).toBe(uc.StatusCodes.Ok);

  // L200 — non-input-selector valid command (enters else branch)
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.SelectSource, { source: "preset 5" })).toBe(uc.StatusCodes.Ok);
  expect(eiscp.commands.includes("preset 5")).toBe(true);

  // L189 — too long command (> USER_COMMAND = 250)
  const longCmd = "A".repeat(251);
  expect(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.SelectSource, { source: longCmd })).toBe(uc.StatusCodes.BadRequest);
});
