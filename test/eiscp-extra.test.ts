import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("commandToIscp", () => {
  async function makeDriver() {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    return new EiscpDriver({ model: "TX-RZ50", host: "1.2.3.4" });
  }

  it("translates known command+args to ISCP using valueMap", async () => {
    const driver = await makeDriver();
    expect(driver.commandToIscp("system-power", "on", "main")).toBe("PWR01");
  });

  it("translates power standby", async () => {
    const driver = await makeDriver();
    expect(driver.commandToIscp("system-power", "standby", "main")).toBe("PWR00");
  });

  it("translates command with intgrRange to hex", async () => {
    const driver = await makeDriver();
    expect(driver.commandToIscp("volume", 50, "main")).toBe("MVL32");
  });

  it("pads intgrRange hex values with leading zeros", async () => {
    const driver = await makeDriver();
    expect(driver.commandToIscp("volume", 5, "main")).toBe("MVL05");
  });

  it("translates zone2 prefix via getZonePrefix", async () => {
    const driver = await makeDriver();
    expect(driver.commandToIscp("system-power", "on", "zone2")).toBe("ZPW01");
  });

  it("returns empty value for undefined args", async () => {
    const driver = await makeDriver();
    expect(driver.commandToIscp("system-power", undefined, "main")).toBe("PWR");
  });

  it("handles query command", async () => {
    const driver = await makeDriver();
    expect(driver.commandToIscp("system-power", "query", "main")).toBe("PWRQSTN");
  });

  it("returns zonePrefix + raw string for unknown args", async () => {
    const driver = await makeDriver();
    expect(driver.commandToIscp("system-power", "bogus", "main")).toBe("PWRbogus");
  });
});

describe("command string parsing", () => {
  async function makeDriver() {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    return new EiscpDriver({ model: "TX-RZ50", host: "1.2.3.4" });
  }

  it("parses 3-part string (zone.command.args)", async () => {
    const driver = await makeDriver();
    const rawSpy = vi.spyOn(driver, "raw").mockResolvedValue(undefined);
    await driver.command("zone2.system-power.on");
    expect(rawSpy).toHaveBeenCalledWith("ZPW01");
  });

  it("parses 2-part string (command.args)", async () => {
    const driver = await makeDriver();
    const rawSpy = vi.spyOn(driver, "raw").mockResolvedValue(undefined);
    await driver.command("system-power.on");
    expect(rawSpy).toHaveBeenCalledWith("PWR01");
  });

  it("parses 1-part string fallback", async () => {
    const driver = await makeDriver();
    const rawSpy = vi.spyOn(driver, "raw").mockResolvedValue(undefined);
    await driver.command("system-power");
    expect(rawSpy).toHaveBeenCalledWith("PWR");
  });

  it("parses object input with zone, command, args", async () => {
    const driver = await makeDriver();
    const rawSpy = vi.spyOn(driver, "raw").mockResolvedValue(undefined);
    await driver.command({ zone: "zone2", command: "system-power", args: "standby" });
    expect(rawSpy).toHaveBeenCalledWith("ZPW00");
  });

  it("parses object input without zone (defaults to main)", async () => {
    const driver = await makeDriver();
    const rawSpy = vi.spyOn(driver, "raw").mockResolvedValue(undefined);
    await driver.command({ command: "volume", args: 30 });
    expect(rawSpy).toHaveBeenCalledWith("MVL1E");
  });
});

describe("sendIscp routing through commandToIscp", () => {
  async function makeDriver() {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    return new EiscpDriver({ model: "TX-RZ50", host: "1.2.3.4" });
  }

  it("plain ISCP command goes through raw() directly", async () => {
    const driver = await makeDriver();
    const rawSpy = vi.spyOn(driver, "raw").mockResolvedValue(undefined);
    // sendIscp called via command: "system-power.on" -> "PWR01" -> no TIP/NSS -> raw()
    await driver.command("system-power.on");
    expect(rawSpy).toHaveBeenCalledWith("PWR01");
  });

  it("ISCP with NSS in value triggers handleNSSsend", async () => {
    const driver = await makeDriver();
    const rawSpy = vi.spyOn(driver, "raw").mockResolvedValue(undefined);
    // "tunein" maps to SLI with value NSS01 -> sendIscp("SLINSS01") triggers NSS path
    await driver.command("input-selector.tunein");
    // handleNSSsend sends SLI2B first (switch to NET), then NTCTOP, then NLSI, then SLIQSTN
    expect(rawSpy).toHaveBeenCalled();
    expect(rawSpy).toHaveBeenCalledWith(expect.stringContaining("SLI"));
  });

  it("passes ISCP with TIP prefix directly to sendIscp via raw() call", async () => {
    const driver = await makeDriver();
    const rawSpy = vi.spyOn(driver, "raw").mockResolvedValue(undefined);
    // Test sendIscp directly via private method
    await driver.sendIscp("TIP01");
    // handleTIPsend sends NTCTOP, waits, sends NTCSELECT, waits, sends NLSI
    expect(rawSpy).toHaveBeenCalledWith("NTCTOP");
  });
});

describe("multi-zone command routing", () => {
  async function makeDriver() {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    return new EiscpDriver({ model: "TX-RZ50", host: "1.2.3.4" });
  }

  it("routes multi-zone-volume", async () => {
    const driver = await makeDriver();
    const enqueueSpy = vi.spyOn(driver, "enqueueSend").mockResolvedValue(undefined);
    await driver.command("multi-zone-volume all-up");
    expect(enqueueSpy).toHaveBeenCalled();
  });

  it("routes multi-zone-muting", async () => {
    const driver = await makeDriver();
    const enqueueSpy = vi.spyOn(driver, "enqueueSend").mockResolvedValue(undefined);
    await driver.command("multi-zone-muting all-off");
    expect(enqueueSpy).toHaveBeenCalled();
  });
});

describe("constructor", () => {
  it("accepts undefined config and uses defaults", async () => {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    const driver = new EiscpDriver();
    expect(driver.eiscpConfig.port).toBe(60128);
    expect(driver.eiscpConfig.sendDelay).toBe(100);
  });

  it("accepts partial config", async () => {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    const driver = new EiscpDriver({ host: "1.2.3.4" });
    expect(driver.eiscpConfig.host).toBe("1.2.3.4");
    expect(driver.eiscpConfig.port).toBe(60128);
  });

  it("registers default error listener", async () => {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    const driver = new EiscpDriver({ host: "1.2.3.4" });
    expect(driver.listenerCount("error")).toBe(1);
  });
});

describe("enqueueIncoming", () => {
  it("queues incoming data and emits after delay", async () => {
    vi.useFakeTimers();
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    const driver = new EiscpDriver({ host: "1.2.3.4", receiveDelay: 10 });
    const dataSpy = vi.fn();
    driver.on("data", dataSpy);

    driver.enqueueIncoming({ command: "FLD", argument: "test", zone: "main", iscpCommand: "FLDTEST", host: "1.2.3.4", port: 60128, model: "TX-RZ50" });

    await vi.advanceTimersByTimeAsync(10);

    expect(dataSpy).toHaveBeenCalledWith(expect.objectContaining({ command: "FLD", argument: "test" }));
    vi.useRealTimers();
  });
});

describe("raw command validation", () => {
  it("raw throws when data is empty", async () => {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    const driver = new EiscpDriver({ host: "1.2.3.4" });
    await expect(driver.raw("")).rejects.toThrow("No data provided");
  });

  it("raw accepts non-empty string", async () => {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    const driver = new EiscpDriver({ host: "1.2.3.4" });
    const enqueueSpy = vi.spyOn(driver, "enqueueSend").mockResolvedValue(undefined);
    await driver.raw("PWR01");
    expect(enqueueSpy).toHaveBeenCalledWith("PWR01");
  });
});

describe("disconnect", () => {
  it("disconnect does not throw when not connected", async () => {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    const driver = new EiscpDriver({ host: "1.2.3.4" });
    expect(() => driver.disconnect()).not.toThrow();
  });
});

describe("eiscpConfig getter", () => {
  it("returns configuredZones when set", async () => {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    const driver = new EiscpDriver({ model: "TX-RZ50", host: "1.2.3.4", configuredZones: ["main", "zone2"] });
    expect(driver.eiscpConfig.configuredZones).toEqual(["main", "zone2"]);
  });
});

describe("getCommandValues", () => {
  it("handles dotted command (zone prefix)", async () => {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    const driver = new EiscpDriver({ model: "TX-RZ50", host: "1.2.3.4" });
    const values = driver.getCommandValues("zone2.volume");
    expect(Array.isArray(values)).toBe(true);
  });
});

describe("handleMultiZoneCommand", () => {
  it("logs warning for invalid format", async () => {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    const driver = new EiscpDriver({ model: "TX-RZ50", host: "1.2.3.4" });
    const warnSpy = vi.spyOn(driver, "enqueueSend").mockResolvedValue(undefined);
    // Single part (no action) triggers format warning and returns early
    await driver.command("multi-zone-volume");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("logs warning when no zones configured", async () => {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    // Empty configuredZones causes commands.length === 0
    const driver = new EiscpDriver({ model: "TX-RZ50", host: "1.2.3.4", configuredZones: [] });
    const warnSpy = vi.spyOn(driver, "enqueueSend").mockResolvedValue(undefined);
    await driver.command("multi-zone-volume all-up");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("command else-path coverage", () => {
  it("handles non-string, non-object data via fallback", async () => {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    const driver = new EiscpDriver({ model: "TX-RZ50", host: "1.2.3.4" });
    const rawSpy = vi.spyOn(driver, "raw").mockResolvedValue(undefined);
    // Number argument falls through to the else branch
    await driver.command(42 as any);
    // The fallback converts to string and calls sendIscp
    expect(rawSpy).toHaveBeenCalled();
  });
});

describe("isTIPCommand edge cases", () => {
  it("returns false for TIP without hex suffix", async () => {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    const driver = new EiscpDriver({ host: "1.2.3.4" });
    expect(driver.isTIPCommand("TIP")).toBe(false);
  });
});

describe("enqueueSend", () => {
  it("handles string data when connected", async () => {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    const driver = new EiscpDriver({ host: "1.2.3.4", sendDelay: 0 });
    driver.isConnected = true;
    driver.eiscp = { write: vi.fn() };

    await driver.enqueueSend("PWR01");

    expect(driver.eiscp.write).toHaveBeenCalledTimes(1);
  });

  it("handles array data when connected", async () => {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    const driver = new EiscpDriver({ host: "1.2.3.4", sendDelay: 0 });
    driver.isConnected = true;
    driver.eiscp = { write: vi.fn() };

    await driver.enqueueSend(["PWR01", "PWR00"]);

    expect(driver.eiscp.write).toHaveBeenCalledTimes(2);
  });

  it("throws when not connected", async () => {
    const mod = await import("../src/eiscp.js");
    const { EiscpDriver } = mod as any;
    const driver = new EiscpDriver({ host: "1.2.3.4" });
    driver.isConnected = false;
    driver.eiscp = null;

    await expect(driver.enqueueSend("PWR01")).rejects.toThrow("Send command while not connected");
  });
});
