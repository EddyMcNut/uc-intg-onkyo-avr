import { describe, it, expect, vi, afterEach } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";

vi.mock("../src/loggers.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const ENTITY_ID = "NXR-001 192.168.1.100 main";

describe("waitForNlaIngestion", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns immediately when state is null (no browse state for entityId)", async () => {
    const { waitForNlaIngestion } = await import("../src/musicServerBrowserStore.js");
    await waitForNlaIngestion("nonexistent nohost main");
  });

  it("returns immediately when totalExpected is 0", async () => {
    const store = await import("../src/musicServerBrowserStore.js");
    store.addMusicServerMenuOption(ENTITY_ID, 1, "Item 1");
    const state = store.getMusicServerBrowseState(ENTITY_ID);
    state!.totalListItemCount = 0;
    const { waitForNlaIngestion } = await import("../src/musicServerBrowserStore.js");
    await waitForNlaIngestion(ENTITY_ID);
  });

  it("returns immediately when currentCount >= totalExpected", async () => {
    const store = await import("../src/musicServerBrowserStore.js");
    store.addMusicServerMenuOption(ENTITY_ID, 1, "Item 1");
    store.addMusicServerMenuOption(ENTITY_ID, 2, "Item 2");
    const state = store.getMusicServerBrowseState(ENTITY_ID);
    state!.totalListItemCount = 2;
    const { waitForNlaIngestion } = await import("../src/musicServerBrowserStore.js");
    await waitForNlaIngestion(ENTITY_ID);
  });

  it("returns when count grows during polling", async () => {
    vi.useFakeTimers();
    const store = await import("../src/musicServerBrowserStore.js");
    store.addMusicServerMenuOption(ENTITY_ID, 1, "Item 1");
    const state = store.getMusicServerBrowseState(ENTITY_ID);
    state!.totalListItemCount = 2;

    const { waitForNlaIngestion } = await import("../src/musicServerBrowserStore.js");
    const p = waitForNlaIngestion(ENTITY_ID);

    vi.advanceTimersByTime(350);
    store.addMusicServerMenuOption(ENTITY_ID, 2, "Item 2");
    vi.advanceTimersByTime(350);

    await p;
  });

  it("returns after timeout when count never grows", async () => {
    vi.useFakeTimers();
    const store = await import("../src/musicServerBrowserStore.js");
    store.addMusicServerMenuOption(ENTITY_ID, 1, "Item 1");
    const state = store.getMusicServerBrowseState(ENTITY_ID);
    state!.totalListItemCount = 5;

    const { waitForNlaIngestion } = await import("../src/musicServerBrowserStore.js");
    const p = waitForNlaIngestion(ENTITY_ID);

    vi.advanceTimersByTime(4000);

    await p;
  });
});

describe("MusicServerMediaBrowser", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("browse returns items from list entries", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser();
    browser.ingestListEntry(ENTITY_ID, "U0-My Folder");
    browser.ingestListEntry(ENTITY_ID, "U1-Song - Artist");

    const result = await browser.browse(ENTITY_ID, { paging: new uc.Paging(1, 25) });
    expect(result).toBeDefined();
  });

  it("ingestXmlEntries parses XML items", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser();
    browser.ingestXmlEntries(ENTITY_ID, '<items offset="0000"><item title="Album 1"/><item title="Song - Artist"/></items>');

    const result = await browser.browse(ENTITY_ID, { paging: new uc.Paging(1, 25) });
    expect(result).toBeDefined();
  });

  it("isMainMenuRequest and isBackRequest detect correct IDs", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser();
    expect(browser.isMainMenuRequest("music-server:main-menu", "music-server://menu")).toBe(true);
    expect(browser.isBackRequest("music-server:menu-back", "music-server://menu")).toBe(true);
    expect(browser.isMainMenuRequest("other:id")).toBe(false);
    expect(browser.isBackRequest("other:id")).toBe(false);
  });

  it("resolveMenuOption returns undefined for non-matching media_id", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser();
    expect(browser.resolveMenuOption(undefined)).toBeUndefined();
    expect(browser.resolveMenuOption("no-match")).toBeUndefined();
    expect(browser.resolveMenuOption("music-server:menu:abc")).toBeUndefined();
    expect(browser.resolveMenuOption("music-server:menu:0")).toBeUndefined();
  });

  it("resolveMenuOption handles encoded title", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser();
    const option = browser.resolveMenuOption("music-server:menu:5:Hello%20World", "music-server://menu");
    expect(option).toBeDefined();
    expect(option!.menuIndex).toBe(5);
    expect(option!.title).toBe("Hello World");
  });

  it("resolveMenuOption handles invalid URI gracefully", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser();
    const option = browser.resolveMenuOption("music-server:menu:3:%E0%80%80", "music-server://menu");
    expect(option).toBeDefined();
    expect(option!.title).toBe("Menu 3");
  });

  it("resolveMenuOption rejects mismatched media_type", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser();
    const option = browser.resolveMenuOption("music-server:menu:1", "wrong://type");
    expect(option).toBeUndefined();
  });

  it("resolveMenuOption without mediaType", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser();
    const option = browser.resolveMenuOption("music-server:menu:1:Title");
    expect(option).toBeDefined();
    expect(option!.menuIndex).toBe(1);
    expect(option!.isBrowsable).toBe(true);
  });

  it("resolveMenuOption detects track title as not browsable", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser();
    const option = browser.resolveMenuOption("music-server:menu:1:Song%20-%20Artist", "music-server://menu");
    expect(option).toBeDefined();
    expect(option!.isBrowsable).toBe(false);
  });

  it("browse with root id", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser();
    browser.ingestListEntry(ENTITY_ID, "U0-Folder");
    const result = await browser.browse(ENTITY_ID, { media_id: "music-server:root", media_type: "music-server://menu", paging: new uc.Paging(1, 25) });
    expect(result).toBeDefined();
  });

  it("browse with main menu id", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser();
    const result = await browser.browse(ENTITY_ID, { media_id: "music-server:main-menu", media_type: "music-server://menu", paging: new uc.Paging(1, 25) });
    expect(result).toBeDefined();
  });

  it("browse with back id", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser();
    const result = await browser.browse(ENTITY_ID, { media_id: "music-server:menu-back", media_type: "music-server://menu", paging: new uc.Paging(1, 25) });
    expect(result).toBeDefined();
  });

  it("browse with unknown menu id returns BrowseResult", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser();
    const result = await browser.browse(ENTITY_ID, { media_id: "music-server:menu:999", media_type: "music-server://menu", paging: new uc.Paging(1, 25) });
    expect(result).toBeDefined();
  });

  it("browse with empty media_id", async () => {
    const { MusicServerMediaBrowser } = await import("../src/musicServerMediaBrowser.js");
    const browser = new MusicServerMediaBrowser();
    const result = await browser.browse(ENTITY_ID, { paging: new uc.Paging(1, 25) });
    expect(result).toBeDefined();
  });
});
