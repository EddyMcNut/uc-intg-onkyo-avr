import { describe, it, expect } from "vitest";

describe("ManualConfigParser", () => {
  it("parses full valid input", async () => {
    const mod = await import("../src/manualConfigParser.js");
    const { ManualConfigParser } = mod as { ManualConfigParser: new () => any };
    const parser = new ManualConfigParser();
    const result = parser.parse({
      model: "TX-RZ50",
      ipAddress: "192.168.1.100",
      port: 60128,
      queueThreshold: 200,
      albumArtURL: "album_art.cgi",
      volumeScale: 80,
      volumeDisplay: "relative",
      adjustVolumeDispl: "false",
      zoneCount: 2,
      createSensors: "true",
      netMenuDelay: 300,
      tuneinPresetPosition: 3,
      entityNameStyle: "short",
      tuneinMenuStyle: "full",
      listeningModeOptions: "stereo; straight-decode",
      logLevel: "debug"
    });
    expect(result.modelName).toBe("TX-RZ50");
    expect(result.ipVal).toBe("192.168.1.100");
    expect(result.portNum).toBe(60128);
    expect(result.queueThresholdValue).toBe(200);
    expect(result.albumArtURLValue).toBe("album_art.cgi");
    expect(result.volumeScaleValue).toBe(80);
    expect(result.volumeDisplayValue).toBe("relative");
    expect(result.adjustVolumeDisplValue).toBe(false);
    expect(result.zoneCountValue).toBe(2);
    expect(result.createSensorsValue).toBe(true);
    expect(result.netMenuDelayValue).toBe(300);
    expect(result.tuneinPresetPositionValue).toBe(3);
    expect(result.entityNameStyleValue).toBe("short");
    expect(result.listeningModeOptions).toBe("stereo; straight-decode");
    expect(result.logLevelValue).toBe("debug");
  });

  it("applies defaults for missing or invalid values", async () => {
    const mod = await import("../src/manualConfigParser.js");
    const { ManualConfigParser } = mod as { ManualConfigParser: new () => any };
    const parser = new ManualConfigParser();
    const result = parser.parse({});

    expect(result.modelName).toBe("");
    expect(result.ipVal).toBe("");
    expect(result.portNum).toBe(60128);
    expect(result.queueThresholdValue).toBe(100);
    expect(result.albumArtURLValue).toBe("album_art.cgi");
    expect(result.volumeScaleValue).toBe(100);
    expect(result.volumeDisplayValue).toBe("absolute");
    expect(result.adjustVolumeDisplValue).toBe(true);
    expect(result.zoneCountValue).toBe(1);
    expect(result.createSensorsValue).toBe(true);
    expect(result.netMenuDelayValue).toBe(500);
    expect(result.tuneinPresetPositionValue).toBe(1);
    expect(result.entityNameStyleValue).toBe("short");
    expect(result.listeningModeOptions).toBe("");
    expect(result.logLevelValue).toBe("warn");
  });

  it("clamps port to defaults on NaN", async () => {
    const mod = await import("../src/manualConfigParser.js");
    const { ManualConfigParser } = mod as { ManualConfigParser: new () => any };
    const parser = new ManualConfigParser();
    expect(parser.parse({ port: "not-a-number" }).portNum).toBe(60128);
    expect(parser.parse({ port: null }).portNum).toBe(60128);
  });

  it("validates volume scale (only 80 or 100)", async () => {
    const mod = await import("../src/manualConfigParser.js");
    const { ManualConfigParser } = mod as { ManualConfigParser: new () => any };
    const parser = new ManualConfigParser();
    expect(parser.parse({ volumeScale: 80 }).volumeScaleValue).toBe(80);
    expect(parser.parse({ volumeScale: 100 }).volumeScaleValue).toBe(100);
    // Invalid values fall back to default
    expect(parser.parse({ volumeScale: 50 }).volumeScaleValue).toBe(100);
    expect(parser.parse({ volumeScale: "abc" }).volumeScaleValue).toBe(100);
  });

  it("validates tuneinPresetPosition (1-9 range)", async () => {
    const mod = await import("../src/manualConfigParser.js");
    const { ManualConfigParser } = mod as { ManualConfigParser: new () => any };
    const parser = new ManualConfigParser();
    expect(parser.parse({ tuneinPresetPosition: 5 }).tuneinPresetPositionValue).toBe(5);
    expect(parser.parse({ tuneinPresetPosition: 0 }).tuneinPresetPositionValue).toBe(1);
    expect(parser.parse({ tuneinPresetPosition: 10 }).tuneinPresetPositionValue).toBe(1);
  });

  it("validates zoneCount (1-4 range)", async () => {
    const mod = await import("../src/manualConfigParser.js");
    const { ManualConfigParser } = mod as { ManualConfigParser: new () => any };
    const parser = new ManualConfigParser();
    expect(parser.parse({ zoneCount: 3 }).zoneCountValue).toBe(3);
    expect(parser.parse({ zoneCount: 0 }).zoneCountValue).toBe(1);
    expect(parser.parse({ zoneCount: 5 }).zoneCountValue).toBe(1);
  });

  it("parses logLevel with fallback", async () => {
    const mod = await import("../src/manualConfigParser.js");
    const { ManualConfigParser } = mod as { ManualConfigParser: new () => any };
    const parser = new ManualConfigParser();
    expect(parser.parse({ logLevel: "info" }).logLevelValue).toBe("info");
    expect(parser.parse({ logLevel: "error" }).logLevelValue).toBe("error");
    expect(parser.parse({ logLevel: "invalid" }).logLevelValue).toBe("warn");
  });

  it("accepts fallback logLevel", async () => {
    const mod = await import("../src/manualConfigParser.js");
    const { ManualConfigParser } = mod as { ManualConfigParser: new () => any };
    const parser = new ManualConfigParser();
    expect(parser.parse({}, "debug").logLevelValue).toBe("debug");
  });
});
