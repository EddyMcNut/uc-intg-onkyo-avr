import { describe, it, expect } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";
import path from "path";

it("Media player browse returns TuneIn presets only for NET TuneIn", async () => {
  const registrarModule = await import("../src/entityRegistrar.js");
  const avrStateModule = await import("../src/avrState.js");
  const mediaBrowserModule = await import("../src/mediaBrowser.js");

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { setTuneInBrowseContext, ingestTuneInListEntry } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar(avrStateManager);
  const entityId = "TX-RZ50 192.168.1.2 main";
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  const unavailable = await player.browse({ paging: new uc.Paging(1, 10) });
  expect(unavailable).toBe(uc.StatusCodes.NotFound);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tunein");
  setTuneInBrowseContext(entityId, "My Presets");
  ingestTuneInListEntry(entityId, "U0-89.7 | WTMD (Alternative Rock)");
  ingestTuneInListEntry(entityId, "U1-America's Country (Country)");
  ingestTuneInListEntry(entityId, "U2-Decibel EuroDance (Euro Hits)");

  const result = await player.browse({ paging: new uc.Paging(1, 2) });
  expect(result).toBeInstanceOf(uc.BrowseResult);

  const browseResult = result as uc.BrowseResult;
  expect(browseResult.media?.title).toBe("TuneIn");
  expect(browseResult.media?.media_id).toBe("tunein:root");
  expect(browseResult.media?.items?.length).toBe(2);
  expect(
    browseResult.media?.items?.map((item) => item.title)
  ).toEqual(["America's Country (Country)", "Decibel EuroDance (Euro Hits)"]);
  expect((browseResult.media?.items?.[0].thumbnail || "").startsWith("data:image/")).toBe(true);
  expect((browseResult.media?.items?.[0].thumbnail || "").length < 4000).toBe(true);
  expect(browseResult.pagination.page).toBe(1);
  expect(browseResult.pagination.limit).toBe(2);
  expect(browseResult.pagination.count).toBe(3);

  const leafResult = await player.browse({
    media_id: "tunein:preset:3",
    media_type: uc.KnownMediaContentType.Radio,
    paging: new uc.Paging(1, 10)
  });

  expect(leafResult).toBeInstanceOf(uc.BrowseResult);
  expect((leafResult as uc.BrowseResult).media?.title).toBe("Preset 3");
  expect((leafResult as uc.BrowseResult).media?.can_play ?? false).toBe(true);
});

it("Media player browse ignores TuneIn menu entries until My Presets is active", async () => {
  const registrarModule = await import("../src/entityRegistrar.js");
  const avrStateModule = await import("../src/avrState.js");
  const mediaBrowserModule = await import("../src/mediaBrowser.js");

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { ingestTuneInListEntry, setTuneInBrowseContext } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar(avrStateManager);
  const entityId = "TX-RZ50 192.168.1.21 main";
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tunein");
  ingestTuneInListEntry(entityId, "U0-Login");
  ingestTuneInListEntry(entityId, "U1-TuneIn");
  ingestTuneInListEntry(entityId, "U2-Spotify");

  let result = await player.browse({ paging: new uc.Paging(1, 10) });

  expect(result).toBeInstanceOf(uc.BrowseResult);
  expect(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title)
  ).toEqual([]);

  setTuneInBrowseContext(entityId, "My Presets");
  ingestTuneInListEntry(entityId, "U0-89.7 | WTMD (Alternative Rock)");
  ingestTuneInListEntry(entityId, "U1-America's Country (Country)");

  result = await player.browse({ paging: new uc.Paging(1, 10) });
  expect(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title)
  ).toEqual(["America's Country (Country)", "WTMD (Alternative Rock)"]);
});

it("TuneIn browse root exposes all presets when the list is longer than 10", async () => {
  const registrarModule = await import("../src/entityRegistrar.js");
  const avrStateModule = await import("../src/avrState.js");
  const mediaBrowserModule = await import("../src/mediaBrowser.js");

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { setTuneInBrowseContext, ingestTuneInListEntry, ingestTuneInXmlEntries } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar(avrStateManager);
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

  expect(result).toBeInstanceOf(uc.BrowseResult);
  expect(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title)
  ).toEqual(["Station A", "Station B", "Station C", "Station D", "Station E", "Station F", "Station G", "Station H", "Station I", "Station J"]);
  expect((result as uc.BrowseResult).pagination.count).toBe(12);

  const pageResult = await player.browse({ paging: new uc.Paging(2, 10) });

  expect(pageResult).toBeInstanceOf(uc.BrowseResult);
  expect(
    (pageResult as uc.BrowseResult).media?.items?.map((item) => item.title)
  ).toEqual(["Station K", "Station L"]);
});

it("Media player browse returns TuneIn full menu items from NET TuneIn", async () => {
  const registrarModule = await import("../src/entityRegistrar.js");
  const avrStateModule = await import("../src/avrState.js");
  const mediaBrowserModule = await import("../src/mediaBrowser.js");

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { ingestTuneInMenuListEntry, ingestTuneInMenuXmlEntries } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar(avrStateManager);
  const entityId = "TX-RZ50 192.168.1.30 main";
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tunein");

  ingestTuneInMenuListEntry(entityId, "U0-Browse");
  ingestTuneInMenuListEntry(entityId, "U1-Stations");
  ingestTuneInMenuListEntry(entityId, "U2-Station A");
  ingestTuneInMenuXmlEntries(entityId, '<?xml version="1.0" encoding="UTF-8"?><response status="ok"><items offset="0003"><item iconid="2F" title="Station B" url="0"/></items></response>');

  const result = await player.browse({
    media_id: "tunein:menu-root",
    media_type: "tunein://menu",
    paging: new uc.Paging(1, 10)
  });

  expect(result).toBeInstanceOf(uc.BrowseResult);
  expect(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title)
  ).toEqual(["Browse", "Stations", "Station A", "Station B"]);
  expect((result as uc.BrowseResult).pagination.count).toBe(4);
});

it("Media player browse hides TuneIn Login menu item", async () => {
  const registrarModule = await import("../src/entityRegistrar.js");
  const avrStateModule = await import("../src/avrState.js");
  const mediaBrowserModule = await import("../src/mediaBrowser.js");

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { ingestTuneInMenuListEntry } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar(avrStateManager);
  const entityId = "TX-RZ50 192.168.1.31 main";
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tunein");

  ingestTuneInMenuListEntry(entityId, "U0-Login");
  ingestTuneInMenuListEntry(entityId, "U1-Search");
  ingestTuneInMenuListEntry(entityId, "U2-Logout");
  ingestTuneInMenuListEntry(entityId, "U3-Browse");
  ingestTuneInMenuListEntry(entityId, "U4-Station A");

  const result = await player.browse({
    media_id: "tunein:menu-root",
    media_type: "tunein://menu",
    paging: new uc.Paging(1, 10)
  });

  expect(result).toBeInstanceOf(uc.BrowseResult);
  expect(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title)
  ).toEqual(["Browse", "Station A"]);
  expect((result as uc.BrowseResult).pagination.count).toBe(2);
});

it("TuneIn selection keeps subsource and state so browse can be repeated", async () => {
  const avrStateModule = await import("../src/avrState.js");
  const mediaBrowserModule = await import("../src/mediaBrowser.js");
  const processorModule = await import("../src/zoneAgnosticUpdateProcessor.js");

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

  expect(avrStateManager.getSubSource(entityId)).toBe("tunein");
  expect(isMediaBrowsingAvailable(entityId)).toBe(true);
  expect(capturedStates.get(entityId)).toBe(uc.MediaPlayerStates.Playing);
});

it("TuneIn preset cache survives post-select menu updates", async () => {
  const registrarModule = await import("../src/entityRegistrar.js");
  const avrStateModule = await import("../src/avrState.js");
  const mediaBrowserModule = await import("../src/mediaBrowser.js");

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { setTuneInBrowseContext, ingestTuneInListEntry } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar(avrStateManager);
  const entityId = "TX-RZ50 192.168.1.22 main";
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tunein");
  setTuneInBrowseContext(entityId, "My Presets");
  ingestTuneInListEntry(entityId, "U0-89.7 | WTMD (Alternative Rock)");
  ingestTuneInListEntry(entityId, "U1-America's Country (Country)");

  let result = await player.browse({ paging: new uc.Paging(1, 10) });
  expect(result).toBeInstanceOf(uc.BrowseResult);
  expect((result as uc.BrowseResult).media?.items?.length).toBe(2);

  setTuneInBrowseContext(entityId, "Now Playing");
  ingestTuneInListEntry(entityId, "U0-Search Stations");

  result = await player.browse({ paging: new uc.Paging(1, 10) });
  expect(result).toBeInstanceOf(uc.BrowseResult);
  expect(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title)
  ).toEqual(["America's Country (Country)", "WTMD (Alternative Rock)"]);
});

it("Media player browse returns Tidal menu entries from AVR NLS updates", async () => {
  const registrarModule = await import("../src/entityRegistrar.js");
  const avrStateModule = await import("../src/avrState.js");
  const mediaBrowserModule = await import("../src/mediaBrowser.js");

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { ingestTidalListEntry } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar(avrStateManager);
  const entityId = "TX-RZ50 192.168.1.24 main";
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");

  ingestTidalListEntry(entityId, "U0-New %s");
  ingestTidalListEntry(entityId, "U1-TIDAL Rising %s");
  ingestTidalListEntry(entityId, "U2-Playlists %s");

  const result = await player.browse({ paging: new uc.Paging(1, 10) });

  expect(result).toBeInstanceOf(uc.BrowseResult);
  expect((result as uc.BrowseResult).media?.title).toBe("Tidal");
  expect(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title)
  ).toEqual(["New", "TIDAL Rising", "Playlists"]);
  expect(
    (result as uc.BrowseResult).media?.items?.map((item) => item.media_id)
  ).toEqual(["tidal:menu:1:New", "tidal:menu:2:TIDAL%20Rising", "tidal:menu:3:Playlists"]);
});

it("Media player browse returns Deezer menu entries from AVR NLS updates", async () => {
  const registrarModule = await import("../src/entityRegistrar.js");
  const avrStateModule = await import("../src/avrState.js");
  const mediaBrowserModule = await import("../src/mediaBrowser.js");

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { ingestDeezerListEntry } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar(avrStateManager);
  const entityId = "TX-RZ50 192.168.1.27 main";
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "deezer");

  ingestDeezerListEntry(entityId, "U0-New %s");
  ingestDeezerListEntry(entityId, "U1-Charts %s");
  ingestDeezerListEntry(entityId, "U2-Playlists %s");

  const result = await player.browse({ paging: new uc.Paging(1, 10) });

  expect(result).toBeInstanceOf(uc.BrowseResult);
  expect((result as uc.BrowseResult).media?.title).toBe("Deezer");
  expect(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title)
  ).toEqual(["New", "Charts", "Playlists"]);
  expect(
    (result as uc.BrowseResult).media?.items?.map((item) => item.media_id)
  ).toEqual(["deezer:menu:1:New", "deezer:menu:2:Charts", "deezer:menu:3:Playlists"]);
});

it("Media player browse marks Deezer NLS entries without %s as playable tracks", async () => {
  const registrarModule = await import("../src/entityRegistrar.js");
  const avrStateModule = await import("../src/avrState.js");
  const mediaBrowserModule = await import("../src/mediaBrowser.js");

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { ingestDeezerListEntry } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar(avrStateManager);
  const entityId = "TX-RZ50 192.168.1.28 main";
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "deezer");

  ingestDeezerListEntry(entityId, "U0-New %s");
  ingestDeezerListEntry(entityId, "U1-My Song Title / Artist Name");

  const result = await player.browse({ paging: new uc.Paging(1, 10) });
  expect(result).toBeInstanceOf(uc.BrowseResult);

  const items = (result as uc.BrowseResult).media?.items ?? [];
  expect((items[0]?.can_browse ?? false) && !(items[0]?.can_play ?? true)).toBe(true);
  expect(!(items[1]?.can_browse ?? true) && (items[1]?.can_play ?? false)).toBe(true);
});

it("Media player browse hides excluded Tidal menu items", async () => {
  const registrarModule = await import("../src/entityRegistrar.js");
  const avrStateModule = await import("../src/avrState.js");
  const mediaBrowserModule = await import("../src/mediaBrowser.js");

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { ingestTidalListEntry } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar(avrStateManager);
  const entityId = "TX-RZ50 192.168.1.26 main";
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");

  ingestTidalListEntry(entityId, "U0-Login %s");
  ingestTidalListEntry(entityId, "U1-Search %s");
  ingestTidalListEntry(entityId, "U2-Logout %s");
  ingestTidalListEntry(entityId, "U3-New %s");
  ingestTidalListEntry(entityId, "U4-Playlists %s");

  const result = await player.browse({ paging: new uc.Paging(1, 10) });

  expect(result).toBeInstanceOf(uc.BrowseResult);
  expect(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title)
  ).toEqual(["New", "Playlists"]);
  expect(
    (result as uc.BrowseResult).media?.items?.map((item) => item.media_id)
  ).toEqual(["tidal:menu:4:New", "tidal:menu:5:Playlists"]);
});

it("Media player browse defaults to 25 items per page when paging is omitted", async () => {
  const registrarModule = await import("../src/entityRegistrar.js");
  const avrStateModule = await import("../src/avrState.js");
  const mediaBrowserModule = await import("../src/mediaBrowser.js");

  const EntityRegistrar = registrarModule.default as any;
  const { avrStateManager } = avrStateModule as any;
  const { ingestTidalListEntry } = mediaBrowserModule as any;

  const registrar = new EntityRegistrar(avrStateManager);
  const entityId = "TX-RZ50 192.168.1.25 main";
  const player = registrar.createMediaPlayerEntity(entityId, 100, async () => uc.StatusCodes.Ok);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");

  for (let index = 0; index < 30; index += 1) {
    ingestTidalListEntry(entityId, `U${index}-Track ${index + 1} %s`);
  }

  const result = await player.browse({} as uc.BrowseOptions);

  expect(result).toBeInstanceOf(uc.BrowseResult);
  expect((result as uc.BrowseResult).media?.items?.length).toBe(25);
  expect((result as uc.BrowseResult).pagination.page).toBe(1);
  expect((result as uc.BrowseResult).pagination.limit).toBe(25);
  expect((result as uc.BrowseResult).pagination.count).toBe(30);
});

it("Tidal browse survives DAB-to-NET transition when NLT/NLS arrive early", async () => {
  const registrarModule = await import("../src/entityRegistrar.js");
  const avrStateModule = await import("../src/avrState.js");
  const processorModule = await import("../src/zoneAgnosticUpdateProcessor.js");

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
  expect(result).toBeInstanceOf(uc.BrowseResult);
  expect((result as uc.BrowseResult).media?.title).toBe("Tidal");
  expect(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title)
  ).toEqual(["New", "TIDAL Rising", "Playlists"]);
});

it("Repeated NLT tidal updates do not clear existing Tidal menu options", async () => {
  const registrarModule = await import("../src/entityRegistrar.js");
  const avrStateModule = await import("../src/avrState.js");
  const processorModule = await import("../src/zoneAgnosticUpdateProcessor.js");

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
  expect(result).toBeInstanceOf(uc.BrowseResult);
  expect(
    (result as uc.BrowseResult).media?.items?.map((item) => item.title)
  ).toEqual(["New", "TIDAL Rising", "Playlists"]);
});

it("TuneIn service selection preloads My Presets for browsing", async () => {
  const avrStateModule = await import("../src/avrState.js");
  const processorModule = await import("../src/zoneAgnosticUpdateProcessor.js");

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

  expect(rawCommands.includes("NTCTOP")).toBe(true);
  expect(rawCommands.includes("NTCSELECT")).toBe(true);
  expect(rawCommands.includes("NLSI00001")).toBe(true);
  expect(rawCommands.some((cmd) => cmd.startsWith("NLAL"))).toBe(true);
});

it("CommandSender silently absorbs shuffle, repeat, and browse commands", async () => {
  const senderModule = await import("../src/commandSender.js");
  const avrStateModule = await import("../src/avrState.js");

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
    avrStateManager,
    null
  );

  avrStateManager.setPowerState(entityId, "on");
  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tunein");

  const entity = new uc.MediaPlayer(entityId, { en: entityId }, {});

  expect(await sender.sharedCmdHandler(entity, uc.MediaPlayerCommands.Shuffle)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(entity, uc.MediaPlayerCommands.Repeat)).toBe(uc.StatusCodes.Ok);
  expect(await sender.sharedCmdHandler(entity, "browse")).toBe(uc.StatusCodes.Ok);
});

it("CommandSender play_media routes TuneIn preset IDs to tunein-preset", async () => {
  const senderModule = await import("../src/commandSender.js");
  const avrStateModule = await import("../src/avrState.js");

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
    avrStateManager,
    null
  );

  avrStateManager.setSource(entityId, "cd");
  avrStateManager.setSubSource(entityId, "unknown");

  const status = await sender.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tunein:preset:2",
    media_type: uc.KnownMediaContentType.Radio
  } as any);

  expect(status).toBe(uc.StatusCodes.Ok);
  expect(eiscp.commands).toEqual(["input-selector tunein", "tunein-preset 2"]);
});

it("CommandSender play_media routes Tidal menu IDs to NLSI", async () => {
  const senderModule = await import("../src/commandSender.js");
  const avrStateModule = await import("../src/avrState.js");

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
  const sender = new CommandSender(
    { updateEntityAttributes: () => true } as any,
    { avrs: [{ model: "M", ip: "1.2.3.5", zone: "main", port: 60128, netMenuDelay: 0 }] },
    eiscp as any,
    avrStateManager,
    null
  );

  avrStateManager.setSource(entityId, "cd");
  avrStateManager.setSubSource(entityId, "unknown");

  const status = await sender.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tidal:menu:4",
    media_type: "tidal://menu"
  } as any);

  expect(status).toBe(uc.StatusCodes.Ok);
  expect(eiscp.commands).toEqual(["input-selector tidal"]);
  expect(eiscp.rawCommands).toEqual(["NLSI00004"]);
});

it("CommandSender play_media routes Deezer menu IDs to NLSI", async () => {
  const senderModule = await import("../src/commandSender.js");
  const avrStateModule = await import("../src/avrState.js");

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

  const entityId = "M 1.2.3.9 main";
  const eiscp = new MockEiscp();
  const sender = new CommandSender(
    { updateEntityAttributes: () => true } as any,
    { avrs: [{ model: "M", ip: "1.2.3.9", zone: "main", port: 60128, netMenuDelay: 0 }] },
    eiscp as any,
    avrStateManager,
    null
  );

  avrStateManager.setSource(entityId, "cd");
  avrStateManager.setSubSource(entityId, "unknown");

  const status = await sender.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.PlayMedia, {
    media_id: "deezer:menu:4",
    media_type: "deezer://menu"
  } as any);

  expect(status).toBe(uc.StatusCodes.Ok);
  expect(eiscp.commands).toEqual(["input-selector deezer"]);
  expect(eiscp.rawCommands).toEqual(["NLSI00004"]);
});

it("CommandSender Deezer track selection freezes browse list and sets now-playing title", async () => {
  const senderModule = await import("../src/commandSender.js");
  const avrStateModule = await import("../src/avrState.js");
  const mediaBrowserModule = await import("../src/mediaBrowser.js");
  const deezerStoreModule = await import("../src/deezerBrowserStore.js");

  const CommandSender = senderModule.CommandSender as any;
  const { avrStateManager } = avrStateModule as any;
  const { ingestDeezerListEntry } = mediaBrowserModule as any;
  const { getDeezerBrowseState } = deezerStoreModule as any;

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
  const sender = new CommandSender(
    { updateEntityAttributes: () => true } as any,
    { avrs: [{ model: "M", ip: "1.2.3.10", zone: "main", port: 60128, netMenuDelay: 0 }] },
    eiscp as any,
    avrStateManager,
    null
  );

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "deezer");
  ingestDeezerListEntry(entityId, "U0-My Song Title / Artist Name");

  const status = await sender.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.PlayMedia, {
    media_id: "deezer:menu:1:My%20Song%20Title%20%2F%20Artist%20Name",
    media_type: "deezer://menu"
  } as any);

  expect(status).toBe(uc.StatusCodes.Ok);
  expect(eiscp.rawCommands).toEqual(["NLSI00001"]);
  expect(getDeezerBrowseState(entityId)?.browseListFrozen).toBe(true);
  expect(getDeezerBrowseState(entityId)?.nowPlayingTitle).toBe("My Song Title / Artist Name");
});

it("CommandSender remaps stale Tidal index using title encoded in media_id", async () => {
  const senderModule = await import("../src/commandSender.js");
  const avrStateModule = await import("../src/avrState.js");
  const mediaBrowserModule = await import("../src/mediaBrowser.js");

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
  const sender = new CommandSender(
    { updateEntityAttributes: () => true } as any,
    { avrs: [{ model: "M", ip: "1.2.3.7", zone: "main", port: 60128, netMenuDelay: 0 }] },
    eiscp as any,
    avrStateManager,
    null
  );

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");

  ingestTidalListEntry(entityId, "U0-Playlists %s");
  ingestTidalListEntry(entityId, "U1-New %s");

  const status = await sender.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tidal:menu:9:Playlists",
    media_type: "tidal://menu"
  } as any);

  expect(status).toBe(uc.StatusCodes.Ok);
  expect(eiscp.commands).toEqual([]);
  expect(eiscp.rawCommands).toEqual(["NLSI00001"]);
});

it("CommandSender first selection after Main Tidal Menu skips pre-list command", async () => {
  const senderModule = await import("../src/commandSender.js");
  const avrStateModule = await import("../src/avrState.js");
  const tidalStoreModule = await import("../src/tidalBrowserStore.js");

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
  const sender = new CommandSender(
    { updateEntityAttributes: () => true } as any,
    { avrs: [{ model: "M", ip: "1.2.3.8", zone: "main", port: 60128, netMenuDelay: 0 }] },
    eiscp as any,
    avrStateManager,
    null
  );

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");
  const browseState47 = getTidalBrowseState(entityId);
  if (browseState47) browseState47.traceNextSelectionAfterMainMenu = true;

  const status = await sender.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tidal:menu:3:Playlists",
    media_type: "tidal://menu"
  } as any);

  expect(status).toBe(uc.StatusCodes.Ok);
  expect(eiscp.commands).toEqual([]);
  expect(eiscp.rawCommands).toEqual(["NLSI00003"]);
});

it("CommandSender in-Tidal track selection uses direct NLSI when AVR is in list mode", async () => {
  const senderModule = await import("../src/commandSender.js");
  const avrStateModule = await import("../src/avrState.js");
  const storeModule = await import("../src/tidalBrowserStore.js");

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
  const sender = new CommandSender(
    { updateEntityAttributes: () => true } as any,
    { avrs: [{ model: "M", ip: "1.2.3.9", zone: "main", port: 60128, netMenuDelay: 0 }] },
    eiscp as any,
    avrStateManager,
    null
  );

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

  expect(status).toBe(uc.StatusCodes.Ok);
  // listModeActive flag causes pre-list to be skipped even though a song is playing
  expect(eiscp.commands).toEqual([]);
  expect(eiscp.rawCommands).toEqual(["NLSI00004"]);
});

it("CommandSender in-Tidal track selection sends list before NLSI when AVR is playing", async () => {
  const senderModule = await import("../src/commandSender.js");
  const avrStateModule = await import("../src/avrState.js");

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
  const sender = new CommandSender(
    { updateEntityAttributes: () => true } as any,
    { avrs: [{ model: "M", ip: "1.2.3.10", zone: "main", port: 60128, netMenuDelay: 0 }] },
    eiscp as any,
    avrStateManager,
    null
  );

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");
  avrStateManager.setPlaybackStatus(entityId, "playing", undefined);

  const status = await sender.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tidal:menu:4:Chattahoochee%20-%20Alan%20Jackson",
    media_type: "tidal://menu"
  } as any);

  expect(status).toBe(uc.StatusCodes.Ok);
  expect(eiscp.commands).toEqual(["network-usb list"]);
  expect(eiscp.rawCommands).toEqual(["NLSI00004"]);
});

it("CommandSender in-Tidal menu selection uses direct NLSI even when AVR is playing", async () => {
  const senderModule = await import("../src/commandSender.js");
  const avrStateModule = await import("../src/avrState.js");

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
  const sender = new CommandSender(
    { updateEntityAttributes: () => true } as any,
    { avrs: [{ model: "M", ip: "1.2.3.11", zone: "main", port: 60128, netMenuDelay: 0 }] },
    eiscp as any,
    avrStateManager,
    null
  );

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");
  avrStateManager.setPlaybackStatus(entityId, "playing", undefined);

  const status = await sender.sharedCmdHandler(new uc.MediaPlayer(entityId, { en: entityId }, {}), uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tidal:menu:3:Playlists",
    media_type: "tidal://menu"
  } as any);

  expect(status).toBe(uc.StatusCodes.Ok);
  expect(eiscp.commands).toEqual([]);
  expect(eiscp.rawCommands).toEqual(["NLSI00003"]);
});

it("CommandSender play_media routes Main Tidal Menu to input-selector tidal", async () => {
  const senderModule = await import("../src/commandSender.js");
  const avrStateModule = await import("../src/avrState.js");

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
  const sender = new CommandSender(mockDriver, { avrs: [{ model: "M", ip: "1.2.3.6", zone: "main", netMenuDelay: 0 }] } as any, new MockEiscp(), avrStateManager, mockReceiver);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");

  const result = await sender.sharedCmdHandler({ id: entityId } as any, uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tidal:main-menu",
    media_type: "tidal://menu"
  });

  expect(result).toBe(uc.StatusCodes.Ok);
  expect(commandCalls).toEqual(["input-selector tidal"]);
});

it("CommandSender play_media routes TuneIn main menu to input-selector tunein", async () => {
  const senderModule = await import("../src/commandSender.js");
  const avrStateModule = await import("../src/avrState.js");

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
  const sender = new CommandSender(mockDriver, { avrs: [{ model: "M", ip: "1.2.3.6", zone: "main", netMenuDelay: 0 }] } as any, new MockEiscp(), avrStateManager, mockReceiver);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tunein");

  const result = await sender.sharedCmdHandler({ id: entityId } as any, uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tunein:menu-root"
  } as any);

  expect(result).toBe(uc.StatusCodes.Ok);
  expect(commandCalls).toEqual(["input-selector tunein"]);
});

it("CommandSender play_media routes Tidal Back option to RETURN", async () => {
  const senderModule = await import("../src/commandSender.js");
  const avrStateModule = await import("../src/avrState.js");

  const CommandSender = senderModule.CommandSender as any;
  const { avrStateManager } = avrStateModule as any;

  const rawCalls: string[] = [];

  class MockEiscp {
    public connected = true;
    async connect() {}
    async waitForConnect() {}
    async command(cmd: string) {}
    async raw(cmd: string) {
      rawCalls.push(cmd);
    }
  }

  const entityId = "M 1.2.3.6 main";
  const mockDriver = { updateEntityAttributes: () => true } as any;
  const mockReceiver = {} as any;
  const sender = new CommandSender(mockDriver, { avrs: [{ model: "M", ip: "1.2.3.6", zone: "main", netMenuDelay: 0 }] } as any, new MockEiscp(), avrStateManager, mockReceiver);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tidal");

  const result = await sender.sharedCmdHandler({ id: entityId } as any, uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tidal:menu-back",
    media_type: "tidal://menu"
  } as any);

  expect(result).toBe(uc.StatusCodes.Ok);
  expect(rawCalls).toEqual(["NTCRETURN"]);
});

it("CommandSender play_media routes TuneIn Back option to RETURN", async () => {
  const senderModule = await import("../src/commandSender.js");
  const avrStateModule = await import("../src/avrState.js");

  const CommandSender = senderModule.CommandSender as any;
  const { avrStateManager } = avrStateModule as any;

  const rawCalls: string[] = [];

  class MockEiscp {
    public connected = true;
    async connect() {}
    async waitForConnect() {}
    async command(cmd: string) {}
    async raw(cmd: string) {
      rawCalls.push(cmd);
    }
  }

  const entityId = "M 1.2.3.6 main";
  const mockDriver = { updateEntityAttributes: () => true } as any;
  const mockReceiver = {} as any;
  const sender = new CommandSender(mockDriver, { avrs: [{ model: "M", ip: "1.2.3.6", zone: "main", netMenuDelay: 0 }] } as any, new MockEiscp(), avrStateManager, mockReceiver);

  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tunein");

  const result = await sender.sharedCmdHandler({ id: entityId } as any, uc.MediaPlayerCommands.PlayMedia, {
    media_id: "tunein:menu-back",
    media_type: "tunein://menu"
  } as any);

  expect(result).toBe(uc.StatusCodes.Ok);
  expect(rawCalls).toEqual(["NTCRETURN"]);
});
