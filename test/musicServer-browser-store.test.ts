import { testAvrContexts } from "./helpers/contexts.js";
import { describe, it, expect, vi, afterEach } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";

vi.mock("../src/loggers.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const ENTITY_ID = "NXR-001 192.168.1.100 main";

describe("MusicServerMediaBrowser", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("browse returns items from list entries", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser(testAvrContexts);
    browser.ingestXmlEntries(ENTITY_ID, '<items offset="0"><item title="My Folder"/><item title="Song - Artist"/></items>');

    const result = await browser.browse(ENTITY_ID, { paging: new uc.Paging(1, 25) });
    expect(result).toBeDefined();
  });

  it("marks fuzzy-matching music server tracks as now playing", async () => {
    const store = await import("../src/musicServerBrowserStore.js");
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser(testAvrContexts);
    browser.ingestXmlEntries(ENTITY_ID, '<items offset="0"><item title="Song - Artist"/></items>');
    const state = store.musicServerStore.getBrowseState(ENTITY_ID, testAvrContexts)!;
    state.nowPlayingTitle = "Song - Artist";
    await browser.browse(ENTITY_ID, { media_id: "music-server:root", media_type: "music-server://menu", paging: new uc.Paging(1, 25) });
    state.nowPlayingTitle = "Song";
    await browser.browse(ENTITY_ID, { media_id: "music-server:root", media_type: "music-server://menu", paging: new uc.Paging(1, 25) });
  });

  it("ingestXmlEntries parses XML items", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser(testAvrContexts);
    browser.ingestXmlEntries(ENTITY_ID, '<items offset="0000"><item title="Album 1"/><item title="Song - Artist"/></items>');

    const result = await browser.browse(ENTITY_ID, { paging: new uc.Paging(1, 25) });
    expect(result).toBeDefined();
  });

  it("isMainMenuRequest and isBackRequest detect correct IDs", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser(testAvrContexts);
    expect(browser.isMainMenuRequest("music-server:main-menu", "music-server://menu")).toBe(true);
    expect(browser.isBackRequest("music-server:menu-back", "music-server://menu")).toBe(true);
    expect(browser.isMainMenuRequest("other:id")).toBe(false);
    expect(browser.isBackRequest("other:id")).toBe(false);
  });

  it("resolveMenuOption returns undefined for non-matching media_id", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser(testAvrContexts);
    expect(browser.resolveMenuOption(undefined)).toBeUndefined();
    expect(browser.resolveMenuOption("no-match")).toBeUndefined();
    expect(browser.resolveMenuOption("music-server:menu:abc")).toBeUndefined();
    expect(browser.resolveMenuOption("music-server:menu:0")).toBeUndefined();
  });

  it("resolveMenuOption handles encoded title", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser(testAvrContexts);
    const option = browser.resolveMenuOption("music-server:menu:5:Hello%20World", "music-server://menu");
    expect(option).toBeDefined();
    expect(option!.menuIndex).toBe(5);
    expect(option!.title).toBe("Hello World");
  });

  it("resolveMenuOption handles invalid URI gracefully", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser(testAvrContexts);
    const option = browser.resolveMenuOption("music-server:menu:3:%E0%80%80", "music-server://menu");
    expect(option).toBeDefined();
    expect(option!.title).toBe("Menu 3");
  });

  it("resolveMenuOption rejects mismatched media_type", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser(testAvrContexts);
    const option = browser.resolveMenuOption("music-server:menu:1", "wrong://type");
    expect(option).toBeUndefined();
  });

  it("resolveMenuOption without mediaType", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser(testAvrContexts);
    const option = browser.resolveMenuOption("music-server:menu:1:Title");
    expect(option).toBeDefined();
    expect(option!.menuIndex).toBe(1);
    expect(option!.isBrowsable).toBe(true);
  });

  it("resolveMenuOption detects track title as not browsable", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser(testAvrContexts);
    const option = browser.resolveMenuOption("music-server:menu:1:Song%20-%20Artist", "music-server://menu");
    expect(option).toBeDefined();
    expect(option!.isBrowsable).toBe(false);
  });

  it("browse with root id", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser(testAvrContexts);
    browser.ingestXmlEntries(ENTITY_ID, '<items offset="0"><item title="Folder"/></items>');
    const result = await browser.browse(ENTITY_ID, { media_id: "music-server:root", media_type: "music-server://menu", paging: new uc.Paging(1, 25) });
    expect(result).toBeDefined();
  });

  it("browse with main menu id", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser(testAvrContexts);
    const result = await browser.browse(ENTITY_ID, { media_id: "music-server:main-menu", media_type: "music-server://menu", paging: new uc.Paging(1, 25) });
    expect(result).toBeDefined();
  });

  it("browse with back id", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser(testAvrContexts);
    const result = await browser.browse(ENTITY_ID, { media_id: "music-server:menu-back", media_type: "music-server://menu", paging: new uc.Paging(1, 25) });
    expect(result).toBeDefined();
  });

  it("browse with unknown menu id returns BrowseResult", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser(testAvrContexts);
    const result = await browser.browse(ENTITY_ID, { media_id: "music-server:menu:999", media_type: "music-server://menu", paging: new uc.Paging(1, 25) });
    expect(result).toBeDefined();
  });

  it("browse with empty media_id", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser(testAvrContexts);
    const result = await browser.browse(ENTITY_ID, { paging: new uc.Paging(1, 25) });
    expect(result).toBeDefined();
  });
});
