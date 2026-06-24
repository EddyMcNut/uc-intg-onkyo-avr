import { describe, it, expect, vi, beforeAll } from "vitest";

describe("utils", () => {
  let mod: any;

  beforeAll(async () => {
    mod = await import("../src/utils.js");
  });

  describe("delay", () => {
    it("resolves after given ms", async () => {
      const start = Date.now();
      await mod.delay(5);
      expect(Date.now() - start).toBeGreaterThanOrEqual(4);
    });
  });

  describe("toHex", () => {
    it("formats number as uppercase hex with padding", () => {
      expect(mod.toHex(255, 4)).toBe("00FF");
    });

    it("handles zero", () => {
      expect(mod.toHex(0, 2)).toBe("00");
    });

    it("handles large width", () => {
      expect(mod.toHex(16, 6)).toBe("000010");
    });
  });
});
