import { describe, expect, it } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";
import { TuneInMediaBrowser } from "../src/tuneInMediaBrowser.js";

const ENTITY = "Tune 10.0.0.1 main";

describe("TuneInMediaBrowser branch coverage", () => {
  it("ingests presets only in the My Presets context", () => {
    const browser = new TuneInMediaBrowser();
    expect(() => browser.ingestListEntry("bad", "U0-Station")).not.toThrow();
    browser.ingestListEntry(ENTITY, "bad");
    browser.ingestListEntry(ENTITY, "U0-Station | FM");
    expect(browser.getPresetCount(ENTITY)).toBe(0);
    browser.setBrowseContext(ENTITY, "My Presets");
    browser.ingestListEntry(ENTITY, "U0-Station | FM");
    browser.ingestListEntry(ENTITY, "U1-Directory");
    expect(browser.getPresetCount(ENTITY)).toBe(2);
    expect(browser.hasPresets(ENTITY)).toBe(true);
  });

  it("handles menu entries, exclusions and XML items", async () => {
    const browser = new TuneInMediaBrowser();
    browser.ingestMenuListEntry(ENTITY, "bad");
    browser.ingestMenuListEntry(ENTITY, "U0-Search");
    browser.ingestMenuListEntry(ENTITY, "U1-Station | FM");
    browser.ingestMenuListEntry(ENTITY, "U2-Genres");
    browser.ingestMenuXmlEntries(ENTITY, "");
    browser.ingestMenuXmlEntries(ENTITY, '<items offset="0001"><item title="Login"/><item title="Station | FM"/><item title="Directory" iconid="folder"/></items>');
    browser.ingestXmlEntries(ENTITY, "");
    browser.ingestXmlEntries(ENTITY, '<items><item title="Station | FM"/><item title="Directory" iconid="folder"/></items>');

    expect(browser.resolvePreset()).toBeUndefined();
    expect(browser.resolvePreset("wrong")).toBeUndefined();
    expect(browser.resolvePreset("tunein:preset:0")).toBeUndefined();
    expect(browser.resolvePreset("tunein:preset:1", "wrong" as any)).toBeUndefined();
    expect(browser.resolvePreset("tunein:preset:1", uc.KnownMediaContentType.Radio)).toBeDefined();
    expect(browser.resolveMenuOption(ENTITY)).toBeUndefined();
    expect(browser.resolveMenuOption(ENTITY, "tunein:menu:1:Station", "wrong")).toBeUndefined();
    expect(browser.resolveMenuOption(ENTITY, "tunein:menu:0:Station", "tunein://menu")).toBeUndefined();
    expect(browser.resolveMenuOption(ENTITY, "tunein:menu:1:Station", "tunein://menu")).toBeDefined();
    await browser.browse(ENTITY, { media_id: "tunein:root", paging: new uc.Paging(1, 25) });
    await browser.browse(ENTITY, { media_id: "tunein:preset:1", media_type: uc.KnownMediaContentType.Radio, paging: new uc.Paging(1, 25) });
    expect(await browser.browse(ENTITY, { media_id: "unknown", paging: new uc.Paging(1, 25) })).toBe(uc.StatusCodes.NotFound);
    await browser.browseMenu(ENTITY, { paging: new uc.Paging(1, 25) });
    expect(browser.isMenuRootRequest("tunein:menu-root", "tunein://menu")).toBe(true);
    expect(browser.isBackRequest("tunein:menu-back", "tunein://menu")).toBe(true);
    expect(browser.isBackRequest("wrong")).toBe(false);
  });
});
