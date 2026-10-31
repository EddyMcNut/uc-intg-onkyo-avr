import { describe, expect, it, vi } from "vitest";
import ConnectCoordinator from "../src/connectCoordinator.js";

describe("configuration lifecycle", () => {
  it("removes zone instances that are no longer configured", () => {
    const connectionManager = { reconcilePhysicalConnections: vi.fn() };
    const instances = new Map([
      ["M 1.2.3.4 main", {} as never],
      ["M 1.2.3.4 zone2", {} as never],
      ["N 1.2.3.5 main", {} as never]
    ]);
    const coordinator = new ConnectCoordinator(
      connectionManager as never,
      instances,
      async () => {},
      async () => {}
    );

    const removed = coordinator.reconcile({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main" }] });

    expect(removed).toEqual(["M 1.2.3.4 zone2", "N 1.2.3.5 main"]);
    expect([...instances.keys()]).toEqual(["M 1.2.3.4 main"]);
    expect(connectionManager.reconcilePhysicalConnections).toHaveBeenCalledWith(["M 1.2.3.4"]);
  });
});
