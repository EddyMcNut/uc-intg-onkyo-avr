import { describe, it, expect } from "vitest";

it("buildMultiZoneVolumeCommands filters and maps zone-specific up/down commands", async () => {
  const multiZoneModule = await import("../src/eiscp-multi-zone.js");
  const { buildMultiZoneVolumeCommands } = multiZoneModule as {
    buildMultiZoneVolumeCommands: (action: string, configuredZones: string[]) => string[];
  };

  // all-up on main+zone2: should generate MVLUP1 and ZVLUP1
  const cmds1 = buildMultiZoneVolumeCommands("all-up", ["main", "zone2", "zone3", "zone4"]);
  expect(cmds1).toEqual(["MVLUP1", "ZVLUP1", "VL3UP1", "VL4UP1"]);

  // all-down on only main+zone2: should filter to matching zones
  const cmds2 = buildMultiZoneVolumeCommands("all-down", ["main", "zone2"]);
  expect(cmds2).toEqual(["MVLDOWN1", "ZVLDOWN1"]);

  // Specific zone selection: main-zone3-up
  const cmds3 = buildMultiZoneVolumeCommands("main-zone3-up", ["main", "zone2", "zone3", "zone4"]);
  expect(cmds3).toEqual(["MVLUP1", "VL3UP1"]);

  // Zone not configured: should be filtered out
  const cmds4 = buildMultiZoneVolumeCommands("main-zone4-down", ["main", "zone2"]);
  expect(cmds4).toEqual(["MVLDOWN1"]);
});

it("buildMultiZoneMuteCommands generates zone-specific mute/unmute sequences", async () => {
  const multiZoneModule = await import("../src/eiscp-multi-zone.js");
  const { buildMultiZoneMuteCommands } = multiZoneModule as {
    buildMultiZoneMuteCommands: (action: string, configuredZones: string[]) => string[];
  };

  // all-on (mute on) for main+zone2+zone3
  const cmds1 = buildMultiZoneMuteCommands("all-on", ["main", "zone2", "zone3", "zone4"]);
  expect(cmds1).toEqual(["AMT01", "ZMT01", "MT301", "MT401"]);

  // all-off (mute off) for main+zone2
  const cmds2 = buildMultiZoneMuteCommands("all-off", ["main", "zone2"]);
  expect(cmds2).toEqual(["AMT00", "ZMT00"]);

  // Specific zone toggle: main-zone3-toggle
  const cmds3 = buildMultiZoneMuteCommands("main-zone3-toggle", ["main", "zone2", "zone3", "zone4"]);
  expect(cmds3).toEqual(["AMTTG", "MT3TG"]);

  // Zone not configured: should be filtered out
  const cmds4 = buildMultiZoneMuteCommands("main-zone4-on", ["main", "zone2"]);
  expect(cmds4).toEqual(["AMT01"]);
});

it("Multi-zone command generation is deterministic and repeatable", async () => {
  const multiZoneModule = await import("../src/eiscp-multi-zone.js");
  const { buildMultiZoneVolumeCommands, buildMultiZoneMuteCommands } = multiZoneModule as {
    buildMultiZoneVolumeCommands: (action: string, configuredZones: string[]) => string[];
    buildMultiZoneMuteCommands: (action: string, configuredZones: string[]) => string[];
  };

  const volCmds1 = buildMultiZoneVolumeCommands("all-up", ["main", "zone2", "zone3"]);
  const volCmds2 = buildMultiZoneVolumeCommands("all-up", ["main", "zone2", "zone3"]);
  expect(volCmds1).toEqual(volCmds2);

  const muteCmds1 = buildMultiZoneMuteCommands("main-zone2-on", ["main", "zone2"]);
  const muteCmds2 = buildMultiZoneMuteCommands("main-zone2-on", ["main", "zone2"]);
  expect(muteCmds1).toEqual(muteCmds2);
});

it("Multi-zone command generation ignores unknown directions and zones", async () => {
  const multiZoneModule = await import("../src/eiscp-multi-zone.js");
  const { buildMultiZoneVolumeCommands, buildMultiZoneMuteCommands } = multiZoneModule as {
    buildMultiZoneVolumeCommands: (action: string, configuredZones: string[]) => string[];
    buildMultiZoneMuteCommands: (action: string, configuredZones: string[]) => string[];
  };

  const unknownVolumeDirection = buildMultiZoneVolumeCommands("all-sideways", ["main", "zone2", "zone3", "zone4"]);
  expect(unknownVolumeDirection).toEqual([]);

  const unknownMuteDirection = buildMultiZoneMuteCommands("all-flip", ["main", "zone2", "zone3", "zone4"]);
  expect(unknownMuteDirection).toEqual([]);

  const includesUnknownZone = buildMultiZoneVolumeCommands("main-zone5-up", ["main", "zone2", "zone3", "zone4"]);
  expect(includesUnknownZone).toEqual(["MVLUP1"]);
});
