import { describe, it, expect, beforeAll } from "vitest";

describe("menuEntryParser", () => {
  let mod: any;

  beforeAll(async () => {
    mod = await import("../src/menuEntryParser.js");
  });

  describe("parseIndexedMenuEntry", () => {
    it("returns undefined for unmatched format", () => {
      expect(mod.parseIndexedMenuEntry("invalid")).toBeUndefined();
    });

    it("parses indexed menu entry stripping %s suffix", () => {
      const result = mod.parseIndexedMenuEntry("U5-Spotify %s");
      expect(result).toEqual({ menuIndex: 5, rawTitle: "Spotify" });
    });

    it("parses indexed menu entry without %s suffix", () => {
      const result = mod.parseIndexedMenuEntry("U3-Test Title");
      expect(result).toEqual({ menuIndex: 3, rawTitle: "Test Title" });
    });
  });

  describe("getXmlOffset", () => {
    it("extracts offset from items element", () => {
      expect(mod.getXmlOffset('<items offset="20">')).toBe(20);
    });

    it("returns 0 when no offset attribute", () => {
      expect(mod.getXmlOffset("<items>")).toBe(0);
    });
  });

  describe("unescapeXml", () => {
    it("unescapes all standard XML entities", () => {
      expect(mod.unescapeXml("&amp; &lt; &gt; &quot; &apos;")).toBe("& < > \" '");
    });
  });

  describe("parseXmlItems", () => {
    it("parses items from XML payload", () => {
      const xml = '<item title="Song A" iconid="1" /> <item title="Song B" iconid="2" />';
      const items = mod.parseXmlItems(xml);
      expect(items).toHaveLength(2);
      expect(items[0].title).toBe("Song A");
      expect(items[1].title).toBe("Song B");
    });

    it("returns empty array for no matches", () => {
      expect(mod.parseXmlItems("<root></root>")).toEqual([]);
    });

    it("handles missing attributes gracefully", () => {
      const items = mod.parseXmlItems('<item someattr="x" />');
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe("");
      expect(items[0].iconId).toBe("");
    });
  });
});
