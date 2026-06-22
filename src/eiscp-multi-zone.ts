// Pure functions for building multi-zone volume and mute command batches. No side effects.
// Action string format: "all-<direction>" or "<zone1>-<zone2>-...-<direction>" (e.g. "all-up", "main-zone2-down").

import { ZONE_VOLUME_UP_DOWN, ZONE_MUTE } from "./zoneMappings.js";

const ALL_ZONES = ["main", "zone2", "zone3", "zone4"];

function parseAction(action: string): { targetZones: string[]; direction: string } {
  if (action.startsWith("all-")) {
    return { targetZones: ALL_ZONES, direction: action.slice(4) };
  }
  const parts = action.split("-");
  return { targetZones: parts.slice(0, -1), direction: parts[parts.length - 1] };
}

export function buildMultiZoneVolumeCommands(action: string, configuredZones: string[]): string[] {
  const { targetZones, direction } = parseAction(action);
  return targetZones
    .filter((z) => configuredZones.includes(z))
    .map((z) => ZONE_VOLUME_UP_DOWN[z]?.[direction as "up" | "down"])
    .filter(Boolean) as string[];
}

export function buildMultiZoneMuteCommands(action: string, configuredZones: string[]): string[] {
  const { targetZones, direction } = parseAction(action);
  return targetZones
    .filter((z) => configuredZones.includes(z))
    .map((z) => ZONE_MUTE[z]?.[direction as "on" | "off" | "toggle"])
    .filter(Boolean) as string[];
}
