import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";
import { ConfigManager } from "../src/configManager.js";
import { avrStateManager } from "../src/avrState.js";
import { EiscpDriver } from "../src/eiscp.js";
import { PlayMediaCommandHandler } from "../src/playMediaCommandHandler.js";
import { TuneInBrowseHandler } from "../src/tuneInBrowseHandler.js";
import { TuneInPreloader } from "../src/tuneInPreloader.js";
import { TuneInZoneAgnosticAdapter } from "../src/zoneAgnosticServiceAdapters.js";
import { initMediaBrowser, TUNEIN_MENU_ROOT_ID, TUNEIN_MENU_ROOT_TYPE, TUNEIN_MENU_BACK_ID } from "../src/mediaBrowser.js";
import { getTuneInMenuBrowseState, listTuneInMenuOptions, resetTuneInMenuBrowseState } from "../src/tuneInMenuStore.js";
import { clearTuneInPresets, getTuneInBrowseState, listTuneInPresets } from "../src/tuneInBrowserStore.js";
import { resetAvrInfo, setAvrInfo } from "../src/avrInfoStore.js";

const entityId = "TX-RZ50 192.0.2.103 main";
const physicalId = "TX-RZ50 192.0.2.103";
const root = ["My Presets", "Local Radio", "Music", "Talk", "Sports", "By Location", "By Language", "Podcasts", "Log Out"];
const countries = ["Africa", "Asia", "Europe", "North America", "South America", "Oceania", "Antarctica", "Caribbean", "Central America", "Middle East", "Internet Only", "All Regions"];
const stations = ["538 Dance Department (Dance & Electronic)", "828 | 4EVER49 Radio (Adult Hits)"];

async function finish<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

// Exercise the real driver workflow, command handler, browse handler and
// ingestion against a stateful AVR: an index always applies to its CURRENT
// menu. A wrong TOP/SELECT/RETURN therefore changes the result, not just a spy.
function setup(mode: "legacy" | "modern" = "legacy", style: "full" | "mypresets" = "full", presetPosition = 1) {
  vi.spyOn(ConfigManager, "get").mockReturnValue({
    avrs: [{ model: "TX-RZ50", ip: "192.0.2.103", zone: "main", networkNavigationMode: mode, tuneinMenuStyle: style, tuneinPresetPosition: presetPosition, netMenuDelay: 0 }]
  } as any);
  setAvrInfo(entityId, {
    model: "TX-RZ50",
    friendlyName: "",
    firmwareVersion: "",
    presetCount: 0,
    presets: [],
    zones: [],
    selectors: [],
    controls: [],
    tunerBands: [],
    netServices: [{ id: "0e", name: "TuneIn Radio", enabled: true, hasAccount: true }]
  });
  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "tunein");
  initMediaBrowser(avrStateManager);
  const driver = new EiscpDriver({ model: "TX-RZ50", host: "192.0.2.103", networkNavigationMode: mode, netMenuDelay: 0, tuneinPresetPosition: presetPosition }, avrStateManager);
  const preloader = new TuneInPreloader(driver, () => physicalId);
  const adapter = new TuneInZoneAgnosticAdapter({
    state: avrStateManager,
    getPhysicalAvrId: () => physicalId,
    getNetworkNavigationMode: () => mode,
    isTuneInFullMenu: async () => style === "full",
    preloadTuneInPresets: (id) => preloader.preloadTuneInPresets(id)
  });
  const play = new PlayMediaCommandHandler(driver, avrStateManager, undefined);
  const browser = new TuneInBrowseHandler(avrStateManager);
  const commands: string[] = [];
  let menu = "net";
  let playing = "";
  const rows = () =>
    menu === "root" ? root : menu === "location" ? countries : menu === "presets" || menu === "country" ? stations : ["TuneIn", "Spotify", "Deezer", "Tidal", "AmazonMusic", "Chromecast built-in"];

  function emitMenu(next: string) {
    menu = next;
    const state = getTuneInMenuBrowseState(entityId)!;
    state.totalListItemCount = rows().length;
    state.nlsCursorOffset = 0;
    state.nlsLayerNumber = next === "root" ? 1 : next === "country" ? 3 : 2;
    adapter.handleNltContext(entityId, next === "presets" ? "My Presets" : next === "root" ? "TuneIn Radio" : next);
    rows()
      .slice(0, 10)
      .forEach((title, index) => adapter.handleNls(entityId, `U${index}-${title} %s`));
  }

  vi.spyOn(driver, "raw").mockImplementation(async (command) => {
    commands.push(command);
    if (command === "NTCTOP") emitMenu("net");
    else if (command === "NSV0E0") emitMenu("root");
    else if (command === "NTCSELECT") emitMenu(menu === "net" ? "root" : "presets");
    else if (command === "NTCRETURN") emitMenu(menu === "country" ? "location" : "root");
    else if (command.startsWith("NLSI")) {
      const index = Number(command.slice(4));
      if (menu === "net" && index === 1) emitMenu("root");
      else if (menu === "root" && index === presetPosition) emitMenu("presets");
      else if (menu === "root" && index === 6) emitMenu("location");
      else if (menu === "location") emitMenu("country");
      else if (menu === "presets" || menu === "country") playing = rows()[index - 1] ?? "unexpected station";
    } else if (command.startsWith("NLAL")) {
      const offset = parseInt(command.slice(10, 14), 16);
      adapter.handleNla(
        entityId,
        `<items offset="${offset}">${rows()
          .slice(offset)
          .map((title) => `<item title="${title.replace(/&/g, "&amp;")}"/>`)
          .join("")}</items>`
      );
    }
  });

  const handle = (mediaId: string, mediaType = TUNEIN_MENU_ROOT_TYPE) =>
    play.handle({
      entityId,
      mediaId,
      mediaType,
      networkNavigationMode: mode,
      netMenuDelay: 0,
      setZonePrefix: (cmd) => cmd
    });
  const browse = (mediaId: string) =>
    finish(
      browser.browse(
        entityId,
        { media_id: mediaId, media_type: TUNEIN_MENU_ROOT_TYPE, paging: new uc.Paging(1, 50) },
        { id: entityId } as uc.MediaPlayer,
        (_entity, _cmd, params) => handle(String(params?.media_id)),
        (cmd) => driver.raw(cmd)
      )
    );
  return { driver, adapter, commands, browse, handle, getMenu: () => menu, getPlaying: () => playing };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetTuneInMenuBrowseState(entityId);
  clearTuneInPresets(entityId);
  getTuneInBrowseState(entityId)!.contextTitle = "";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetAvrInfo(entityId);
});

describe("v0.8.10 legacy TuneIn navigation", () => {
  it.each(["tunein", "TuneIn Radio", "🌐 TuneIn Radio"])("uses NET/TOP/NLSI for the source '%s', even with a learned service ID", async (source) => {
    const avr = setup();
    await finish(avr.driver.command({ zone: "main", command: "input-selector", args: source }));
    expect(avr.commands).toEqual(["SLI2B", "NTCTOP", "NLSI00001", "SLIQSTN"]);
    expect(avr.getMenu()).toBe("root");
  });

  it("opens Full Menu, browses By Location and a nested folder, then goes Back without playing a preset", async () => {
    const avr = setup();
    await finish(avr.adapter.onServiceEntered(entityId, [entityId], [entityId]));
    expect(avr.commands).toEqual([]); // Full Menu must not preload My Presets.
    const rootResult = (await avr.browse(TUNEIN_MENU_ROOT_ID)) as uc.BrowseResult;
    expect(avr.commands.slice(0, 4)).toEqual(["SLI2B", "NTCTOP", "NLSI00001", "SLIQSTN"]);
    expect(avr.commands).not.toContain("NTCSELECT");
    expect(avr.getMenu()).toBe("root");
    expect(rootResult.media.items?.map((item) => item.title)).toContain("By Location");
    avr.commands.length = 0;

    const location = (await avr.browse("tunein:menu:6:By%20Location")) as uc.BrowseResult;
    expect(avr.commands[0]).toBe("NLSI00006");
    expect(avr.commands.some((cmd) => /^NLAL....02000A03E7$/.test(cmd))).toBe(true);
    expect(location.media.items?.slice(2).map((item) => item.title)).toEqual(countries);
    expect(avr.getMenu()).toBe("location");
    expect(avr.getPlaying()).toBe("");
    avr.commands.length = 0;

    const country = (await avr.browse("tunein:menu:3:Europe")) as uc.BrowseResult;
    expect(avr.commands).toEqual(["NLSI00003"]);
    expect(country.media.items?.slice(2).map((item) => item.can_play)).toEqual([true, true]);
    expect(avr.getPlaying()).toBe("");
    await avr.browse(TUNEIN_MENU_BACK_ID);
    expect(avr.getMenu()).toBe("location");
    expect(listTuneInMenuOptions(entityId).map((item) => item.title)).toEqual(countries);
  });

  it("shows and plays stations inside Full Menu's My Presets instead of preserving stale root rows", async () => {
    const avr = setup();
    await avr.browse(TUNEIN_MENU_ROOT_ID);
    avr.commands.length = 0;
    const presets = (await avr.browse("tunein:menu:1:My%20Presets")) as uc.BrowseResult;
    expect(avr.commands).toEqual(["NLSI00001"]);
    expect(presets.media.items?.slice(2).map((item) => item.title)).toEqual([stations[0], "4EVER49 Radio (Adult Hits)"]);
    expect(listTuneInMenuOptions(entityId).some((item) => item.title === "By Location")).toBe(false);
    const station = listTuneInMenuOptions(entityId)[1];
    avr.commands.length = 0;
    await avr.browse(station.mediaId);
    expect(avr.commands).toEqual(["NLSI00002"]);
    expect(avr.getPlaying()).toBe(stations[1]);

    // Main Menu must also recover from a real My Presets/playback context.
    avr.commands.length = 0;
    await avr.browse(TUNEIN_MENU_ROOT_ID);
    expect(avr.commands.slice(0, 4)).toEqual(["SLI2B", "NTCTOP", "NLSI00001", "SLIQSTN"]);
    expect(avr.getMenu()).toBe("root");
    await avr.browse("tunein:menu:6:By%20Location");
    expect(avr.getMenu()).toBe("location");
    expect(avr.getPlaying()).toBe(stations[1]);
  });

  it("preloads configured My Presets and recalls a preset using the v0.8.10 sequence", async () => {
    const avr = setup("legacy", "mypresets", 3);
    await finish(avr.driver.command({ zone: "main", command: "input-selector", args: "🌐 TuneIn Radio" }));
    await finish(avr.adapter.onServiceEntered(entityId, [entityId], [entityId]));
    expect(avr.commands.slice(0, 4)).toEqual(["SLI2B", "NTCTOP", "NLSI00001", "SLIQSTN"]);
    expect(avr.commands).toContain("NLSI00003");
    expect(avr.commands).not.toContain("NTCSELECT");
    expect(avr.commands.some((command) => command.startsWith("NLAL"))).toBe(true);
    expect(listTuneInPresets(entityId)).toHaveLength(2);
    avr.commands.length = 0;
    await finish(avr.handle("tunein:preset:2", uc.KnownMediaContentType.Radio));
    expect(avr.commands).toEqual(["NTCTOP", "NTCSELECT", "NLSI00003", "NLSI00002"]);
    expect(avr.getPlaying()).toBe(stations[1]);
  });
});

it("preserves modern source selection and XML folder navigation", async () => {
  const avr = setup("modern");
  await finish(avr.driver.command({ zone: "main", command: "input-selector", args: "🌐 TuneIn Radio" }));
  expect(avr.commands).toEqual(["SLI2B", "NSV0E0", "SLIQSTN"]);
  avr.commands.length = 0;
  await finish(avr.handle(TUNEIN_MENU_ROOT_ID));
  expect(avr.commands).toEqual(["NSV0E0", "NTCTOP", "NTCSELECT"]);
  avr.commands.length = 0;
  await finish(avr.handle("tunein:menu:6:By%20Location"));
  expect(avr.commands).toEqual(["NLAI010005----"]);
});
