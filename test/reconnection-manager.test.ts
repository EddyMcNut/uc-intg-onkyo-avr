import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mod = await import("../src/reconnectionManager.js");
const { ReconnectionManager, DEFAULT_RECONNECTION_CONFIG } = mod as any;

function mockEiscp() {
  return {
    connect: vi.fn(),
    waitForConnect: vi.fn(),
    get connected() { return false; },
    disconnect: vi.fn()
  };
}

it("constructor uses default config when none provided", async () => {
  const rm = new ReconnectionManager();
  expect(rm.config.timeouts).toEqual([3000, 5000, 8000]);
  expect(rm.config.scheduleDelay).toBe(30000);
});

it("constructor accepts custom config", async () => {
  const rm = new ReconnectionManager({ timeouts: [1000], scheduleDelay: 5000 });
  expect(rm.config.timeouts).toEqual([1000]);
  expect(rm.config.scheduleDelay).toBe(5000);
});

it("attemptReconnection returns success when connect + waitForConnect succeed on first attempt", async () => {
  const rm = new ReconnectionManager({ timeouts: [1000, 2000], scheduleDelay: 5000 });
  const eiscp = mockEiscp();
  eiscp.connect.mockResolvedValue({ model: "M", host: "1.2.3.4", port: 60128 });
  eiscp.waitForConnect.mockResolvedValue(undefined);

  const result = await rm.attemptReconnection("M 1.2.3.4", eiscp, { model: "M", host: "1.2.3.4", port: 60128 });

  expect(result.success).toBe(true);
  expect(result.attempts).toBe(1);
  expect(eiscp.connect).toHaveBeenCalledTimes(1);
  expect(eiscp.waitForConnect).toHaveBeenCalledWith(1000);
});

it("attemptReconnection returns failure when all attempts exhausted", async () => {
  const rm = new ReconnectionManager({ timeouts: [100, 100], scheduleDelay: 5000 });
  const eiscp = mockEiscp();
  eiscp.connect.mockResolvedValue({ model: "M", host: "1.2.3.4", port: 60128 });
  eiscp.waitForConnect.mockRejectedValue(new Error("timeout"));

  const result = await rm.attemptReconnection("M 1.2.3.4", eiscp, { model: "M", host: "1.2.3.4", port: 60128 });

  expect(result.success).toBe(false);
  expect(result.attempts).toBe(2);
  expect(eiscp.connect).toHaveBeenCalledTimes(2);
});

it("hasScheduledReconnection returns false initially", async () => {
  const rm = new ReconnectionManager();
  expect(rm.hasScheduledReconnection("test")).toBe(false);
});

it("cancelScheduledReconnection returns false when no timer exists", async () => {
  const rm = new ReconnectionManager();
  expect(rm.cancelScheduledReconnection("nonexistent")).toBe(false);
});

it("cancelScheduledReconnection returns true when timer exists", async () => {
  const rm = new ReconnectionManager({ timeouts: [100], scheduleDelay: 60000 });
  const eiscp = mockEiscp();

  rm.scheduleReconnection("M 1.2.3.4", eiscp, { model: "M", host: "1.2.3.4", port: 60128 }, () => false, async () => {});
  expect(rm.hasScheduledReconnection("M 1.2.3.4")).toBe(true);
  expect(rm.cancelScheduledReconnection("M 1.2.3.4")).toBe(true);
  expect(rm.hasScheduledReconnection("M 1.2.3.4")).toBe(false);
});

it("cancelAllScheduledReconnections clears all timers", async () => {
  const rm = new ReconnectionManager({ timeouts: [100], scheduleDelay: 60000 });
  const eiscp = mockEiscp();

  rm.scheduleReconnection("avr1", eiscp, { model: "M1", host: "1.1.1.1", port: 60128 }, () => false, async () => {});
  rm.scheduleReconnection("avr2", eiscp, { model: "M2", host: "2.2.2.2", port: 60128 }, () => false, async () => {});

  expect(rm.hasScheduledReconnection("avr1")).toBe(true);
  expect(rm.hasScheduledReconnection("avr2")).toBe(true);

  rm.cancelAllScheduledReconnections();

  expect(rm.hasScheduledReconnection("avr1")).toBe(false);
  expect(rm.hasScheduledReconnection("avr2")).toBe(false);
});

it("scheduleReconnection skips when shouldSkip returns true", async () => {
  vi.useFakeTimers();
  const rm = new ReconnectionManager({ timeouts: [100], scheduleDelay: 5000 });
  const eiscp = mockEiscp();
  const onReconnected = vi.fn();

  rm.scheduleReconnection(
    "M 1.2.3.4",
    eiscp,
    { model: "M", host: "1.2.3.4", port: 60128 },
    () => true, // skip
    onReconnected
  );

  await vi.advanceTimersByTimeAsync(6000);

  expect(eiscp.connect).not.toHaveBeenCalled();
  expect(onReconnected).not.toHaveBeenCalled();
  expect(rm.hasScheduledReconnection("M 1.2.3.4")).toBe(false);
  vi.useRealTimers();
});

it("scheduleReconnection calls onReconnected on success", async () => {
  vi.useFakeTimers();
  const rm = new ReconnectionManager({ timeouts: [100], scheduleDelay: 5000 });
  const eiscp = mockEiscp();
  eiscp.connect.mockResolvedValue({ model: "M", host: "1.2.3.4", port: 60128 });
  eiscp.waitForConnect.mockResolvedValue(undefined);
  const onReconnected = vi.fn();

  rm.scheduleReconnection(
    "M 1.2.3.4",
    eiscp,
    { model: "M", host: "1.2.3.4", port: 60128 },
    () => false,
    onReconnected
  );

  await vi.advanceTimersByTimeAsync(6000);

  expect(eiscp.connect).toHaveBeenCalled();
  expect(onReconnected).toHaveBeenCalledWith("M 1.2.3.4");
  expect(rm.hasScheduledReconnection("M 1.2.3.4")).toBe(false);
  vi.useRealTimers();
});

it("scheduleReconnection reschedules on failure", async () => {
  vi.useFakeTimers();
  const rm = new ReconnectionManager({ timeouts: [100], scheduleDelay: 5000 });
  const eiscp = mockEiscp();
  eiscp.connect.mockResolvedValue({ model: "M", host: "1.2.3.4", port: 60128 });
  eiscp.waitForConnect.mockRejectedValue(new Error("timeout"));
  const onReconnected = vi.fn();

  rm.scheduleReconnection(
    "M 1.2.3.4",
    eiscp,
    { model: "M", host: "1.2.3.4", port: 60128 },
    () => false,
    onReconnected
  );

  // First scheduled attempt fires
  await vi.advanceTimersByTimeAsync(6000);
  expect(eiscp.connect).toHaveBeenCalledTimes(1);
  expect(onReconnected).not.toHaveBeenCalled();
  // Should have rescheduled - timer should still exist
  expect(rm.hasScheduledReconnection("M 1.2.3.4")).toBe(true);
  vi.useRealTimers();
});
