import { afterEach, describe, expect, it } from "vitest";
import { resolveIscpCommand, type IscpCommandContext } from "../src/iscpCommandResolver.js";
import { sharedAvrContexts } from "../src/avrContext.js";
import { resetAvrInfo, setAvrInfo } from "./helpers/avrInfo.js";

const ENTITY = "TX-RZ50 192.0.2.50 main";
const stateReader = { getSource: () => "net", getSubSource: () => "unknown" };
const context = (networkNavigationMode: "modern" | "legacy" = "modern"): IscpCommandContext => ({
  config: { model: "TX-RZ50", host: "192.0.2.50", networkNavigationMode },
  stateReader,
  avrContexts: sharedAvrContexts
});

function reportNetServices(netServices: { id: string; name: string }[]) {
  setAvrInfo(ENTITY, {
    model: "TX-RZ50",
    friendlyName: "",
    firmwareVersion: "",
    presetCount: 0,
    presets: [],
    zones: [],
    selectors: [],
    controls: [],
    tunerBands: [],
    netServices: netServices.map((service) => ({ ...service, enabled: true, hasAccount: true }))
  } as never);
}

afterEach(() => resetAvrInfo(ENTITY));

describe("resolveIscpCommand: menu-browse services", () => {
  it.each([
    ["Tidal", "NSV1B0"],
    ["deezer", "NSV120"],
    ["Music Server", "NSV000"],
    ["music_server", "NSV000"]
  ])("opens %s directly with modern navigation", (name, expected) => {
    expect(resolveIscpCommand("input-selector", name, "main", context("modern"))).toBe(expected);
  });

  // Music Server returns the bare NSS code; Tidal and Deezer go through the SLI table, which yields "SLI" + "NSS0x".
  // Both work: EiscpDriver.command() finds the NSS code inside the message and hands it to the command workflow.
  it("uses the logical NSS codes with legacy navigation", () => {
    expect(resolveIscpCommand("input-selector", "Music Server", "main", context("legacy"))).toBe("NSS10");
    expect(resolveIscpCommand("input-selector", "tidal", "main", context("legacy"))).toBe("SLINSS04");
    expect(resolveIscpCommand("input-selector", "deezer", "main", context("legacy"))).toBe("SLINSS03");
  });

  // "musicserver" without a separator is the SLI27 input (musicserver / p4s / dlna), not the NSS10 network service.
  it("keeps 'musicserver' on the SLI27 input", () => {
    expect(resolveIscpCommand("input-selector", "musicserver", "main", context("modern"))).toBe("SLI27");
  });
});

describe("resolveIscpCommand: AVR-reported network services", () => {
  it("routes a reported service with a logical NSS code through that code", () => {
    reportNetServices([{ id: "0e", name: "TuneIn Radio" }]);
    expect(resolveIscpCommand("input-selector", "TuneIn Radio", "main", context())).toBe("NSS01");
  });

  it("selects a reported service without a logical code directly by its NSV id", () => {
    reportNetServices([{ id: "1f", name: "Some New Service" }]);
    expect(resolveIscpCommand("input-selector", "Some New Service", "main", context())).toBe("NSV1F0");
  });
});

describe("resolveIscpCommand: plain mappings", () => {
  it("maps table values and zone prefixes", () => {
    expect(resolveIscpCommand("input-selector", "bd", "main", context())).toBe("SLI10");
    expect(resolveIscpCommand("input-selector", "bd", "zone2", context())).toBe("SLZ10");
  });
});
