import test from "ava";
import * as uc from "@unfoldedcircle/integration-api";
import path from "path";
import { pathToFileURL } from "url";

async function importDist(modulePath: string): Promise<Record<string, unknown>> {
  return import(pathToFileURL(path.resolve(process.cwd(), modulePath)).href);
}

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

test.serial("CommandSender rejects malformed entity ids and unknown AVR targets", async (t) => {
  const commandSenderModule = await importDist("dist/src/commandSender.js");
  const { CommandSender } = commandSenderModule as { CommandSender: new (...deps: any[]) => any };

  const mockDriver = {} as any;
  const mockEiscp = makeMockEiscp(true);
  const mockAvrState = {
    getSubSource: () => "spotify",
    refreshAvrState: async () => undefined
  } as any;

  const sender = new CommandSender(mockDriver, makeConfig(), mockEiscp as any, mockAvrState, undefined);

  const malformed = await sender.sharedCmdHandler({ id: "invalid" } as any, uc.MediaPlayerCommands.On);
  t.is(malformed, uc.StatusCodes.BadRequest);

  const unknown = await sender.sharedCmdHandler({ id: "Other 1.2.3.4 main" } as any, uc.MediaPlayerCommands.On);
  t.is(unknown, uc.StatusCodes.BadRequest);
});

test.serial("CommandSender executes core command branches and zone-specific routing", async (t) => {
  const commandSenderModule = await importDist("dist/src/commandSender.js");
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

  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.On), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Off), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Toggle), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(zone2Entity, uc.MediaPlayerCommands.Toggle), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.MuteToggle), uc.StatusCodes.Ok);

  t.is(await sender.sharedCmdHandler(zone3Entity, uc.MediaPlayerCommands.VolumeUp), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(zone3Entity, uc.MediaPlayerCommands.VolumeDown), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(zone2Entity, uc.MediaPlayerCommands.Volume, { volume: 50 }), uc.StatusCodes.Ok);

  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.ChannelUp), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.ChannelDown), uc.StatusCodes.Ok);

  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.SelectSource, { source: "cd" }), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.SelectSource, { source: "multi-zone-all-up" }), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.SelectSource, { source: "raw mvl20" }), uc.StatusCodes.Ok);

  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.PlayPause), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Next), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Previous), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Settings), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Home), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.CursorEnter), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.CursorUp), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.CursorDown), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.CursorLeft), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.CursorRight), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Info), uc.StatusCodes.Ok);

  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.PlayMedia, {}), uc.StatusCodes.NotFound);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Shuffle), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Repeat), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, "browse"), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(mainEntity, "unknown-command"), uc.StatusCodes.NotImplemented);

  t.true(mockEiscp.commands.includes("system-power on"));
  t.true(mockEiscp.commands.includes("system-power standby"));
  t.true(mockEiscp.commands.includes("zone2.system-power standby"));
  t.true(mockEiscp.commands.includes("audio-muting toggle"));
  t.true(mockEiscp.commands.includes("preset up"));
  t.true(mockEiscp.commands.includes("preset down"));
  t.true(mockEiscp.commands.includes("cd"));
  t.true(mockEiscp.commands.includes("multi-zone-all-up"));
  t.true(mockEiscp.commands.includes("network-usb play"));
  t.true(mockEiscp.commands.includes("network-usb trup"));
  t.true(mockEiscp.commands.includes("network-usb trdn"));
  t.true(mockEiscp.commands.includes("setup menu"));
  t.true(mockEiscp.commands.includes("setup exit"));
  t.true(mockEiscp.commands.includes("setup enter"));
  t.true(mockEiscp.commands.includes("setup up"));
  t.true(mockEiscp.commands.includes("setup down"));
  t.true(mockEiscp.commands.includes("setup left"));
  t.true(mockEiscp.commands.includes("setup right"));

  t.true(mockEiscp.raws.includes("VL3UP1"));
  t.true(mockEiscp.raws.includes("VL3DOWN1"));
  t.true(mockEiscp.raws.includes("ZVL64"));
  t.true(mockEiscp.raws.includes("MVL20"));
  t.is(refreshCalls, 1);
});

test.serial("CommandSender enforces source validation, relative volume ignore, and throttle", async (t) => {
  const commandSenderModule = await importDist("dist/src/commandSender.js");
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

  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.On), uc.StatusCodes.Ok);

  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.SelectSource, { source: "cd;rm -rf" }), uc.StatusCodes.BadRequest);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.SelectSource, { source: "raw $$$" }), uc.StatusCodes.BadRequest);
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.SelectSource, { source: `raw ${"A".repeat(21)}` }), uc.StatusCodes.BadRequest);

  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Volume, { volume: 77 }), uc.StatusCodes.Ok);
  t.is(mockEiscp.raws.length, 0);

  (sender as any).lastCommandTime = Date.now();
  t.is(await sender.sharedCmdHandler(mainEntity, uc.MediaPlayerCommands.Next), uc.StatusCodes.Ok);
  t.false(mockEiscp.commands.includes("network-usb trup"));
});

test.serial("CommandSender handles known simple commands via handleSimpleCommand fallthrough", async (t) => {
  const commandSenderModule = await importDist("dist/src/commandSender.js");
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
  t.is(await sender.sharedCmdHandler(mainEntity, "INPUT_CD"), uc.StatusCodes.Ok);
  t.true(mockEiscp.commands.includes("input-selector cd"));

  // Known simple command on zone2
  t.is(await sender.sharedCmdHandler(zone2Entity, "INPUT_CD"), uc.StatusCodes.Ok);
  t.true(mockEiscp.commands.includes("zone2.input-selector cd"));

  // NSS simple command on main zone
  t.is(await sender.sharedCmdHandler(mainEntity, "INPUT_TUNEIN"), uc.StatusCodes.Ok);
  t.true(mockEiscp.commands.includes("input-selector tunein"));

  // Unknown simple command returns NotImplemented
  t.is(await sender.sharedCmdHandler(mainEntity, "INPUT_NONEXISTENT"), uc.StatusCodes.NotImplemented);
});
