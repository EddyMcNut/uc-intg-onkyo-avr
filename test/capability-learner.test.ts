import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";

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
const T0 = 1_700_000_000_000;

function makeMockEiscp() {
  const raw = vi.fn(() => Promise.resolve());
  const off = vi.fn();
  const on = vi.fn();
  return { on, off, raw };
}

describe("capabilityLearner", () => {
  let ConfigManager: any;
  let learningStore: any;
  let CapabilityLearner: any;
  let learnerFor: any;
  let isPlausibleFldText: (text: string) => boolean;

  beforeAll(async () => {
    vi.stubEnv("UC_CONFIG_HOME", "/tmp/uc-learner-test");
    const cm = await import("../src/configManager.js");
    ConfigManager = cm.ConfigManager;
    cm.setConfigDir("/tmp/uc-learner-test");
    const ls = await import("../src/learningStore.js");
    learningStore = ls.learningStore;
    const mod = await import("../src/capabilityLearner.js");
    CapabilityLearner = mod.CapabilityLearner;
    learnerFor = mod.learnerFor;
    isPlausibleFldText = mod.isPlausibleFldText;
  });

  beforeEach(() => {
    ConfigManager.config = {};
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    learningStore.ensureSeed(PHYSICAL_AVR);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function attach(mock: any): { learner: any; dataCb: (update: any) => Promise<void> } {
    const learner = new CapabilityLearner(mock, PHYSICAL_AVR);
    learner.attach();
    expect(mock.on).toHaveBeenCalledWith("data", expect.any(Function));
    const dataCb = mock.on.mock.calls[0][1];
    return { learner, dataCb };
  }

  describe("isPlausibleFldText", () => {
    it("accepts a normal display name", () => {
      expect(isPlausibleFldText("Dolby Surr")).toBe(true);
      expect(isPlausibleFldText("DAB")).toBe(true);
      expect(isPlausibleFldText("TuneIn Radio")).toBe(true);
    });

    it("rejects empty, overly long, or non-alphanumeric text", () => {
      expect(isPlausibleFldText("")).toBe(false);
      expect(isPlausibleFldText("   ")).toBe(false);
      expect(isPlausibleFldText("x".repeat(49))).toBe(false);
      expect(isPlausibleFldText("...")).toBe(false);
      expect(isPlausibleFldText(null as unknown as string)).toBe(false);
    });
  });

  describe("trigger and capture", () => {
    it("does not trigger when learning is disabled", async () => {
      ConfigManager.config = { learningEnabled: false };
      const mock = makeMockEiscp();
      const { dataCb } = attach(mock);

      await dataCb({ command: "listening-mode", iscpCommand: "LMD08", argument: ["orchestra"], zone: "main" });
      expect(mock.raw).not.toHaveBeenCalled();
    });

    it("re-sends the same ISCP command for an un-learned listening mode", async () => {
      const mock = makeMockEiscp();
      const { dataCb } = attach(mock);

      await dataCb({ command: "listening-mode", iscpCommand: "LMD08", argument: ["orchestra"], zone: "main" });
      expect(mock.raw).toHaveBeenCalledWith("LMD08");
    });

    it("captures a FLD display text within the window and commits it after a stable echo", async () => {
      const mock = makeMockEiscp();
      const { dataCb } = attach(mock);

      await dataCb({ command: "listening-mode", iscpCommand: "LMD08", argument: ["orchestra"], zone: "main" });
      vi.setSystemTime(T0 + 2000);
      await dataCb({ command: "FLD", argument: "Dolby-Surr", zone: "main" });
      await dataCb({ command: "FLD", argument: "Dolby-Surr", zone: "main" });

      const entry = learningStore.getEntry(PHYSICAL_AVR, "LMD", "08");
      expect(entry!.updated).toBe(true);
      expect(entry!.displayName).toBe("Dolby-Surr");
    });

    it("does not commit a single transitional FLD sample (needs a stable repeat)", async () => {
      const mock = makeMockEiscp();
      const { dataCb } = attach(mock);

      await dataCb({ command: "listening-mode", iscpCommand: "LMD00", argument: ["stereo"], zone: "main" });
      vi.setSystemTime(T0 + 2000);
      await dataCb({ command: "FLD", argument: "St", zone: "main" });

      expect(learningStore.isUpdated(PHYSICAL_AVR, "LMD", "00")).toBe(false);

      // A second, different sample replaces the candidate instead of committing.
      await dataCb({ command: "FLD", argument: "Stereo", zone: "main" });
      expect(learningStore.isUpdated(PHYSICAL_AVR, "LMD", "00")).toBe(false);

      // The stable display text commits.
      await dataCb({ command: "FLD", argument: "Stereo", zone: "main" });
      expect(learningStore.getEntry(PHYSICAL_AVR, "LMD", "00")!.updated).toBe(true);
      expect(learningStore.getEntry(PHYSICAL_AVR, "LMD", "00")!.displayName).toBe("Stereo");
    });

    it("captures learned SLI source names for fixed inputs too", async () => {
      const mock = makeMockEiscp();
      const { dataCb } = attach(mock);

      await dataCb({ command: "input-selector", iscpCommand: "SLI10", argument: ["dvd"], zone: "main" });
      vi.setSystemTime(T0 + 2000);
      await dataCb({ command: "FLD", argument: "DVD", zone: "main" });
      await dataCb({ command: "FLD", argument: "DVD", zone: "main" });

      const entry = learningStore.getEntry(PHYSICAL_AVR, "SLI", "10");
      expect(entry!.updated).toBe(true);
      expect(entry!.displayName).toBe("DVD");
    });

    it("skips SLI sources whose FLD shows content (DAB/FM/USB/...)", async () => {
      const mock = makeMockEiscp();
      const { dataCb } = attach(mock);

      for (const code of ["33", "24", "2B"]) {
        await dataCb({ command: "input-selector", iscpCommand: `SLI${code}`, argument: ["x"], zone: "main" });
      }
      expect(mock.raw).not.toHaveBeenCalled();

      await dataCb({ command: "FLD", argument: "Sublime", zone: "main" });
      await dataCb({ command: "FLD", argument: "Sublime", zone: "main" });
      expect(learningStore.isUpdated(PHYSICAL_AVR, "SLI", "33")).toBe(false);
    });

    it("attributes an FLD echo only to the most recent pending capture", async () => {
      const mock = makeMockEiscp();
      const { dataCb } = attach(mock);

      await dataCb({ command: "input-selector", iscpCommand: "SLI23", argument: ["cd"], zone: "main" });
      vi.setSystemTime(T0 + 1000);
      await dataCb({ command: "listening-mode", iscpCommand: "LMD00", argument: ["stereo"], zone: "main" });

      vi.setSystemTime(T0 + 2000);
      await dataCb({ command: "FLD", argument: "St", zone: "main" });
      await dataCb({ command: "FLD", argument: "St", zone: "main" });

      // Only the later LMD capture is fed the display text; the older SLI capture is untouched.
      expect(learningStore.getEntry(PHYSICAL_AVR, "LMD", "00")!.updated).toBe(true);
      expect(learningStore.getEntry(PHYSICAL_AVR, "LMD", "00")!.displayName).toBe("St");
      expect(learningStore.isUpdated(PHYSICAL_AVR, "SLI", "23")).toBe(false);
    });

    it("honors the 60s cooldown before re-triggering the same code", async () => {
      const mock = makeMockEiscp();
      const { dataCb } = attach(mock);

      await dataCb({ command: "listening-mode", iscpCommand: "LMD08", argument: ["orchestra"], zone: "main" });
      vi.setSystemTime(T0 + 10_000);
      await dataCb({ command: "listening-mode", iscpCommand: "LMD08", argument: ["orchestra"], zone: "main" });
      expect(mock.raw).toHaveBeenCalledTimes(1);

      vi.setSystemTime(T0 + 70_000);
      await dataCb({ command: "listening-mode", iscpCommand: "LMD08", argument: ["orchestra"], zone: "main" });
      expect(mock.raw).toHaveBeenCalledTimes(2);
    });

    it("does not learn when the FLD text merely echoes the code", async () => {
      const mock = makeMockEiscp();
      const { dataCb } = attach(mock);

      await dataCb({ command: "listening-mode", iscpCommand: "LMD08", argument: ["orchestra"], zone: "main" });
      vi.setSystemTime(T0 + 2000);
      await dataCb({ command: "FLD", argument: "08", zone: "main" });

      expect(learningStore.isUpdated(PHYSICAL_AVR, "LMD", "08")).toBe(false);
    });

    it("does not learn a FLD capture that arrives outside the window", async () => {
      const mock = makeMockEiscp();
      const { dataCb } = attach(mock);

      await dataCb({ command: "listening-mode", iscpCommand: "LMD08", argument: ["orchestra"], zone: "main" });
      vi.setSystemTime(T0 + 10_000);
      await dataCb({ command: "FLD", argument: "Dolby-Surr", zone: "main" });

      expect(learningStore.isUpdated(PHYSICAL_AVR, "LMD", "08")).toBe(false);
    });

    it("skips network service (NSS) codes so content text is never learned as a source name", async () => {
      const mock = makeMockEiscp();
      const { dataCb } = attach(mock);

      await dataCb({ command: "input-selector", iscpCommand: "SLINSS01", argument: ["tunein"], zone: "main" });
      expect(mock.raw).not.toHaveBeenCalled();

      await dataCb({ command: "FLD", argument: "BBC Radio 4", zone: "main" });
      expect(learningStore.isUpdated(PHYSICAL_AVR, "SLI", "NSS01")).toBe(false);
      expect(learningStore.getDisplayLabel(PHYSICAL_AVR, "SLI", "NSS01", "tunein")).toBe("tunein");
    });

    it("ignores non-main-zone events", async () => {
      const mock = makeMockEiscp();
      const { dataCb } = attach(mock);

      await dataCb({ command: "listening-mode", iscpCommand: "SLZ08", argument: ["orchestra"], zone: "zone2" });
      expect(mock.raw).not.toHaveBeenCalled();

      await dataCb({ command: "FLD", argument: "Dolby-Surr", zone: "zone2" });
      expect(learningStore.isUpdated(PHYSICAL_AVR, "LMD", "08")).toBe(false);
    });

    it("does not re-trigger codes that were already learned", async () => {
      learningStore.commitLearned(PHYSICAL_AVR, "LMD", "08", "Dolby-Surr");
      const mock = makeMockEiscp();
      const { dataCb } = attach(mock);

      await dataCb({ command: "listening-mode", iscpCommand: "LMD08", argument: ["orchestra"], zone: "main" });
      expect(mock.raw).not.toHaveBeenCalled();
    });

    it("tolerates a failed re-send", async () => {
      const mock = makeMockEiscp();
      mock.raw = vi.fn(() => Promise.reject(new Error("disconnected")));
      const { dataCb } = attach(mock);

      await expect(dataCb({ command: "listening-mode", iscpCommand: "LMD08", argument: ["orchestra"], zone: "main" })).resolves.toBeUndefined();
      expect(mock.raw).toHaveBeenCalledWith("LMD08");
    });

    it("detach removes the data listener", () => {
      const mock = makeMockEiscp();
      const { learner } = attach(mock);
      learner.detach();
      expect(mock.off).toHaveBeenCalledWith("data", expect.any(Function));
    });
  });

  describe("learnerFor", () => {
    it("returns the same learner per eiscp instance", () => {
      const eiscp1 = makeMockEiscp();
      const eiscp2 = makeMockEiscp();
      expect(learnerFor(eiscp1, PHYSICAL_AVR)).toBe(learnerFor(eiscp1, PHYSICAL_AVR));
      expect(learnerFor(eiscp1, PHYSICAL_AVR)).not.toBe(learnerFor(eiscp2, PHYSICAL_AVR));
    });
  });
});
