import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { SetupInputSourceProbe } from "../src/setupInputSourceProbe.js";

class FakeEiscpDriver extends EventEmitter {
  disconnect = vi.fn();
  discover = vi.fn();
  connect = vi.fn();
  waitForConnect = vi.fn();
  command = vi.fn();
}

describe("SetupInputSourceProbe", () => {
  it("returns unavailable and disconnects when connection fails", async () => {
    const driver = new FakeEiscpDriver();
    driver.connect.mockResolvedValue(false);
    const probe = new SetupInputSourceProbe(() => driver as never);

    await expect(probe.query("TX-RZ50", "192.168.1.20", 60128)).resolves.toEqual({
      inputs: [],
      available: false,
      model: "TX-RZ50",
      ip: "192.168.1.20",
      port: 60128
    });
    expect(driver.disconnect).toHaveBeenCalledOnce();
    expect(driver.command).not.toHaveBeenCalled();
  });

  it("returns unavailable when discovery finds no AVR", async () => {
    const driver = new FakeEiscpDriver();
    driver.discover.mockResolvedValue([]);
    const probe = new SetupInputSourceProbe(() => driver as never);

    await expect(probe.query("", "", 60128)).resolves.toEqual({ inputs: [], available: false });
    expect(driver.discover).toHaveBeenCalledWith({ address: "255.255.255.255", timeout: 3, devices: 1 });
    expect(driver.disconnect).toHaveBeenCalledOnce();
  });
});
