import { eiscpCommands } from "./eiscp-commands.js";

interface SimpleCommandDef {
  command: string;
  prefix: string;
  excludeValues?: string[];
}

function getInputSelectorNames(): string[] {
  const cmd = Object.values(eiscpCommands.commands).find((c) => c.name === "input-selector");
  if (!cmd) return [];

  const exclude = new Set(["up", "down", "query"]);
  const names = new Set<string>();

  for (const entry of Object.values(cmd.values)) {
    if (!("name" in entry)) continue;
    const entryNames = Array.isArray(entry.name) ? entry.name : [entry.name];
    for (const name of entryNames) {
      if (name && !exclude.has(name)) {
        names.add(name);
      }
    }
  }

  return [...names].sort();
}

export const ALL_INPUT_SELECTOR_NAMES = getInputSelectorNames();

function generateSimpleCommands(defs: SimpleCommandDef[]): Record<string, string> {
  const map: Record<string, string> = {};
  const DEFAULT_EXCLUDE = new Set(["query"]);

  function toSimpleId(prefix: string, name: string): string {
    return `${prefix}_${name.replace(/-/g, "_").toUpperCase()}`;
  }

  for (const def of defs) {
    const cmd = Object.values(eiscpCommands.commands).find((c) => c.name === def.command);
    if (!cmd) continue;

    const exclude = new Set([...DEFAULT_EXCLUDE, ...(def.excludeValues ?? [])]);

    for (const entry of Object.values(cmd.values)) {
      if (!("name" in entry)) continue;

      const names = Array.isArray(entry.name) ? entry.name : [entry.name];
      const first = names[0];
      if (!first || exclude.has(first)) continue;

      const commandStr = `${def.command} ${first}`;
      for (const name of names) {
        if (exclude.has(name)) continue;
        map[toSimpleId(def.prefix, name)] = commandStr;
      }
    }
  }

  return map;
}

const COMMAND_DEFS: SimpleCommandDef[] = [
  {
    command: "audio-return-channel",
    prefix: "AUDIO_RETURN_CHANNEL",
    excludeValues: ["up", "down"]
  },
  {
    command: "dimmer-level",
    prefix: "DIMMER"
  },
  {
    command: "dirac",
    prefix: "DIRAC"
  },
  {
    command: "input-selector",
    prefix: "INPUT",
    excludeValues: ["up", "down"]
  },
  {
    command: "late-night",
    prefix: "LATE_NIGHT",
    excludeValues: ["up", "down"]
  },
  {
    command: "lfe-level",
    prefix: "LFE_LEVEL",
    excludeValues: ["up", "down"]
  },
  {
    command: "listening-mode",
    prefix: "LISTENING_MODE",
    excludeValues: ["up", "down"]
  },
  {
    command: "loudness-management",
    prefix: "LOUDNESS_MANAGEMENT",
    excludeValues: ["up", "down"]
  },
  {
    command: "multi-zone-muting",
    prefix: "MULTI_ZONE_MUTE"
  },
  {
    command: "multi-zone-volume",
    prefix: "MULTI_ZONE_VOLUME"
  },
  {
    command: "music-optimizer",
    prefix: "MUSIC_OPTIMIZER",
    excludeValues: ["up", "down"]
  },
  {
    command: "audio-muting",
    prefix: "MUTE"
  },
  {
    command: "setup",
    prefix: "SETUP"
  }
];

export const SIMPLE_COMMANDS_MAP = generateSimpleCommands(COMMAND_DEFS);
export const ALL_SIMPLE_COMMANDS = Object.keys(SIMPLE_COMMANDS_MAP);
