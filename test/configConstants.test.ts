import { describe, it, expect, beforeAll } from "vitest";

describe("configConstants", () => {
  let parseSelectOptions: any;
  let parseBoolean: any;
  let normalizeAvrConfig: any;
  let physicalAvrIdFromEntityId: any;

  beforeAll(async () => {
    const mod = await import("../src/configConstants.js");
    parseSelectOptions = mod.parseSelectOptions;
    parseBoolean = mod.parseBoolean;
    normalizeAvrConfig = mod.normalizeAvrConfig;
    physicalAvrIdFromEntityId = mod.physicalAvrIdFromEntityId;
  });

  describe("parseSelectOptions", () => {
    it("returns null for null", () => {
      expect(parseSelectOptions(null)).toBeNull();
    });

    it("returns empty array for undefined", () => {
      expect(parseSelectOptions(undefined)).toEqual([]);
    });

    it("parses semicolon-separated string", () => {
      expect(parseSelectOptions("a;b;c")).toEqual(["a", "b", "c"]);
    });

    it("returns null for none string", () => {
      expect(parseSelectOptions("none")).toBeNull();
    });

    it("returns null for none in array of length 1", () => {
      expect(parseSelectOptions(["NONE"])).toBeNull();
    });

    it("returns array for non-none string in array", () => {
      expect(parseSelectOptions(["notnone"])).toEqual(["notnone"]);
    });

    it("returns empty array for unknown type", () => {
      expect(parseSelectOptions(42)).toEqual([]);
    });
  });

  describe("parseBoolean", () => {
    it("returns default for undefined", () => {
      expect(parseBoolean(undefined, false)).toBe(false);
    });

    it("returns true for boolean true", () => {
      expect(parseBoolean(true, false)).toBe(true);
    });

    it("parses string true", () => {
      expect(parseBoolean("true", false)).toBe(true);
    });

    it("parses string false", () => {
      expect(parseBoolean("false", true)).toBe(false);
    });

    it("returns default for non-boolean non-string", () => {
      expect(parseBoolean(42, true)).toBe(true);
    });
  });

  describe("physicalAvrIdFromEntityId", () => {
    it("returns null for less than 3 parts", () => {
      expect(physicalAvrIdFromEntityId("a b")).toBeNull();
    });

    it("returns combined id for 3+ parts", () => {
      expect(physicalAvrIdFromEntityId("a b c")).toBe("a b");
    });
  });

  describe("normalizeAvrConfig", () => {
    it("applies defaults for empty input", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4" });
      expect(result.port).toBe(60128);
      expect(result.albumArtURL).toBe("album_art.cgi");
    });

    it("normalizes queueThreshold from string", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4", queueThreshold: "5" as any });
      expect(result.queueThreshold).toBe(5);
    });

    it("normalizes volumeDisplay to absolute by default", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4" });
      expect(result.volumeDisplay).toBe("absolute");
    });

    it("normalizes entityNameStyle to short by default", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4" });
      expect(result.entityNameStyle).toBe("short");
    });

    it("normalizes netMenuDelay from string", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4", netMenuDelay: "3" as any });
      expect(result.netMenuDelay).toBe(3);
    });

    it("normalizes tuneinPresetPosition from string", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4", tuneinPresetPosition: "7" as any });
      expect(result.tuneinPresetPosition).toBe(7);
    });

    it("normalizes tuneinMenuStyle to mypresets by default", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4" });
      expect(result.tuneinMenuStyle).toBe("mypresets");
    });

    it("normalizes port from string", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4", port: "60128" as any });
      expect(result.port).toBe(60128);
    });

    it("handles queuethreshold without value", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4", queueThreshold: undefined });
      expect(result.queueThreshold).toBe(100);
    });

    it("handles invalid queueThreshold", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4", queueThreshold: "abc" as any });
      expect(result.queueThreshold).toBe(100);
    });

    it("normalizes volumeDisplay to relative", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4", volumeDisplay: "relative" as any });
      expect(result.volumeDisplay).toBe("relative");
    });

    it("normalizes entityNameStyle to long", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4", entityNameStyle: "long" as any });
      expect(result.entityNameStyle).toBe("long");
    });

    it("normalizes netMenuDelay as number", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4", netMenuDelay: 3 });
      expect(result.netMenuDelay).toBe(3);
    });

    it("normalizes tuneinPresetPosition as number", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4", tuneinPresetPosition: 7 });
      expect(result.tuneinPresetPosition).toBe(7);
    });

    it("normalizes tuneinMenuStyle to full", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4", tuneinMenuStyle: "full" as any });
      expect(result.tuneinMenuStyle).toBe("full");
    });

    it("normalizes port as number", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4", port: 60128 });
      expect(result.port).toBe(60128);
    });

    it("normalizes albumArtURL from string", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4", albumArtURL: "custom/art" });
      expect(result.albumArtURL).toBe("custom/art");
    });

    it("normalizes volumeScale as number", () => {
      const result = normalizeAvrConfig({ model: "TX", ip: "1.2.3.4", volumeScale: 80 });
      expect(result.volumeScale).toBe(80);
    });
  });
});
