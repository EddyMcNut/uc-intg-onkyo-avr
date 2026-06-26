import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("loggers", () => {
  let mod: any;

  beforeEach(async () => {
    vi.resetModules();
    mod = await import("../src/loggers.js");
  });

  it("setLogLevel changes log level", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    mod.setLogLevel("error");
    expect(mod.getLogLevel()).toBe("error");
    spy.mockRestore();
  });

  it("setLogLevel with same level does not log", () => {
    mod.setLogLevel("warn");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    mod.setLogLevel("warn");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("debug is suppressed when level is higher than debug", () => {
    mod.setLogLevel("info");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    mod.default.debug("test debug");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("info is printed when level is at or below info", () => {
    mod.setLogLevel("info");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    mod.default.info("test info");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("info is suppressed when level is higher than info", () => {
    mod.setLogLevel("warn");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    mod.default.info("test info");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("warn is printed when level is warn", () => {
    mod.setLogLevel("warn");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    mod.default.warn("test warn");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("error is printed at any level", () => {
    mod.setLogLevel("error");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    mod.default.error("test error");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("getLogLevel returns current level", () => {
    mod.setLogLevel("debug");
    expect(mod.getLogLevel()).toBe("debug");
  });

  it("debug prints when level is debug", () => {
    mod.setLogLevel("debug");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    mod.default.debug("test debug visible");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("error prints when level is debug", () => {
    mod.setLogLevel("debug");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    mod.default.error("test error visible");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("warn is suppressed when level is error", () => {
    mod.setLogLevel("error");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    mod.default.warn("test warn suppressed");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
