import { describe, it, expect } from "vitest";

describe("getCompatibleListeningModes", () => {
  it("returns null for undefined or empty audio format", async () => {
    const mod = await import("../src/listeningModeFilters.js");
    const { getCompatibleListeningModes } = mod as { getCompatibleListeningModes: (fmt: string | undefined) => string[] | null };
    expect(getCompatibleListeningModes(undefined)).toBeNull();
    expect(getCompatibleListeningModes("")).toBeNull();
  });

  it("returns Dolby Atmos modes for atmos format", async () => {
    const mod = await import("../src/listeningModeFilters.js");
    const { getCompatibleListeningModes } = mod as any;
    const modes = getCompatibleListeningModes("Dolby Atmos");
    expect(modes).toBeTruthy();
    expect(modes.length).toBeGreaterThan(0);
    expect(modes).toContain("stereo");
    expect(modes).toContain("straight-decode");
  });

  it("returns Dolby Digital modes for Dolby format", async () => {
    const mod = await import("../src/listeningModeFilters.js");
    const { getCompatibleListeningModes } = mod as any;
    const modes = getCompatibleListeningModes("Dolby Digital");
    expect(modes).toBeTruthy();
    expect(modes).toContain("dolby-ex");
    expect(modes).toContain("neural-thx");
    expect(modes).toContain("straight-decode");
  });

  it("returns DTS modes for DTS format", async () => {
    const mod = await import("../src/listeningModeFilters.js");
    const { getCompatibleListeningModes } = mod as any;
    const modes = getCompatibleListeningModes("DTS");
    expect(modes).toBeTruthy();
    expect(modes).toContain("dts-neural:x");
  });

  it("returns DTS-HD modes for DTS-HD format", async () => {
    const mod = await import("../src/listeningModeFilters.js");
    const { getCompatibleListeningModes } = mod as any;
    const modes = getCompatibleListeningModes("DTS-HD");
    expect(modes).toBeTruthy();
    expect(modes).toContain("audyssey-dsx");
    expect(modes).toContain("dolby-ex-audyssey-dsx");
  });

  it("returns multichannel PCM modes for multichannel PCM", async () => {
    const mod = await import("../src/listeningModeFilters.js");
    const { getCompatibleListeningModes } = mod as any;
    const modes = getCompatibleListeningModes("Multichannel PCM");
    expect(modes).toBeTruthy();
    expect(modes).toContain("action");
    expect(modes).toContain("surround");
    expect(modes).not.toContain("dolby-ex");
  });

  it("returns analog modes same as stereo compatible", async () => {
    const mod = await import("../src/listeningModeFilters.js");
    const { getCompatibleListeningModes } = mod as any;
    const analog = getCompatibleListeningModes("Analog");
    const pcmStereo = getCompatibleListeningModes("PCM");
    expect(analog).toEqual(pcmStereo);
  });

  it("returns stereo compatible modes for stereo format", async () => {
    const mod = await import("../src/listeningModeFilters.js");
    const { getCompatibleListeningModes } = mod as any;
    const modes = getCompatibleListeningModes("stereo");
    expect(modes).toBeTruthy();
    expect(modes).toContain("stereo");
    expect(modes).toContain("direct");
    expect(modes).toContain("pure-audio");
    expect(modes).toContain("full-mono");
    expect(modes).not.toContain("straight-decode");
  });

  it("returns stereo modes for unknown format (default)", async () => {
    const mod = await import("../src/listeningModeFilters.js");
    const { getCompatibleListeningModes } = mod as any;
    const modes = getCompatibleListeningModes("Some Unknown Format");
    expect(modes).toBeTruthy();
    expect(modes).toContain("stereo");
    expect(modes).toContain("direct");
  });
});
