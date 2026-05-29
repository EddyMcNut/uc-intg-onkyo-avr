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
  t.deepEqual(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title),
    []
  );

  setTuneInBrowseContext(entityId, "My Presets");
  ingestTuneInListEntry(entityId, "U0-89.7 | WTMD (Alternative Rock)");
  ingestTuneInListEntry(entityId, "U1-America's Country (Country)");

  result = await player.browse({ paging: new uc.Paging(1, 10) });
  t.deepEqual(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title),
    ["America's Country (Country)", "WTMD (Alternative Rock)"]
  );
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

  ingestTuneInXmlEntries(
    entityId,
    '<?xml version="1.0" encoding="UTF-8"?><response status="ok"><items offset="0000" totalitems="000F"><item iconid="29" title="Browse" url="menu-1"/><item iconid="44" title="Stations" url="menu-2"/><item iconid="2F" title="Station A" url="0"/><item iconid="2F" title="Station B" url="1"/><item iconid="2F" title="Station C" url="2"/><item iconid="2F" title="Station D" url="3"/><item iconid="2F" title="Station E" url="4"/><item iconid="2F" title="Station F" url="5"/><item iconid="2F" title="Station G" url="6"/><item iconid="44" title="By Location" url="menu-3"/><item iconid="2F" title="Station H" url="7"/><item iconid="2F" title="Station I" url="8"/><item iconid="2F" title="Station J" url="9"/><item iconid="2F" title="Station K" url="10"/><item iconid="2F" title="Station L" url="11"/></items></response>'
  );

  const result = await player.browse({ paging: new uc.Paging(1, 10) });

  t.true(result instanceof uc.BrowseResult);
  t.deepEqual(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title),
    ["Station A", "Station B", "Station C", "Station D", "Station E", "Station F", "Station G", "Station H", "Station I", "Station J"]
  );
  t.is((result as uc.BrowseResult).pagination.count, 12);

  const pageResult = await player.browse({ paging: new uc.Paging(2, 10) });

  t.true(pageResult instanceof uc.BrowseResult);
  t.deepEqual(
    (pageResult as uc.BrowseResult).media?.items?.map((item) => item.title),
    ["Station K", "Station L"]
  );
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
  const processor = new ZoneAgnosticUpdateProcessor(mockDriver, { ip: "1.2.3.4", albumArtURL: "na" } as any, mockEiscp, avrStateManager);

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
  t.deepEqual(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title),
    ["America's Country (Country)", "WTMD (Alternative Rock)"]
  );
});

test.serial("Media player browse returns Tidal menu entries from AVR NLS updates", async (t) => {
  const registrarModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/entityRegistrar.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);
  const mediaBrowserModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/mediaBrowser.js")).href);

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { ingestTidalListEntry } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar();
  const entityId = "TX-RZ50 192.168.1.24 main";
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");

  ingestTidalListEntry(entityId, "U0-New %s");
  ingestTidalListEntry(entityId, "U1-TIDAL Rising %s");
  ingestTidalListEntry(entityId, "U2-Playlists %s");

  const result = await player.browse({ paging: new uc.Paging(1, 10) });

  t.true(result instanceof uc.BrowseResult);
  t.is((result as uc.BrowseResult).media?.title, "Tidal");
  t.deepEqual(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title),
    ["New", "TIDAL Rising", "Playlists"]
  );
  t.deepEqual(
    (result as uc.BrowseResult).media?.items?.map((item) => item.media_id),
    ["tidal:menu:1:New", "tidal:menu:2:TIDAL%20Rising", "tidal:menu:3:Playlists"]
  );
});

test.serial("Media player browse defaults to 25 items per page when paging is omitted", async (t) => {
  const registrarModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/entityRegistrar.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);
  const mediaBrowserModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/mediaBrowser.js")).href);

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { ingestTidalListEntry } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar();
  const entityId = "TX-RZ50 192.168.1.25 main";
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");

  for (let index = 0; index < 30; index += 1) {
    ingestTidalListEntry(entityId, `U${index}-Track ${index + 1} %s`);
  }

  const result = await player.browse({} as uc.BrowseOptions);

  t.true(result instanceof uc.BrowseResult);
  t.is((result as uc.BrowseResult).media?.items?.length, 25);
  t.is((result as uc.BrowseResult).pagination.page, 1);
  t.is((result as uc.BrowseResult).pagination.limit, 25);
  t.is((result as uc.BrowseResult).pagination.count, 30);
});

test.serial("Tidal browse survives DAB-to-NET transition when NLT/NLS arrive early", async (t) => {
  const registrarModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/entityRegistrar.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);
  const processorModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/zoneAgnosticUpdateProcessor.js")).href);

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { ZoneAgnosticUpdateProcessor } = processorModule as any;

  const mockDriver = { updateEntityAttributes: () => true } as any;
  const mockEiscp = {
    command: async () => undefined,
    raw: async () => undefined
  } as any;

  const entityId = "TX-RZ50 192.168.2.103 main";
  const processor = new ZoneAgnosticUpdateProcessor(mockDriver, { ip: "192.168.2.103", albumArtURL: "na" } as any, mockEiscp, avrStateManager);
  const registrar = new EntityRegistrar();
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  avrStateManager.setPowerState(entityId, "on", mockDriver);
  avrStateManager.setSource(entityId, "dab", undefined, undefined, mockDriver);

  await processor.handleNlt(entityId, "Tidal", "main");
  await processor.handleNls(entityId, "U0-New %s");
  await processor.handleNls(entityId, "U1-TIDAL Rising %s");
  await processor.handleNls(entityId, "U2-Playlists %s");

  avrStateManager.setSource(entityId, "net", undefined, undefined, mockDriver);

  const result = await player.browse({ paging: new uc.Paging(1, 10) });
  t.true(result instanceof uc.BrowseResult);
  t.is((result as uc.BrowseResult).media?.title, "Tidal");
  t.deepEqual(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title),
    ["New", "TIDAL Rising", "Playlists"]
  );
});

test.serial("Repeated NLT tidal updates do not clear existing Tidal menu options", async (t) => {
  const registrarModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/entityRegistrar.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);
  const processorModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/zoneAgnosticUpdateProcessor.js")).href);

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { ZoneAgnosticUpdateProcessor } = processorModule as any;

  const mockDriver = { updateEntityAttributes: () => true } as any;
  const mockEiscp = {
    command: async () => undefined,
    raw: async () => undefined
  } as any;

  const entityId = "TX-RZ50 192.168.2.104 main";
  const processor = new ZoneAgnosticUpdateProcessor(mockDriver, { ip: "192.168.2.104", albumArtURL: "na" } as any, mockEiscp, avrStateManager);
  const registrar = new EntityRegistrar();
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  avrStateManager.setPowerState(entityId, "on", mockDriver);
  avrStateManager.setSource(entityId, "net", undefined, undefined, mockDriver);
  avrStateManager.setSubSource(entityId, "spotify", undefined, undefined, mockDriver);

  await processor.handleNlt(entityId, "Tidal", "main");
  await processor.handleNls(entityId, "U0-New %s");
  await processor.handleNls(entityId, "U1-TIDAL Rising %s");
  await processor.handleNls(entityId, "U2-Playlists %s");

  await processor.handleNlt(entityId, "Tidal", "main");

  const result = await player.browse({ paging: new uc.Paging(1, 10) });
  t.true(result instanceof uc.BrowseResult);
  t.deepEqual(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title),
    ["New", "TIDAL Rising", "Playlists"]
  );
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
  const processor = new ZoneAgnosticUpdateProcessor(mockDriver, { ip: "1.2.3.4", albumArtURL: "na" } as any, mockEiscp, avrStateManager);

  avrStateManager.setPowerState(entityId, "on", mockDriver);
  avrStateManager.setSource(entityId, "net", undefined, undefined, mockDriver);

  await processor.handleNlt(entityId, "TuneIn", "main");

  t.true(rawCommands.includes("NTCTOP"));
  t.true(rawCommands.includes("NTCSELECT"));
  t.true(rawCommands.includes("NLSI00001"));
  t.true(rawCommands.some((cmd) => cmd.startsWith("NLAL")));
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
  const sender = new CommandSender({ updateEntityAttributes: () => true } as any, { avrs: [{ model: "M", ip: "1.2.3.4", zone: "main", port: 60128, netMenuDelay: 0 }] }, new MockEiscp() as any, null);

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
  const sender = new CommandSender({ updateEntityAttributes: () => true } as any, { avrs: [{ model: "M", ip: "1.2.3.4", zone: "main", port: 60128, netMenuDelay: 0 }] }, eiscp as any, null);

  avrStateManager.setSource(entityId, "cd");
  avrStateManager.setSubSource(entityId, "unknown");

  const status = await sender.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tunein:preset:2",
    media_type: uc.KnownMediaContentType.Radio
  } as any);

  t.is(status, uc.StatusCodes.Ok);
  t.deepEqual(eiscp.commands, ["input-selector tunein", "tunein-preset 2"]);
});

test.serial("CommandSender play_media routes Tidal menu IDs to NLSI", async (t) => {
  const senderModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/commandSender.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);

  const CommandSender = senderModule.CommandSender as any;
  const { avrStateManager } = avrStateModule as any;

  class MockEiscp {
    public connected = true;
    public commands: string[] = [];
    public rawCommands: string[] = [];

    async waitForConnect() {
      return;
    }

    async command(cmd: string) {
      this.commands.push(cmd);
    }

    async raw(cmd: string) {
      this.rawCommands.push(cmd);
    }
  }

  const entityId = "M 1.2.3.5 main";
  const eiscp = new MockEiscp();
  const sender = new CommandSender({ updateEntityAttributes: () => true } as any, { avrs: [{ model: "M", ip: "1.2.3.5", zone: "main", port: 60128, netMenuDelay: 0 }] }, eiscp as any, null);

  avrStateManager.setSource(entityId, "cd");
  avrStateManager.setSubSource(entityId, "unknown");

  const status = await sender.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tidal:menu:4",
    media_type: "tidal://menu"
  } as any);

  t.is(status, uc.StatusCodes.Ok);
  t.deepEqual(eiscp.commands, ["input-selector tidal"]);
  t.deepEqual(eiscp.rawCommands, ["NLSI00004"]);
});

test.serial("CommandSender remaps stale Tidal index using title encoded in media_id", async (t) => {
  const senderModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/commandSender.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);
  const mediaBrowserModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/mediaBrowser.js")).href);

  const CommandSender = senderModule.CommandSender as any;
  const { avrStateManager } = avrStateModule as any;
  const { ingestTidalListEntry } = mediaBrowserModule as any;

  class MockEiscp {
    public connected = true;
    public commands: string[] = [];
    public rawCommands: string[] = [];

    async waitForConnect() {
      return;
    }

    async command(cmd: string) {
      this.commands.push(cmd);
    }

    async raw(cmd: string) {
      this.rawCommands.push(cmd);
    }
  }

  const entityId = "M 1.2.3.7 main";
  const eiscp = new MockEiscp();
  const sender = new CommandSender({ updateEntityAttributes: () => true } as any, { avrs: [{ model: "M", ip: "1.2.3.7", zone: "main", port: 60128, netMenuDelay: 0 }] }, eiscp as any, null);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");

  ingestTidalListEntry(entityId, "U0-Playlists %s");
  ingestTidalListEntry(entityId, "U1-New %s");

  const status = await sender.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tidal:menu:9:Playlists",
    media_type: "tidal://menu"
  } as any);

  t.is(status, uc.StatusCodes.Ok);
  t.deepEqual(eiscp.commands, []);
  t.deepEqual(eiscp.rawCommands, ["NLSI00001"]);
});

test.serial("CommandSender first selection after Main Tidal Menu skips pre-list command", async (t) => {
  const senderModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/commandSender.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);
  const tidalStoreModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/tidalBrowserStore.js")).href);

  const CommandSender = senderModule.CommandSender as any;
  const { avrStateManager } = avrStateModule as any;
  const { getTidalBrowseState } = tidalStoreModule as any;

  class MockEiscp {
    public connected = true;
    public commands: string[] = [];
    public rawCommands: string[] = [];

    async waitForConnect() {
      return;
    }

    async command(cmd: string) {
      this.commands.push(cmd);
    }

    async raw(cmd: string) {
      this.rawCommands.push(cmd);
    }
  }

  const entityId = "M 1.2.3.8 main";
  const eiscp = new MockEiscp();
  const sender = new CommandSender({ updateEntityAttributes: () => true } as any, { avrs: [{ model: "M", ip: "1.2.3.8", zone: "main", port: 60128, netMenuDelay: 0 }] }, eiscp as any, null);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");
  const browseState47 = getTidalBrowseState(entityId);
  if (browseState47) browseState47.traceNextSelectionAfterMainMenu = true;

  const status = await sender.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tidal:menu:3:Playlists",
    media_type: "tidal://menu"
  } as any);

  t.is(status, uc.StatusCodes.Ok);
  t.deepEqual(eiscp.commands, []);
  t.deepEqual(eiscp.rawCommands, ["NLSI00003"]);
});

test.serial("CommandSender in-Tidal track selection uses direct NLSI when AVR is in list mode", async (t) => {
  const senderModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/commandSender.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);
  const storeModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/tidalBrowserStore.js")).href);

  const CommandSender = senderModule.CommandSender as any;
  const { avrStateManager } = avrStateModule as any;
  const { getTidalBrowseState } = storeModule as any;

  class MockEiscp {
    public connected = true;
    public commands: string[] = [];
    public rawCommands: string[] = [];
    async waitForConnect() {
      return;
    }
    async command(cmd: string) {
      this.commands.push(cmd);
    }
    async raw(cmd: string) {
      this.rawCommands.push(cmd);
    }
  }

  const entityId = "M 1.2.3.9 main";
  const eiscp = new MockEiscp();
  const sender = new CommandSender({ updateEntityAttributes: () => true } as any, { avrs: [{ model: "M", ip: "1.2.3.9", zone: "main", port: 60128, netMenuDelay: 0 }] }, eiscp as any, null);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");
  // Simulate a song playing in the background while user was browsing menus
  avrStateManager.setPlaybackStatus(entityId, "playing", undefined);
  // Browse callback just finished streaming the NLS list — AVR is in list mode
  const browseState48 = getTidalBrowseState(entityId);
  if (browseState48) browseState48.listModeActive = true;

  const status = await sender.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tidal:menu:4:Chattahoochee%20-%20Alan%20Jackson",
    media_type: "tidal://menu"
  } as any);

  t.is(status, uc.StatusCodes.Ok);
  // listModeActive flag causes pre-list to be skipped even though a song is playing
  t.deepEqual(eiscp.commands, []);
  t.deepEqual(eiscp.rawCommands, ["NLSI00004"]);
});

test.serial("CommandSender in-Tidal track selection sends list before NLSI when AVR is playing", async (t) => {
  const senderModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/commandSender.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);

  const CommandSender = senderModule.CommandSender as any;
  const { avrStateManager } = avrStateModule as any;

  class MockEiscp {
    public connected = true;
    public commands: string[] = [];
    public rawCommands: string[] = [];
    async waitForConnect() {
      return;
    }
    async command(cmd: string) {
      this.commands.push(cmd);
    }
    async raw(cmd: string) {
      this.rawCommands.push(cmd);
    }
  }

  const entityId = "M 1.2.3.10 main";
  const eiscp = new MockEiscp();
  const sender = new CommandSender({ updateEntityAttributes: () => true } as any, { avrs: [{ model: "M", ip: "1.2.3.10", zone: "main", port: 60128, netMenuDelay: 0 }] }, eiscp as any, null);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");
  avrStateManager.setPlaybackStatus(entityId, "playing", undefined);

  const status = await sender.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tidal:menu:4:Chattahoochee%20-%20Alan%20Jackson",
    media_type: "tidal://menu"
  } as any);

  t.is(status, uc.StatusCodes.Ok);
  t.deepEqual(eiscp.commands, ["network-usb list"]);
  t.deepEqual(eiscp.rawCommands, ["NLSI00004"]);
});

test.serial("CommandSender in-Tidal menu selection uses direct NLSI even when AVR is playing", async (t) => {
  const senderModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/commandSender.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);

  const CommandSender = senderModule.CommandSender as any;
  const { avrStateManager } = avrStateModule as any;

  class MockEiscp {
    public connected = true;
    public commands: string[] = [];
    public rawCommands: string[] = [];
    async waitForConnect() {
      return;
    }
    async command(cmd: string) {
      this.commands.push(cmd);
    }
    async raw(cmd: string) {
      this.rawCommands.push(cmd);
    }
  }

  const entityId = "M 1.2.3.11 main";
  const eiscp = new MockEiscp();
  const sender = new CommandSender({ updateEntityAttributes: () => true } as any, { avrs: [{ model: "M", ip: "1.2.3.11", zone: "main", port: 60128, netMenuDelay: 0 }] }, eiscp as any, null);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");
  avrStateManager.setPlaybackStatus(entityId, "playing", undefined);

  const status = await sender.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tidal:menu:3:Playlists",
    media_type: "tidal://menu"
  } as any);

  t.is(status, uc.StatusCodes.Ok);
  t.deepEqual(eiscp.commands, []);
  t.deepEqual(eiscp.rawCommands, ["NLSI00003"]);
});

test.serial("CommandSender play_media routes Main Tidal Menu to input-selector tidal", async (t) => {
  const senderModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/commandSender.js")).href);
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);

  const CommandSender = senderModule.CommandSender as any;
  const { avrStateManager } = avrStateModule as any;

  const commandCalls: string[] = [];

  class MockEiscp {
    public connected = true;
    async connect() {}
    async waitForConnect() {}
    async command(cmd: string) {
      commandCalls.push(cmd);
    }
    async raw() {}
  }

  const entityId = "M 1.2.3.6 main";
  const mockDriver = { updateEntityAttributes: () => true } as any;
  const mockReceiver = {} as any;
  const sender = new CommandSender(mockDriver, { avrs: [{ model: "M", ip: "1.2.3.6", zone: "main", netMenuDelay: 0 }] } as any, new MockEiscp(), mockReceiver);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");

  const result = await sender.sharedCmdHandler({ id: entityId } as any, uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tidal:main-menu",
    media_type: "tidal://menu"
  });

  t.is(result, uc.StatusCodes.Ok);
  t.deepEqual(commandCalls, ["input-selector tidal"]);
});
