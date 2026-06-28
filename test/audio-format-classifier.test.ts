import { describe, it, expect } from "vitest";

describe("classifyAudioFormat", () => {
  it("returns null for empty input", async () => {
    const mod = await import("../src/audioFormatClassifier.js");
    const { classifyAudioFormat } = mod as { classifyAudioFormat: (input: string) => string | null };
    expect(classifyAudioFormat("")).toBeNull();
    expect(classifyAudioFormat(undefined as unknown as string)).toBeNull();
  });

  it("detects Dolby Atmos", async () => {
    const mod = await import("../src/audioFormatClassifier.js");
    const { classifyAudioFormat, AudioFormatType } = mod as any;
    expect(classifyAudioFormat("Dolby Atmos")).toBe(AudioFormatType.DolbyAtmos);
    expect(classifyAudioFormat("atmos")).toBe(AudioFormatType.DolbyAtmos);
  });

  it("detects Dolby TrueHD", async () => {
    const mod = await import("../src/audioFormatClassifier.js");
    const { classifyAudioFormat, AudioFormatType } = mod as any;
    expect(classifyAudioFormat("TrueHD")).toBe(AudioFormatType.DolbyTrueHD);
    expect(classifyAudioFormat("true hd")).toBe(AudioFormatType.DolbyTrueHD);
  });

  it("detects Dolby Digital", async () => {
    const mod = await import("../src/audioFormatClassifier.js");
    const { classifyAudioFormat, AudioFormatType } = mod as any;
    expect(classifyAudioFormat("Dolby Digital")).toBe(AudioFormatType.DolbyDigital);
    expect(classifyAudioFormat("AC3")).toBe(AudioFormatType.DolbyDigital);
    expect(classifyAudioFormat("dd")).toBe(AudioFormatType.DolbyDigital);
    expect(classifyAudioFormat("ac-3")).toBe(AudioFormatType.DolbyDigital);
  });

  it("detects DTS:X", async () => {
    const mod = await import("../src/audioFormatClassifier.js");
    const { classifyAudioFormat, AudioFormatType } = mod as any;
    expect(classifyAudioFormat("DTS:X")).toBe(AudioFormatType.DTSX);
    expect(classifyAudioFormat("dts:x")).toBe(AudioFormatType.DTSX);
  });

  it("detects DTS-HD", async () => {
    const mod = await import("../src/audioFormatClassifier.js");
    const { classifyAudioFormat, AudioFormatType } = mod as any;
    expect(classifyAudioFormat("DTS-HD")).toBe(AudioFormatType.DTSHD);
    expect(classifyAudioFormat("dts hd")).toBe(AudioFormatType.DTSHD);
    expect(classifyAudioFormat("dts-ma")).toBe(AudioFormatType.DTSHD);
    expect(classifyAudioFormat("dts ma")).toBe(AudioFormatType.DTSHD);
  });

  it("detects DTS base format", async () => {
    const mod = await import("../src/audioFormatClassifier.js");
    const { classifyAudioFormat, AudioFormatType } = mod as any;
    expect(classifyAudioFormat("DTS")).toBe(AudioFormatType.DTS);
    expect(classifyAudioFormat("dts 5.1")).toBe(AudioFormatType.DTS);
  });

  it("detects multichannel PCM", async () => {
    const mod = await import("../src/audioFormatClassifier.js");
    const { classifyAudioFormat, AudioFormatType } = mod as any;
    expect(classifyAudioFormat("PCM Multichannel")).toBe(AudioFormatType.Multichannel);
    expect(classifyAudioFormat("LPCM 5.1")).toBe(AudioFormatType.Multichannel);
    expect(classifyAudioFormat("pcm multi")).toBe(AudioFormatType.Multichannel);
  });

  it("detects PCM stereo", async () => {
    const mod = await import("../src/audioFormatClassifier.js");
    const { classifyAudioFormat, AudioFormatType } = mod as any;
    expect(classifyAudioFormat("PCM")).toBe(AudioFormatType.PCM);
    expect(classifyAudioFormat("LPCM 2.0")).toBe(AudioFormatType.PCM);
  });

  it("detects analog", async () => {
    const mod = await import("../src/audioFormatClassifier.js");
    const { classifyAudioFormat, AudioFormatType } = mod as any;
    expect(classifyAudioFormat("Analog")).toBe(AudioFormatType.Analog);
    expect(classifyAudioFormat("analogue")).toBe(AudioFormatType.Analog);
  });

  it("defaults to stereo for unknown formats", async () => {
    const mod = await import("../src/audioFormatClassifier.js");
    const { classifyAudioFormat, AudioFormatType } = mod as any;
    expect(classifyAudioFormat("Unknown Format")).toBe(AudioFormatType.Stereo);
    expect(classifyAudioFormat("random text")).toBe(AudioFormatType.Stereo);
  });
});

describe("formatAudioTypeName", () => {
  it("returns human-readable names for each format type", async () => {
    const mod = await import("../src/audioFormatClassifier.js");
    const { formatAudioTypeName, AudioFormatType } = mod as any;
    expect(formatAudioTypeName(AudioFormatType.DolbyAtmos)).toBe("Dolby Atmos");
    expect(formatAudioTypeName(AudioFormatType.DolbyTrueHD)).toBe("Dolby TrueHD");
    expect(formatAudioTypeName(AudioFormatType.DolbyDigital)).toBe("Dolby Digital");
    expect(formatAudioTypeName(AudioFormatType.DTSX)).toBe("DTS:X");
    expect(formatAudioTypeName(AudioFormatType.DTSHD)).toBe("DTS-HD");
    expect(formatAudioTypeName(AudioFormatType.DTS)).toBe("DTS");
    expect(formatAudioTypeName(AudioFormatType.Multichannel)).toBe("Multichannel PCM");
    expect(formatAudioTypeName(AudioFormatType.PCM)).toBe("PCM Stereo");
    expect(formatAudioTypeName(AudioFormatType.Analog)).toBe("Analog");
    expect(formatAudioTypeName(AudioFormatType.Stereo)).toBe("Stereo");
    expect(formatAudioTypeName(null)).toBe("unknown");
  });
});
