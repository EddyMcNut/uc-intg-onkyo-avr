import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const mockExistsSync = vi.fn(() => false);
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync
  }
}));

const PHYSICAL_AVR = "TX-RZ50 192.168.2.103";

describe("learningStore", () => {
  let ConfigManager: any;
  let learningStore: any;
  let extractIscpCode: (cmd: string) => string;

  beforeAll(async () => {
    vi.stubEnv("UC_CONFIG_HOME", "/tmp/uc-learning-test");
    const cm = await import("../src/configManager.js");
    ConfigManager = cm.ConfigManager;
    cm.setConfigDir("/tmp/uc-learning-test");
    const ls = await import("../src/learningStore.js");
    learningStore = ls.learningStore;
    extractIscpCode = ls.extractIscpCode;
  });

  beforeEach(() => {
    ConfigManager.config = {};
    mockWriteFileSync.mockClear();
  });

  describe("extractIscpCode", () => {
    it("extracts the ISCP code after the 3-character command", () => {
      expect(extractIscpCode("LMD08")).toBe("08");
      expect(extractIscpCode("SLI33")).toBe("33");
      expect(extractIscpCode("SLI2B")).toBe("2B");
    });
  });

  describe("ensureSeed", () => {
    it("builds a catalog from the eiscp mappings and persists it", () => {
      learningStore.ensureSeed(PHYSICAL_AVR);

      const catalog = ConfigManager.get().learning[PHYSICAL_AVR];
      expect(catalog).toBeDefined();
      expect(catalog.LMD["00"].names).toContain("stereo");
      expect(catalog.LMD["08"].names).toContain("orchestra");
      expect(catalog.LMD["01"].names).toContain("direct");
      expect(catalog.SLI["01"].names).toEqual(expect.arrayContaining(["video2", "cbl", "sat"]));
      expect(catalog.SLI["33"].names).toContain("dab");
      expect(catalog.SLI["2B"].names).toEqual(expect.arrayContaining(["net", "network"]));
    });

    it("includes network service (NSS) codes as legitimate options", () => {
      learningStore.ensureSeed(PHYSICAL_AVR);
      const sli = ConfigManager.get().learning[PHYSICAL_AVR].SLI;
      expect(sli["NSS01"].names).toContain("tunein");
      expect(sli["NSS02"].names).toContain("spotify");
      expect(sli["NSS03"].names).toContain("deezer");
    });

    it("excludes navigation codes from the catalog", () => {
      learningStore.ensureSeed(PHYSICAL_AVR);
      const catalog = ConfigManager.get().learning[PHYSICAL_AVR];
      for (const nav of ["UP", "DOWN", "QSTN", "MOVIE", "MUSIC", "GAME"]) {
        expect(catalog.LMD[nav]).toBeUndefined();
        expect(catalog.SLI[nav]).toBeUndefined();
      }
    });

    it("is idempotent and preserves learned entries", () => {
      learningStore.ensureSeed(PHYSICAL_AVR);
      const before = ConfigManager.get().learning[PHYSICAL_AVR].LMD["08"];
      learningStore.commitLearned(PHYSICAL_AVR, "LMD", "08", "Dolby-Surr");

      mockWriteFileSync.mockClear();
      learningStore.ensureSeed(PHYSICAL_AVR);

      const after = ConfigManager.get().learning[PHYSICAL_AVR].LMD["08"];
      expect(after.updated).toBe(true);
      expect(after.displayName).toBe("Dolby-Surr");
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it("leaves the catalog empty for a missing kind", () => {
      learningStore.ensureSeed(PHYSICAL_AVR);
      const catalog = ConfigManager.get().learning[PHYSICAL_AVR];
      expect(Object.keys(catalog.LMD).length).toBeGreaterThan(20);
      expect(Object.keys(catalog.SLI).length).toBeGreaterThan(20);
    });
  });

  describe("commitLearned / isUpdated / getDisplayLabel", () => {
    it("commits a learned display name and persists it", () => {
      learningStore.ensureSeed(PHYSICAL_AVR);
      learningStore.commitLearned(PHYSICAL_AVR, "LMD", "08", "Dolby-Surr");

      const entry = ConfigManager.get().learning[PHYSICAL_AVR].LMD["08"];
      expect(entry.updated).toBe(true);
      expect(entry.displayName).toBe("Dolby-Surr");
      expect(entry.names).toContain("orchestra");
      expect(learningStore.isUpdated(PHYSICAL_AVR, "LMD", "08")).toBe(true);
      expect(learningStore.isUpdated(PHYSICAL_AVR, "LMD", "00")).toBe(false);
      expect(learningStore.getDisplayLabel(PHYSICAL_AVR, "LMD", "08", "orchestra")).toBe("Dolby-Surr");
      expect(learningStore.getDisplayLabel(PHYSICAL_AVR, "LMD", "00", "stereo")).toBe("stereo");
    });

    it("is a no-op for an unknown code", () => {
      learningStore.ensureSeed(PHYSICAL_AVR);
      learningStore.commitLearned(PHYSICAL_AVR, "SLI", "99", "Unknown");
      expect(ConfigManager.get().learning[PHYSICAL_AVR].SLI["99"]).toBeUndefined();
    });

    it("is a no-op when the entry was already learned", () => {
      learningStore.ensureSeed(PHYSICAL_AVR);
      learningStore.commitLearned(PHYSICAL_AVR, "LMD", "08", "Dolby-Surr");
      learningStore.commitLearned(PHYSICAL_AVR, "LMD", "08", "Different Name");
      expect(ConfigManager.get().learning[PHYSICAL_AVR].LMD["08"].displayName).toBe("Dolby-Surr");
    });
  });

  describe("configured options update on learn", () => {
    it("replaces the learned alias in the configured listeningModeOptions list", () => {
      ConfigManager.save({
        avrs: [
          {
            model: "TX-RZ50",
            ip: "192.168.2.103",
            port: 60128,
            zone: "main",
            listeningModeOptions: ["dolby-surround-classical", "stereo"]
          }
        ]
      });
      learningStore.ensureSeed(PHYSICAL_AVR);
      learningStore.commitLearned(PHYSICAL_AVR, "LMD", "08", "Dolby-Surr");

      const avr = ConfigManager.get().avrs![0];
      expect(avr.listeningModeOptions).toEqual(["Dolby-Surr", "stereo"]);
    });

    it("collapses multiple aliases of the learned code to a single label", () => {
      ConfigManager.save({
        avrs: [
          {
            model: "TX-RZ50",
            ip: "192.168.2.103",
            port: 60128,
            zone: "main",
            listeningModeOptions: ["orchestra", "dolby-surround-classical", "stereo"]
          }
        ]
      });
      learningStore.ensureSeed(PHYSICAL_AVR);
      learningStore.commitLearned(PHYSICAL_AVR, "LMD", "08", "Dolby-Surr");

      const avr = ConfigManager.get().avrs![0];
      expect(avr.listeningModeOptions).toEqual(["Dolby-Surr", "stereo"]);
    });

    it("replaces the learned alias in the configured inputSelectorOptions list", () => {
      ConfigManager.save({
        avrs: [
          {
            model: "TX-RZ50",
            ip: "192.168.2.103",
            port: 60128,
            zone: "main",
            inputSelectorOptions: ["dab", "cd"]
          }
        ]
      });
      learningStore.ensureSeed(PHYSICAL_AVR);
      learningStore.commitLearned(PHYSICAL_AVR, "SLI", "33", "DAB");

      const avr = ConfigManager.get().avrs![0];
      expect(avr.inputSelectorOptions).toEqual(["DAB", "cd"]);
    });

    it("leaves other AVRs' configured lists untouched", () => {
      ConfigManager.save({
        avrs: [
          {
            model: "TX-RZ50",
            ip: "192.168.2.103",
            port: 60128,
            zone: "main",
            listeningModeOptions: ["dolby-surround-classical", "stereo"]
          },
          {
            model: "TX-NR797",
            ip: "192.168.2.200",
            port: 60128,
            zone: "main",
            listeningModeOptions: ["dolby-surround-classical", "stereo"]
          }
        ]
      });
      learningStore.ensureSeed(PHYSICAL_AVR);
      learningStore.commitLearned(PHYSICAL_AVR, "LMD", "08", "Dolby-Surr");

      const avrs = ConfigManager.get().avrs!;
      expect(avrs[0].listeningModeOptions).toEqual(["Dolby-Surr", "stereo"]);
      expect(avrs[1].listeningModeOptions).toEqual(["dolby-surround-classical", "stereo"]);
    });

    it("leaves 'all'/'none'/null configured options alone", () => {
      ConfigManager.save({
        avrs: [
          {
            model: "TX-RZ50",
            ip: "192.168.2.103",
            port: 60128,
            zone: "main",
            listeningModeOptions: "all",
            inputSelectorOptions: null
          }
        ]
      });
      learningStore.ensureSeed(PHYSICAL_AVR);
      learningStore.commitLearned(PHYSICAL_AVR, "LMD", "08", "Dolby-Surr");

      const avr = ConfigManager.get().avrs![0];
      expect(avr.listeningModeOptions).toBe("all");
      expect(avr.inputSelectorOptions).toBeNull();
    });

    it("does not touch the configured list when the label change is a no-op", () => {
      ConfigManager.save({
        avrs: [
          {
            model: "TX-RZ50",
            ip: "192.168.2.103",
            port: 60128,
            zone: "main",
            listeningModeOptions: ["stereo"]
          }
        ]
      });
      learningStore.ensureSeed(PHYSICAL_AVR);
      mockWriteFileSync.mockClear();
      learningStore.commitLearned(PHYSICAL_AVR, "LMD", "08", "Dolby-Surr");

      const avr = ConfigManager.get().avrs![0];
      expect(avr.listeningModeOptions).toEqual(["stereo"]);
    });
  });

  describe("resolveSendName", () => {
    it("resolves a learned display label back to the canonical name", () => {
      learningStore.ensureSeed(PHYSICAL_AVR);
      learningStore.commitLearned(PHYSICAL_AVR, "LMD", "08", "Dolby-Surr");
      learningStore.commitLearned(PHYSICAL_AVR, "SLI", "33", "DAB");

      expect(learningStore.resolveSendName(PHYSICAL_AVR, "LMD", "dolby-surr")).toBe("orchestra");
      expect(learningStore.resolveSendName(PHYSICAL_AVR, "SLI", "DAB")).toBe("dab");
    });

    it("returns the input unchanged for canonical or unknown names", () => {
      learningStore.ensureSeed(PHYSICAL_AVR);
      expect(learningStore.resolveSendName(PHYSICAL_AVR, "LMD", "stereo")).toBe("stereo");
      expect(learningStore.resolveSendName(PHYSICAL_AVR, "SLI", "cd")).toBe("cd");
      expect(learningStore.resolveSendName(PHYSICAL_AVR, "SLI", "no-such-option")).toBe("no-such-option");
    });
  });

  describe("listOptions / listLabels", () => {
    it("returns null when the catalog is not seeded (legacy fallback)", () => {
      expect(learningStore.listOptions("UNSEEDED", "LMD")).toBeNull();
      expect(learningStore.listLabels("UNSEEDED", "SLI")).toBeNull();
    });

    it("returns one item per seed name sorted by label", () => {
      learningStore.ensureSeed(PHYSICAL_AVR);
      const items = learningStore.listOptions(PHYSICAL_AVR, "SLI")!;
      const labels = items.map((i: any) => i.label);
      expect(labels).toContain("dab");
      expect(labels).toContain("cd");
      expect(labels).toContain("tunein");
      expect(labels).toEqual([...labels].sort());
      const dabItems = items.filter((i: any) => i.canonical === "dab");
      expect(dabItems.length).toBe(1);
    });

    it("collapses an updated entry to a single item with the display name label", () => {
      learningStore.ensureSeed(PHYSICAL_AVR);
      learningStore.commitLearned(PHYSICAL_AVR, "SLI", "33", "DAB");
      const items = learningStore.listOptions(PHYSICAL_AVR, "SLI")!.filter((i: any) => i.canonical === "dab");
      expect(items).toEqual([{ canonical: "dab", label: "DAB" }]);
      expect(learningStore.listLabels(PHYSICAL_AVR, "SLI")).toContain("DAB");
    });

    it("filters by compatible canonical names", () => {
      learningStore.ensureSeed(PHYSICAL_AVR);
      const items = learningStore.listOptions(PHYSICAL_AVR, "LMD", ["stereo", "orchestra"])!;
      const labels = items.map((i: any) => i.label);
      expect(labels).toContain("stereo");
      expect(labels).toContain("orchestra");
      expect(labels).toContain("dolby-surround-classical");
      expect(labels).not.toContain("direct");
    });

    it("returns all options when compatible filter is empty", () => {
      learningStore.ensureSeed(PHYSICAL_AVR);
      const items = learningStore.listOptions(PHYSICAL_AVR, "LMD", [])!;
      expect(items.length).toBeGreaterThan(20);
    });
  });

  describe("disabled behavior", () => {
    it("is enabled by default when learningEnabled is unset", () => {
      expect(learningStore.isEnabled()).toBe(true);
    });

    it("does not seed when disabled", () => {
      ConfigManager.config = { learningEnabled: false };
      learningStore.ensureSeed(PHYSICAL_AVR);
      expect(ConfigManager.get().learning).toBeUndefined();
    });

    it("falls back to canonical names when disabled (no catalog, legacy fallback)", () => {
      ConfigManager.config = { learningEnabled: false };
      expect(learningStore.getCatalog(PHYSICAL_AVR)).toBeUndefined();
      expect(learningStore.listLabels(PHYSICAL_AVR, "SLI")).toBeNull();
      expect(learningStore.listOptions(PHYSICAL_AVR, "LMD")).toBeNull();
      expect(learningStore.getDisplayLabel(PHYSICAL_AVR, "LMD", "08", "orchestra")).toBe("orchestra");
      expect(learningStore.resolveSendName(PHYSICAL_AVR, "SLI", "dab")).toBe("dab");
    });

    it("does not commit learned names when disabled", () => {
      ConfigManager.config = { learningEnabled: false };
      learningStore.commitLearned(PHYSICAL_AVR, "LMD", "08", "Dolby-Surr");
      expect(ConfigManager.get().learning).toBeUndefined();
    });

    it("re-enabling works after a disabled period (fresh catalog)", () => {
      ConfigManager.config = { learningEnabled: false };
      learningStore.ensureSeed(PHYSICAL_AVR);
      ConfigManager.config = { learningEnabled: true };
      learningStore.ensureSeed(PHYSICAL_AVR);
      const catalog = ConfigManager.get().learning[PHYSICAL_AVR];
      expect(catalog).toBeDefined();
      expect(catalog.LMD["08"].updated).toBe(false);
    });
  });

  describe("validateConfigPayload round-trip", () => {
    it("preserves learning data on backup/restore", () => {
      const payload = {
        config: {
          avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main" }],
          learning: {
            [PHYSICAL_AVR]: {
              LMD: { "08": { names: ["orchestra"], displayName: "Dolby-Surr", updated: true } },
              SLI: {}
            }
          }
        }
      };
      const res = ConfigManager.validateConfigPayload(payload);
      expect(res.errors).toEqual([]);
      expect(res.normalized!.learning![PHYSICAL_AVR].LMD["08"].displayName).toBe("Dolby-Surr");
      expect(res.normalized!.learning![PHYSICAL_AVR].LMD["08"].names).toContain("orchestra");
    });

    it("rejects an entry without valid names", () => {
      const payload = {
        config: {
          avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main" }],
          learning: {
            [PHYSICAL_AVR]: { LMD: { "08": { names: [], updated: true } }, SLI: {} }
          }
        }
      };
      const res = ConfigManager.validateConfigPayload(payload);
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors[0]).toContain("names");
    });

    it("rejects non-object kind entries", () => {
      const payload = {
        config: {
          avrs: [{ model: "TX-RZ50", ip: "192.168.2.103", port: 60128, zone: "main" }],
          learning: { [PHYSICAL_AVR]: { LMD: "not-an-object", SLI: {} } }
        }
      };
      const res = ConfigManager.validateConfigPayload(payload);
      expect(res.errors.length).toBeGreaterThan(0);
    });
  });
});
