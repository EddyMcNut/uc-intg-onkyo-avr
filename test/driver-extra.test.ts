import { describe, it, expect } from "vitest";

describe("normalizeAvrConfig (used by createAvrSpecificConfig)", () => {
  it("normalizes avr config with all fields", async () => {
    const mod = await import("../src/configManager.js");
    const { normalizeAvrConfig } = mod as any;

    const result = normalizeAvrConfig({ model: "TX-RZ50", ip: "1.2.3.4", zone: "main", volumeScale: 80, albumArtURL: "albumart.jpg" });

    expect(result.model).toBe("TX-RZ50");
    expect(result.ip).toBe("1.2.3.4");
    expect(result.zone).toBe("main");
    expect(result.volumeScale).toBe(80);
    expect(result.albumArtURL).toBe("albumart.jpg");
  });

  it("uses defaults for missing optional fields", async () => {
    const mod = await import("../src/configManager.js");
    const { normalizeAvrConfig } = mod as any;

    const result = normalizeAvrConfig({ model: "TX-RZ50", ip: "1.2.3.4" });

    expect(result.volumeScale).toBe(100);
    expect(result.queueThreshold).toBe(100);
  });
});
