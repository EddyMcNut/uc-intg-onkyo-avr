import { applyAvrDefaults, validateAvrPayload } from "../src/configValidation.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  default: { existsSync: mockExistsSync, readFileSync: mockReadFileSync, writeFileSync: mockWriteFileSync }
}));

const { ConfigStore, configPathFor, normalizeAvrConfig } = await import("../src/configManager.js");
const { ManualConfigParser } = await import("../src/manualConfigParser.js");

// Characterization of the four ways an AVR setting is parsed:
// - load:     applyAvrDefaults (config file at startup, via ConfigStore.load; result is persisted)
// - runtime:  normalizeAvrConfig (per-zone runtime config)
// - validate: validateAvrPayload (setup save and backup restore; may reject)
// - manual:   ManualConfigParser (setup form)
// They all use the shared field parsers in configConstants.ts and must agree, with two intended exceptions:
// - validate may reject a value that the lenient paths replace with the default;
// - manual only converts numbers (range errors are reported by validate), and load keeps legacy boolean
//   createTunerPresets values as stored.
const FIELDS: Record<string, unknown[]> = {
  port: [undefined, 60128, "60128", "abc", 0, -1, 70000, "70000"],
  queueThreshold: [undefined, 100, "250", "abc", -5, "-5", ""],
  albumArtURL: [undefined, "", "  ", "album_art.cgi", " art.cgi "],
  volumeScale: [undefined, 80, "100", "auto", "AUTO", 50, "x"],
  useAvrReportedInputs: [undefined, true, false, "true", "false", "yes", ""],
  volumeDisplay: [undefined, "absolute", "relative", "RELATIVE", "bogus"],
  adjustVolumeDispl: [undefined, true, false, "false", "TRUE", ""],
  entityNameStyle: [undefined, "long", "short", "LONG", "bogus"],
  createSensors: [undefined, true, false, "false", ""],
  createTunerPresets: [undefined, true, false, "true", "no", "alphabetical", "preset-order", "none", "bogus"],
  createRemoteEntity: [undefined, true, false, "false"],
  createDiracSelectEntity: [undefined, true, false, "false"],
  netMenuDelay: [undefined, 500, "800", "abc", -1, "-1", ""],
  tuneinPresetPosition: [undefined, 1, "5", 0, 11, "abc"],
  tuneinMenuStyle: [undefined, "full", "mypresets-preset-order", "preset-order", "mypresets", "bogus"],
  inputSourceLayout: [undefined, "combined", "network-first", "network-last", "separate", "NETWORK-FIRST", "bogus"],
  networkInputMarker: [undefined, "none", "🌐", "bogus"],
  networkNavigationMode: [undefined, "modern", "legacy", "LEGACY", "bogus"]
};

const MANUAL_KEYS: Record<string, string> = { port: "portNum", queueThreshold: "queueThresholdValue", albumArtURL: "albumArtURLValue" };
const BASE = { model: "TX-RZ50", ip: "192.168.1.10", port: 60128, zone: "main" as const };

function parseAll(field: string, raw: unknown) {
  const avr: Record<string, unknown> = { ...BASE, [field]: raw };
  if (raw === undefined) delete avr[field];
  const validated = validateAvrPayload({ ...avr });
  const manual = new ManualConfigParser().parse({ model: BASE.model, ipAddress: BASE.ip, port: BASE.port, [field]: raw } as never) as unknown as Record<string, unknown>;
  return {
    load: (applyAvrDefaults({ ...avr }) as unknown as Record<string, unknown>)[field],
    runtime: (normalizeAvrConfig({ ...avr } as never) as unknown as Record<string, unknown>)[field],
    validate: validated.errors.length > 0 ? undefined : (validated.normalized as unknown as Record<string, unknown>)[field],
    rejected: validated.errors.length > 0,
    manual: manual[MANUAL_KEYS[field] ?? `${field}Value`]
  };
}

const cases = Object.entries(FIELDS).flatMap(([field, inputs]) => inputs.map((raw) => [field, raw] as const));

describe("AVR config parse paths agree", () => {
  it.each(cases)("%s = %j", (field, raw) => {
    const result = parseAll(field, raw);
    const legacyBoolean = field === "createTunerPresets" && typeof raw === "boolean";

    if (!legacyBoolean) expect(result.load).toEqual(result.runtime);
    if (!result.rejected) {
      expect(result.validate).toEqual(result.runtime);
      expect(result.manual).toEqual(result.runtime);
    }
  });

  it("validation rejects the out-of-range numbers that the manual parser passes through", () => {
    for (const [field, raw] of [
      ["port", 70000],
      ["queueThreshold", -5],
      ["netMenuDelay", -1],
      ["tuneinPresetPosition", 0]
    ] as const) {
      const result = parseAll(field, raw);
      expect(result.manual).toBe(raw);
      expect(result.rejected).toBe(true);
    }
  });

  it("validation accepts empty values and surrounding whitespace like the other paths", () => {
    for (const [field, raw] of [
      ["queueThreshold", ""],
      ["netMenuDelay", ""],
      ["albumArtURL", "  "],
      ["albumArtURL", " art.cgi "]
    ] as const) {
      expect(parseAll(field, raw).rejected).toBe(false);
    }
  });

  it("keeps volumeScaleDiscovered when a setup payload is validated", () => {
    const result = validateAvrPayload({ ...BASE, volumeScale: 80, volumeScaleDiscovered: true });
    expect(result.normalized?.volumeScaleDiscovered).toBe(true);
  });
});

describe("ConfigStore.load persistence", () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
  });

  it("does not rewrite a config that is already normalized", () => {
    const normalized = applyAvrDefaults({ ...BASE, createTunerPresets: "preset-order" });
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ avrs: [normalized] }));

    new ConfigStore(configPathFor("/tmp/uc-test")).load();

    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("persists coerced values for a config holding invalid values", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ avrs: [{ ...BASE, volumeDisplay: "RELATIVE", queueThreshold: "-5", inputSourceLayout: "separate" }] }));

    const result = new ConfigStore(configPathFor("/tmp/uc-test")).load();

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    expect(result.avrs?.[0]).toMatchObject({ volumeDisplay: "relative", queueThreshold: 100, inputSourceLayout: "network-last" });
  });
});
