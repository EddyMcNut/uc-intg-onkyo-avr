// Single source of truth for zone-specific command prefix mappings.
// All zone→command prefix lookups should import from here.

/** Volume set/query command prefix per zone (MVL → main, ZVL → zone2, etc.) */
export const ZONE_VOLUME_PREFIX: Record<string, string> = {
  main: "MVL",
  zone2: "ZVL",
  zone3: "VL3",
  zone4: "VL4"
};

/** Volume up/down commands per zone */
export const ZONE_VOLUME_UP_DOWN: Record<string, { up: string; down: string }> = {
  main: { up: "MVLUP1", down: "MVLDOWN1" },
  zone2: { up: "ZVLUP1", down: "ZVLDOWN1" },
  zone3: { up: "VL3UP1", down: "VL3DOWN1" },
  zone4: { up: "VL4UP1", down: "VL4DOWN1" }
};

/** Mute commands per zone */
export const ZONE_MUTE: Record<string, { on: string; off: string; toggle: string }> = {
  main: { on: "AMT01", off: "AMT00", toggle: "AMTTG" },
  zone2: { on: "ZMT01", off: "ZMT00", toggle: "ZMTTG" },
  zone3: { on: "MT301", off: "MT300", toggle: "MT3TG" },
  zone4: { on: "MT401", off: "MT400", toggle: "MT4TG" }
};

/** Generic command prefix translations from main-zone prefix to zone-specific prefix. */
export const ZONE_COMMAND_MAP: Record<string, Record<string, string>> = {
  zone2: {
    MVL: "ZVL",
    PWR: "ZPW",
    AMT: "ZMT",
    SLI: "SLZ",
    TUN: "TUZ"
  },
  zone3: {
    MVL: "VL3",
    PWR: "PW3",
    AMT: "MT3",
    SLI: "SL3",
    TUN: "TU3"
  },
  zone4: {
    MVL: "VL4",
    PWR: "PW4",
    AMT: "MT4",
    SLI: "SL4",
    TUN: "TU4"
  }
};

/** Translate a main-zone command prefix to its zone-specific equivalent. Falls back to the original prefix for unknown zones. */
export function getZonePrefix(prefix: string, zone: string): string {
  return ZONE_COMMAND_MAP[zone]?.[prefix] ?? prefix;
}
