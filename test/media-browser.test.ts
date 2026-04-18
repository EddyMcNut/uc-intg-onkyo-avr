import test from "ava";
import * as uc from "@unfoldedcircle/integration-api";
import { pathToFileURL } from "url";
import path from "path";

test.serial("Media player browse returns TuneIn presets only for NET TuneIn", async (t) => {
  const registrarModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/entityRegistrar.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);
  const mediaBrowserModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/mediaBrowser.js")).href);

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { setTuneInBrowseContext, ingestTuneInListEntry } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar();
  const entityId = "TX-RZ50 192.168.1.2 main";
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  const unavailable = await player.browse({ paging: new uc.Paging(1, 10) });
  t.is(unavailable, uc.StatusCodes.NotFound);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tunein");
  setTuneInBrowseContext(entityId, "My Presets");
  ingestTuneInListEntry(entityId, "U0-89.7 | WTMD (Alternative Rock)");
  ingestTuneInListEntry(entityId, "U1-America's Country (Country)");
  ingestTuneInListEntry(entityId, "U2-Decibel EuroDance (Euro Hits)");

  const result = await player.browse({ paging: new uc.Paging(1, 2) });
  t.true(result instanceof uc.BrowseResult);

  const browseResult = result as uc.BrowseResult;
  t.is(browseResult.media?.title, "TuneIn");
  t.is(browseResult.media?.media_id, "tunein:root");
  t.is(browseResult.media?.items?.length, 2);
  t.deepEqual(
    browseResult.media?.items?.map((item) => item.title),
    ["America's Country (Country)", "Decibel EuroDance (Euro Hits)"]
  );
  t.true((browseResult.media?.items?.[0].thumbnail || "").startsWith("data:image/"));
  t.true((browseResult.media?.items?.[0].thumbnail || "").length < 4000);
  t.is(browseResult.pagination.page, 1);
  t.is(browseResult.pagination.limit, 2);
  t.is(browseResult.pagination.count, 3);

  const leafResult = await player.browse({
    media_id: "tunein:preset:3",
    media_type: uc.KnownMediaContentType.Radio,
    paging: new uc.Paging(1, 10)
  });

  t.true(leafResult instanceof uc.BrowseResult);
  t.is((leafResult as uc.BrowseResult).media?.title, "Preset 3");
  t.true((leafResult as uc.BrowseResult).media?.can_play ?? false);
});

test.serial("Media player browse ignores TuneIn menu entries until My Presets is active", async (t) => {
  const registrarModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/entityRegistrar.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);
  const mediaBrowserModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/mediaBrowser.js")).href);

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { ingestTuneInListEntry, setTuneInBrowseContext } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar();
  const entityId = "TX-RZ50 192.168.1.21 main";
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tunein");
  ingestTuneInListEntry(entityId, "U0-Login");
  ingestTuneInListEntry(entityId, "U1-TuneIn");
  ingestTuneInListEntry(entityId, "U2-Spotify");

  let result = await player.browse({ paging: new uc.Paging(1, 10) });

  t.true(result instanceof uc.BrowseResult);
  t.deepEqual((result as uc.BrowseResult).media?.items?.map((item) => item.title), []);

  setTuneInBrowseContext(entityId, "My Presets");
  ingestTuneInListEntry(entityId, "U0-89.7 | WTMD (Alternative Rock)");
  ingestTuneInListEntry(entityId, "U1-America's Country (Country)");

  result = await player.browse({ paging: new uc.Paging(1, 10) });
  t.deepEqual((result as uc.BrowseResult).media?.items?.map((item) => item.title), [
    "America's Country (Country)",
    "WTMD (Alternative Rock)"
  ]);
});

test.serial("TuneIn browse root exposes all presets when the list is longer than 10", async (t) => {
  const registrarModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/entityRegistrar.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);
  const mediaBrowserModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/mediaBrowser.js")).href);

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { setTuneInBrowseContext, ingestTuneInListEntry, ingestTuneInXmlEntries } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar();
  const entityId = "TX-RZ50 192.168.1.3 main";
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tunein");
  setTuneInBrowseContext(entityId, "My Presets");

  for (let index = 0; index < 10; index += 1) {
    ingestTuneInListEntry(entityId, `U${index}-Station ${String.fromCharCode(65 + index)}`);
  }

  const pagedWindow = ["Station B", "Station C", "Station D", "Station E", "Station F", "Station G", "Station H", "Station I", "Station J", "Station K"];
  pagedWindow.forEach((title, index) => ingestTuneInListEntry(entityId, `U${index}-${title}`));
  const finalWindow = ["Station C", "Station D", "Station E", "Station F", "Station G", "Station H", "Station I", "Station J", "Station K", "Station L"];
  finalWindow.forEach((title, index) => ingestTuneInListEntry(entityId, `U${index}-${title}`));

  ingestTuneInXmlEntries(entityId, '<?xml version="1.0" encoding="UTF-8"?><response status="ok"><items offset="0000" totalitems="000F"><item iconid="29" title="Browse" url="menu-1"/><item iconid="44" title="Stations" url="menu-2"/><item iconid="2F" title="Station A" url="0"/><item iconid="2F" title="Station B" url="1"/><item iconid="2F" title="Station C" url="2"/><item iconid="2F" title="Station D" url="3"/><item iconid="2F" title="Station E" url="4"/><item iconid="2F" title="Station F" url="5"/><item iconid="2F" title="Station G" url="6"/><item iconid="44" title="By Location" url="menu-3"/><item iconid="2F" title="Station H" url="7"/><item iconid="2F" title="Station I" url="8"/><item iconid="2F" title="Station J" url="9"/><item iconid="2F" title="Station K" url="10"/><item iconid="2F" title="Station L" url="11"/></items></response>');

  const result = await player.browse({ paging: new uc.Paging(1, 10) });

  t.true(result instanceof uc.BrowseResult);
  t.deepEqual((result as uc.BrowseResult).media?.items?.map((item) => item.title), [
    "Station A",
    "Station B",
    "Station C",
    "Station D",
    "Station E",
    "Station F",
    "Station G",
    "Station H",
    "Station I",
    "Station J"
  ]);
  t.is((result as uc.BrowseResult).pagination.count, 12);

  const pageResult = await player.browse({ paging: new uc.Paging(2, 10) });

  t.true(pageResult instanceof uc.BrowseResult);
  t.deepEqual((pageResult as uc.BrowseResult).media?.items?.map((item) => item.title), [
    "Station K",
    "Station L"
  ]);
});

test.serial("TuneIn selection keeps subsource and state so browse can be repeated", async (t) => {
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);
  const mediaBrowserModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/mediaBrowser.js")).href);
  const processorModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/zoneAgnosticUpdateProcessor.js")).href);

  const { avrStateManager } = avrStateModule as any;
  const { isMediaBrowsingAvailable } = mediaBrowserModule as any;
  const { ZoneAgnosticUpdateProcessor } = processorModule as any;

  const capturedStates = new Map<string, uc.MediaPlayerStates>();
  const mockDriver = {
    updateEntityAttributes: (id: string, attrs: { [key: string]: string | number | boolean }) => {
      const state = attrs[uc.MediaPlayerAttributes.State] as uc.MediaPlayerStates | undefined;
      if (state) {
        capturedStates.set(id, state);
      }
      return true;
    }
  } as any;

  const mockEiscp = {
    command: async () => undefined,
    raw: async () => undefined
  } as any;

  const entityId = "M 1.2.3.4 main";
  const processor = new ZoneAgnosticUpdateProcessor(mockDriver, { ip: "1.2.3.4", albumArtURL: "na" } as any, mockEiscp);

  avrStateManager.setPowerState(entityId, "on", mockDriver);
  avrStateManager.setSource(entityId, "net", undefined, undefined, mockDriver);
  avrStateManager.setSubSource(entityId, "tunein", undefined, undefined, mockDriver);

  await processor.handleFld(entityId, "WTMD (Alternative Rock)", "main");

  t.is(avrStateManager.getSubSource(entityId), "tunein");
  t.true(isMediaBrowsingAvailable(entityId));
  t.is(capturedStates.get(entityId), uc.MediaPlayerStates.Playing);
});

test.serial("TuneIn preset cache survives post-select menu updates", async (t) => {
  const registrarModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/entityRegistrar.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);
  const mediaBrowserModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/mediaBrowser.js")).href);

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { setTuneInBrowseContext, ingestTuneInListEntry } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar();
  const entityId = "TX-RZ50 192.168.1.22 main";
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tunein");
  setTuneInBrowseContext(entityId, "My Presets");
  ingestTuneInListEntry(entityId, "U0-89.7 | WTMD (Alternative Rock)");
  ingestTuneInListEntry(entityId, "U1-America's Country (Country)");

  let result = await player.browse({ paging: new uc.Paging(1, 10) });
  t.true(result instanceof uc.BrowseResult);
  t.is((result as uc.BrowseResult).media?.items?.length, 2);

  setTuneInBrowseContext(entityId, "Now Playing");
  ingestTuneInListEntry(entityId, "U0-Search Stations");

  result = await player.browse({ paging: new uc.Paging(1, 10) });
  t.true(result instanceof uc.BrowseResult);
  t.deepEqual((result as uc.BrowseResult).media?.items?.map((item) => item.title), [
    "America's Country (Country)",
    "WTMD (Alternative Rock)"
  ]);
});

test.serial("TuneIn service selection preloads My Presets for browsing", async (t) => {
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);
  const processorModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/zoneAgnosticUpdateProcessor.js")).href);

  const { avrStateManager } = avrStateModule as any;
  const { ZoneAgnosticUpdateProcessor } = processorModule as any;

  const rawCommands: string[] = [];
  const mockDriver = { updateEntityAttributes: () => true } as any;
  const mockEiscp = {
    config: { netMenuDelay: 0, tuneinPresetPosition: 1 },
    command: async () => undefined,
    raw: async (cmd: string) => {
      rawCommands.push(cmd);
    }
  } as any;

  const entityId = "M 1.2.3.4 main";
  const processor = new ZoneAgnosticUpdateProcessor(mockDriver, { ip: "1.2.3.4", albumArtURL: "na" } as any, mockEiscp);

  avrStateManager.setPowerState(entityId, "on", mockDriver);
  avrStateManager.setSource(entityId, "net", undefined, undefined, mockDriver);

  await processor.handleNlt(entityId, "TuneIn", "main");

  t.true(rawCommands.includes("NTCTOP"));
  t.true(rawCommands.includes("NTCSELECT"));
  t.true(rawCommands.includes("NLSI00001"));
  t.true(rawCommands.some((cmd) => cmd.startsWith("NLAL")));
  t.true(rawCommands.includes("NTCDOWN"));
});

test.serial("CommandSender silently absorbs shuffle, repeat, and browse commands", async (t) => {
  const senderModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/commandSender.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);

  const CommandSender = senderModule.CommandSender as any;
  const { avrStateManager } = avrStateModule as any;

  class MockEiscp {
    public connected = true;
    async waitForConnect() {
      return;
    }
    async command() {
      return;
    }
    async raw() {
      return;
    }
  }

  const entityId = "M 1.2.3.4 main";
  const sender = new CommandSender(
    { updateEntityAttributes: () => true } as any,
    { avrs: [{ model: "M", ip: "1.2.3.4", zone: "main", port: 60128, netMenuDelay: 0 }] },
    new MockEiscp() as any,
    null
  );

  avrStateManager.setPowerState(entityId, "on");
  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tunein");

  const entity = new uc.MediaPlayer(entityId, { en: entityId }, {});

  t.is(await sender.sharedCmdHandler(entity, uc.MediaPlayerCommands.Shuffle), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(entity, uc.MediaPlayerCommands.Repeat), uc.StatusCodes.Ok);
  t.is(await sender.sharedCmdHandler(entity, "browse"), uc.StatusCodes.Ok);
});

test.serial("CommandSender play_media routes TuneIn preset IDs to tunein-preset", async (t) => {
  const senderModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/commandSender.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);

  const CommandSender = senderModule.CommandSender as any;
  const { avrStateManager } = avrStateModule as any;

  class MockEiscp {
    public connected = true;
    public commands: string[] = [];

    async waitForConnect() {
      return;
    }

    async command(cmd: string) {
      this.commands.push(cmd);
    }
  }

  const entityId = "M 1.2.3.4 main";
  const eiscp = new MockEiscp();
  const sender = new CommandSender(
    { updateEntityAttributes: () => true } as any,
    { avrs: [{ model: "M", ip: "1.2.3.4", zone: "main", port: 60128, netMenuDelay: 0 }] },
    eiscp as any,
    null
  );

  avrStateManager.setSource(entityId, "cd");
  avrStateManager.setSubSource(entityId, "unknown");

  const status = await sender.sharedCmdHandler(
    new uc.MediaPlayer(entityId, { en: entityId }, {}),
    uc.MediaPlayerCommands.PlayMedia,
    { media_id: "tunein:preset:2", media_type: uc.KnownMediaContentType.Radio } as any
  );

  t.is(status, uc.StatusCodes.Ok);
  t.deepEqual(eiscp.commands, ["input-selector tunein", "tunein-preset 2"]);
});