import { testAvrContexts } from "./helpers/contexts.js";
import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import * as uc from "@unfoldedcircle/integration-api";
import { setZoneEntitiesAvailability } from "../src/entityAvailability.js";
import { SENSOR_SUFFIXES, SELECT_SUFFIXES, REMOTE_SUFFIX } from "../src/sensorSuffixes.js";
import ConnectionManager from "../src/connectionManager.js";
import { ReconnectionManager } from "../src/reconnectionManager.js";
import { testConfigStore } from "./helpers/configStore.js";

const ZONE = "TX-RZ50 192.0.2.60 main";

function fakeDriver() {
  const updates = new Map<string, Record<string, unknown>>();
  return {
    updates,
    updateEntityAttributes: vi.fn((id: string, attributes: Record<string, unknown>) => {
      updates.set(id, { ...updates.get(id), ...attributes });
      return true;
    })
  };
}

function fakeState() {
  return { applyMediaPlayerState: vi.fn(), applyRemoteState: vi.fn() };
}

describe("setZoneEntitiesAvailability", () => {
  it("marks the media player, remote, sensors and selects of each zone UNAVAILABLE", () => {
    const driver = fakeDriver();
    setZoneEntitiesAvailability(driver as never, [ZONE], false, fakeState() as never);

    expect(driver.updates.get(ZONE)).toEqual({ [uc.MediaPlayerAttributes.State]: "UNAVAILABLE" });
    expect(driver.updates.get(`${ZONE}${REMOTE_SUFFIX}`)).toEqual({ state: "UNAVAILABLE" });
    for (const suffix of [...SENSOR_SUFFIXES, ...Object.values(SELECT_SUFFIXES)]) {
      expect(driver.updates.get(`${ZONE}${suffix}`)).toEqual({ state: "UNAVAILABLE" });
    }
  });

  it("restores the state on reconnect: media player and remote from the AVR state, sensors and selects ON", () => {
    const driver = fakeDriver();
    const state = fakeState();
    setZoneEntitiesAvailability(driver as never, [ZONE], true, state as never);

    expect(state.applyMediaPlayerState).toHaveBeenCalledWith(ZONE, driver);
    expect(state.applyRemoteState).toHaveBeenCalledWith(ZONE, driver);
    expect(driver.updates.has(ZONE)).toBe(false);
    for (const suffix of [...SENSOR_SUFFIXES, ...Object.values(SELECT_SUFFIXES)]) {
      expect(driver.updates.get(`${ZONE}${suffix}`)).toEqual({ state: "ON" });
    }
  });
});

describe("ConnectionManager availability callback", () => {
  it("reports unavailable on close and available on (re)connect", async () => {
    const eiscp: any = new EventEmitter();
    eiscp.connect = vi.fn().mockResolvedValue({ model: "TX-RZ50", host: "192.0.2.60", port: 60128 });
    eiscp.waitForConnect = vi.fn().mockResolvedValue(undefined);
    const onAvailabilityChange = vi.fn();
    const cm = new ConnectionManager(
      new ReconnectionManager(),
      async () => {},
      testAvrContexts,
      testConfigStore,
      () => eiscp,
      undefined,
      onAvailabilityChange
    );

    await cm.createAndConnect("TX-RZ50 192.0.2.60", { model: "TX-RZ50", ip: "192.0.2.60", port: 60128, zone: "main" } as never, () => ({ setupEiscpListener: vi.fn() }) as never);
    eiscp.emit("close");
    eiscp.emit("connect");

    expect(onAvailabilityChange.mock.calls).toEqual([
      ["TX-RZ50 192.0.2.60", false],
      ["TX-RZ50 192.0.2.60", true]
    ]);
  });
});
