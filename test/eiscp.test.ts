import { describe, it, expect, vi } from "vitest";

it("constructor sets default config values", async () => {
  const mod = await import("../src/eiscp.js");
  const { EiscpDriver } = mod as any;

  const driver = new EiscpDriver({ model: "TX-RZ50", host: "1.2.3.4" });
  const config = driver.eiscpConfig;

  expect(config.model).toBe("TX-RZ50");
  expect(config.host).toBe("1.2.3.4");
  expect(config.port).toBe(60128);
  expect(config.sendDelay).toBe(100);
  expect(config.receiveDelay).toBe(100);
  expect(config.netMenuDelay).toBe(2500);
  expect(config.reconnect).toBe(false);
  expect(config.reconnectSleep).toBe(5);
});

it("connected getter returns false initially", async () => {
  const mod = await import("../src/eiscp.js");
  const { EiscpDriver } = mod as any;

  const driver = new EiscpDriver({ model: "TX-RZ50", host: "1.2.3.4" });
  expect(driver.connected).toBe(false);
});

it("updateConfig merges patches correctly", async () => {
  const mod = await import("../src/eiscp.js");
  const { EiscpDriver } = mod as any;

  const driver = new EiscpDriver({ model: "TX-RZ50", host: "1.2.3.4", port: 60128 });
  driver.updateConfig({ port: 60129, reconnect: true });

  expect(driver.eiscpConfig.port).toBe(60129);
  expect(driver.eiscpConfig.reconnect).toBe(true);
  expect(driver.eiscpConfig.model).toBe("TX-RZ50"); // unchanged
});

it("getCommands returns command mapping keys", async () => {
  const mod = await import("../src/eiscp.js");
  const { EiscpDriver } = mod as any;

  const driver = new EiscpDriver({ model: "TX-RZ50", host: "1.2.3.4" });
  const commands = driver.getCommands();

  expect(Array.isArray(commands)).toBe(true);
  expect(commands.length).toBeGreaterThan(0);
  expect(commands).toContain("system-power");
  expect(commands).toContain("volume");
  expect(commands).toContain("input-selector");
  expect(commands).toContain("listening-mode");
  expect(commands).toContain("audio-muting");
});

it("getCommandValues returns value keys for a known command", async () => {
  const mod = await import("../src/eiscp.js");
  const { EiscpDriver } = mod as any;

  const driver = new EiscpDriver({ model: "TX-RZ50", host: "1.2.3.4" });
  const values = driver.getCommandValues("system-power");

  expect(Array.isArray(values)).toBe(true);
  expect(values.length).toBeGreaterThan(0);
  expect(values).toContain("on");
  expect(values).toContain("standby");
});

it("getCommandValues returns empty array for unknown command", async () => {
  const mod = await import("../src/eiscp.js");
  const { EiscpDriver } = mod as any;

  const driver = new EiscpDriver({ model: "TX-RZ50", host: "1.2.3.4" });
  const values = driver.getCommandValues("nonexistent-command");

  expect(values).toEqual([]);
});

it("isTIPCommand returns true for TIP with valid hex suffix", async () => {
  const mod = await import("../src/eiscp.js");
  const { EiscpDriver } = mod as any;

  const driver = new EiscpDriver({ host: "1.2.3.4" });
  expect(driver.isTIPCommand("TIP01")).toBe(true);
  expect(driver.isTIPCommand("TIPFF")).toBe(true);
  expect(driver.isTIPCommand("TIP1A2B")).toBe(true);
});

it("isTIPCommand returns false for non-TIP commands", async () => {
  const mod = await import("../src/eiscp.js");
  const { EiscpDriver } = mod as any;

  const driver = new EiscpDriver({ host: "1.2.3.4" });
  expect(driver.isTIPCommand("SLI01")).toBe(false);
  expect(driver.isTIPCommand("PWR01")).toBe(false);
  expect(driver.isTIPCommand("TIP"))?.toBe(false);
  expect(driver.isTIPCommand("TIPXYZ")).toBe(false);
});

it("extractNSSCode extracts NSS code from command string", async () => {
  const mod = await import("../src/eiscp.js");
  const { EiscpDriver } = mod as any;

  const driver = new EiscpDriver({ host: "1.2.3.4" });
  expect(driver.extractNSSCode("NSS01")).toBe("NSS01");
  expect(driver.extractNSSCode("SLINSS02")).toBe("NSS02");
  expect(driver.extractNSSCode("NSS99")).toBe("NSS99");
});

it("extractNSSCode returns undefined when no NSS code present", async () => {
  const mod = await import("../src/eiscp.js");
  const { EiscpDriver } = mod as any;

  const driver = new EiscpDriver({ host: "1.2.3.4" });
  expect(driver.extractNSSCode("PWR00")).toBeUndefined();
  expect(driver.extractNSSCode("")).toBeUndefined();
  expect(driver.extractNSSCode("SLI")).toBeUndefined();
});

it("waitForConnect resolves immediately when connected", async () => {
  const mod = await import("../src/eiscp.js");
  const { EiscpDriver } = mod as any;

  const driver = new EiscpDriver({ host: "1.2.3.4" });
  // Bypass normal connection by setting internal state
  driver.isConnected = true;

  await expect(driver.waitForConnect(100)).resolves.toBeUndefined();
});

it("waitForConnect rejects on timeout when not connected", async () => {
  const mod = await import("../src/eiscp.js");
  const { EiscpDriver } = mod as any;

  const driver = new EiscpDriver({ host: "1.2.3.4" });

  await expect(driver.waitForConnect(50)).rejects.toThrow("Timeout waiting for AVR connection");
});
