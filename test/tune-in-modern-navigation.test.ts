import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";
import { ConfigManager } from "../src/configManager.js";
import { avrStateManager } from "../src/avrState.js";
import { EiscpDriver } from "../src/eiscp.js";
import { IscpCommandParser } from "../src/eiscp-command-parser.js";
import { CommandSender } from "../src/commandSender.js";
import { TuneInBrowseHandler } from "../src/tuneInBrowseHandler.js";
import { TuneInZoneAgnosticAdapter } from "../src/zoneAgnosticServiceAdapters.js";
import { initMediaBrowser, TUNEIN_MENU_ROOT_ID, TUNEIN_MENU_ROOT_TYPE } from "../src/mediaBrowser.js";
import { getTuneInMenuBrowseState, resetTuneInMenuBrowseState } from "../src/tuneInMenuStore.js";
import { resetAvrInfo, setAvrInfo } from "../src/avrInfoStore.js";
import { clearAvrInputs, setAvrInputs } from "../src/inputSourceStore.js";
import { NETWORK_INPUT_MARKERS } from "../src/configConstants.js";

const entityId = "TX-RZ50 192.0.2.104 main";
const rootNlt = "0E01000000090100FF0E00TuneIn Radio";
const netNlt = "F3000003000C0000FFFF00NET";
const rootRows = ["My Presets", "Local Radio", "Music", "Talk", "Sports", "By Location", "By Language", "Podcasts", "Log Out"];

async function finish<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

function setup(delayedMenu = false, xmlDelay = 0) {
  const config = {
    avrs: [{ model: "TX-RZ50", ip: "192.0.2.104", zone: "main", networkNavigationMode: "modern", tuneinMenuStyle: "full", netMenuDelay: 0 }]
  } as any;
  vi.spyOn(ConfigManager, "get").mockReturnValue(config);
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
  setAvrInputs("TX-RZ50 192.0.2.104", [{ id: "0e", name: "TuneIn Radio", network: true }]);
  avrStateManager.setSource(entityId, "net");
  avrStateManager.setSubSource(entityId, "spotify");
  initMediaBrowser(avrStateManager);
  const driver = new EiscpDriver({ model: "TX-RZ50", host: "192.0.2.104", networkNavigationMode: "modern", netMenuDelay: 0 }, avrStateManager);
  vi.spyOn(driver, "connected", "get").mockReturnValue(true);
  vi.spyOn(driver, "waitForConnect").mockResolvedValue(undefined);
  const sender = new CommandSender({ updateEntityAttributes: vi.fn() } as any, config, driver, avrStateManager, undefined);
  const browser = new TuneInBrowseHandler(avrStateManager);
  const adapter = new TuneInZoneAgnosticAdapter({
    state: avrStateManager,
    getPhysicalAvrId: () => "TX-RZ50 192.0.2.104",
    getNetworkNavigationMode: () => "modern",
    isTuneInFullMenu: async () => true,
    preloadTuneInPresets: vi.fn()
  });
  const parser = new IscpCommandParser(() => entityId, avrStateManager, { getBrowseState: () => null }, { getBrowseState: () => null }, { getBrowseState: getTuneInMenuBrowseState });
  const commands: string[] = [];
  let menuReady = false;
  let prematureXmlRequests = 0;

  function receive(command: string, value: string) {
    const result = parser.parse(command, value);
    if (result?.command === "NLS") adapter.handleNls(entityId, String(result.argument));
    if (result?.command === "NLA") adapter.handleNla(entityId, String(result.argument));
  }

  vi.spyOn(driver, "raw").mockImplementation(async (command) => {
    commands.push(command);
    if (command === "NSV0E0") receive("NLT", rootNlt);
    if (command === "NTCTOP") receive("NLT", netNlt);
    if (command === "NTCSELECT") {
      const reply = () => {
        menuReady = true;
        receive("NLT", rootNlt);
        rootRows.forEach((row, i) => receive("NLS", `U${i}-${row}`));
      };
      if (delayedMenu) setTimeout(reply, 200);
      else reply();
    }
    if (command.startsWith("NLAL")) {
      if (!menuReady) {
        prematureXmlRequests++;
        return;
      }
      const reply = () => receive("NLA", `X0000S<items offset="0">${rootRows.map((title) => `<item title="${title}"/>`).join("")}</items>`);
      if (xmlDelay) setTimeout(reply, xmlDelay);
      else reply();
    }
  });
  const select = (source: string) => finish(sender.sharedCmdHandler({ id: entityId } as uc.Entity, uc.MediaPlayerCommands.SelectSource, { source }));
  const browse = () =>
    finish(
      browser.browse(
        entityId,
        { media_id: TUNEIN_MENU_ROOT_ID, media_type: TUNEIN_MENU_ROOT_TYPE, paging: new uc.Paging(1, 25) },
        { id: entityId } as uc.MediaPlayer,
        (entity, cmd, params) => sender.sharedCmdHandler(entity, cmd, params),
        (cmd) => driver.raw(cmd)
      )
    );
  return { select, browse, commands, getPrematureXmlRequests: () => prematureXmlRequests };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetTuneInMenuBrowseState(entityId);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetAvrInfo(entityId);
  clearAvrInputs("TX-RZ50 192.0.2.104");
  avrStateManager.clearState(entityId);
});

it.each(["tunein", "TuneIn Radio", ...NETWORK_INPUT_MARKERS.filter((marker) => marker !== "none").map((marker) => `${marker} TuneIn Radio`)])(
  "routes Full Menu source '%s' to canonical TuneIn before asynchronous service notifications",
  async (source) => {
    const avr = setup();
    await avr.select(source);
    expect(avrStateManager.getSubSource(entityId)).toBe("tunein");
    expect(avr.commands).toEqual(["SLI2B", "NSV0E0", "SLIQSTN"]);
    const result = (await avr.browse()) as uc.BrowseResult;
    expect(result.media.items?.map((item) => item.title)).toEqual(rootRows.slice(0, -1));
  }
);

it("waits for the TuneIn menu metadata rather than harvesting the intermediate NET list", async () => {
  const avr = setup(true);
  await avr.select("tunein");
  const result = (await avr.browse()) as uc.BrowseResult;
  expect(avr.getPrematureXmlRequests()).toBe(0);
  expect(result.media.items?.map((item) => item.title)).toEqual(rootRows.slice(0, -1));
});

it("waits for a delayed XML reply before returning the Full Menu result", async () => {
  const avr = setup(false, 700);
  await avr.select("tunein");
  const result = (await avr.browse()) as uc.BrowseResult;
  expect(result.media.items?.map((item) => item.title)).toEqual(rootRows.slice(0, -1));
});
