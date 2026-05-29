// Pure functions for building multi-zone volume and mute command batches. No side effects.
// Action string format: "all-<direction>" or "<zone1>-<zone2>-...-<direction>" (e.g. "all-up", "main-zone2-down").

const ZONE_VOLUME: Record<string, { up: string; down: string }> = {
  main: { up: "MVLUP1", down: "MVLDOWN1" },
  zone2: { up: "ZVLUP1", down: "ZVLDOWN1" },
  zone3: { up: "VL3UP1", down: "VL3DOWN1" },
  zone4: { up: "VL4UP1", down: "VL4DOWN1" }
};

const ZONE_MUTE: Record<string, { on: string; off: string; toggle: string }> = {
  main: { on: "AMT01", off: "AMT00", toggle: "AMTTG" },
  zone2: { on: "ZMT01", off: "ZMT00", toggle: "ZMTTG" },
  zone3: { on: "MT301", off: "MT300", toggle: "MT3TG" },
  zone4: { on: "MT401", off: "MT400", toggle: "MT4TG" }
};

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
    .map((z) => ZONE_VOLUME[z]?.[direction as "up" | "down"])
    .filter(Boolean) as string[];
}

export function buildMultiZoneMuteCommands(action: string, configuredZones: string[]): string[] {
  const { targetZones, direction } = parseAction(action);
  return targetZones
    .filter((z) => configuredZones.includes(z))
    .map((z) => ZONE_MUTE[z]?.[direction as "on" | "off" | "toggle"])
    .filter(Boolean) as string[];
}
