import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

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

  describe("ensureEiscpConnected", () => {
    beforeAll(() => {
      vi.useFakeTimers();
    });

    afterAll(() => {
      vi.useRealTimers();
    });

    it("returns false when all connect attempts fail", async () => {
      const eiscp = {
        connected: false,
        connect: vi.fn().mockResolvedValue(undefined),
        waitForConnect: vi.fn().mockRejectedValue(new Error("not connected"))
      };

      const promise = mod.ensureEiscpConnected(eiscp, { host: "1.2.3.4" }, "testId", "test");

      // Advance through 5 retry delays (attempt 1-5 each have 1000ms delay)
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersToNextTimerAsync();
      }

      const result = await promise;
      expect(result).toBe(false);
      expect(eiscp.connect).toHaveBeenCalledTimes(1);
    });
  });
});
