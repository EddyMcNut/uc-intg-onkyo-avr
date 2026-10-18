import { eiscpCommands } from "./eiscp-commands.js";
import log from "./loggers.js";
import { EXCLUDE_LISTENING_MODE, getKnownListeningModes } from "./listeningModePreferences.js";

const integrationName = "simpleCommands:";

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
  const RANGE_PATTERN = /^(?:no-|time-)(\d+)-(\d+)(?:min)?$/;

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

      const rangeMatch = first.match(RANGE_PATTERN);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        for (let i = start; i <= end; i++) {
          map[`${def.prefix}_${i}`] = `${def.command} ${i}`;
        }
        continue;
      }

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
  { command: "accueq", prefix: "ACCUEQ" },
  { command: "audio-muting", prefix: "MUTE" },
  { command: "audio-return-channel", prefix: "AUDIO_RETURN_CHANNEL" },
  { command: "audio-selector", prefix: "AUDIO_SELECTOR" },
  { command: "audyssey-2eq-multeq-multeq-xt", prefix: "AUDYSSEY_MULT_EQ" },
  { command: "audyssey-dynamic-eq", prefix: "AUDYSSEY_DYNAMIC_EQ" },
  { command: "audyssey-dynamic-volume", prefix: "AUDYSSEY_DYNAMIC_VOLUME" },
  { command: "auto-power-down", prefix: "AUTO_POWER_DOWN" },
  { command: "av-sync", prefix: "AV_SYNC" },
  { command: "bluetooth-setting", prefix: "BLUETOOTH_SETTING" },
  { command: "center-temporary-level", prefix: "CENTER_TEMP_LEVEL" },
  { command: "cinema-filter", prefix: "CINEMA_FILTER" },
  { command: "dimmer-level", prefix: "DIMMER" },
  { command: "dirac", prefix: "DIRAC" },
  { command: "display-mode", prefix: "DISPLAY_MODE", excludeValues: ["QSTN"] },
  { command: "dolby-volume", prefix: "DOLBY_VOLUME" },
  { command: "graphics-equalizer", prefix: "GRAPHIC_EQ" },
  { command: "hdmi-audio-out", prefix: "HDMI_AUDIO_OUT" },
  { command: "hdmi-cec", prefix: "HDMI_CEC" },
  { command: "hdmi-output-selector", prefix: "HDMI_OUTPUT" },
  { command: "input-selector", prefix: "INPUT" },
  { command: "isf-mode", prefix: "ISF_MODE" },
  { command: "late-night", prefix: "LATE_NIGHT" },
  { command: "lfe-level", prefix: "LFE_LEVEL" },
  { command: "lip-sync", prefix: "LIP_SYNC" },
  { command: "listening-mode", prefix: "LISTENING_MODE" },
  { command: "loudness-management", prefix: "LOUDNESS_MANAGEMENT" },
  { command: "memory-setup", prefix: "MEMORY_SETUP" },
  { command: "multi-zone-muting", prefix: "MULTI_ZONE_MUTE" },
  { command: "multi-zone-volume", prefix: "MULTI_ZONE_VOLUME" },
  { command: "music-optimizer", prefix: "MUSIC_OPTIMIZER" },
  { command: "preset", prefix: "PRESET" },
  { command: "setup", prefix: "SETUP" },
  { command: "sleep-set", prefix: "SLEEP" },
  { command: "speaker-a", prefix: "SPEAKER_A" },
  { command: "speaker-b", prefix: "SPEAKER_B" },
  { command: "speaker-level-calibration", prefix: "SPEAKER_LEVEL" },
  { command: "stereo-assign", prefix: "STEREO_ASSIGN" },
  { command: "subwoofer-temporary-level", prefix: "SUBWOOFER_TEMP_LEVEL", excludeValues: ["-15db-0db-15db"] },
  { command: "tone-center", prefix: "TONE_CENTER", excludeValues: ["b-xx", "t-xx"] },
  { command: "tone-front", prefix: "TONE_FRONT", excludeValues: ["b-xx", "t-xx"] },
  { command: "tone-front-high", prefix: "TONE_FRONT_HIGH", excludeValues: ["b-xx", "t-xx"] },
  { command: "tone-front-wide", prefix: "TONE_FRONT_WIDE", excludeValues: ["b-xx", "t-xx"] },
  { command: "tone-subwoofer", prefix: "TONE_SUBWOOFER", excludeValues: ["b-xx"] },
  { command: "tone-surround", prefix: "TONE_SURROUND", excludeValues: ["b-xx", "t-xx"] },
  { command: "tone-surround-back", prefix: "TONE_SURROUND_BACK", excludeValues: ["b-xx", "t-xx"] },
  { command: "tunein-preset", prefix: "TUNEIN_PRESET" },
  { command: "tuning", prefix: "TUNING" },
  { command: "video-picture-mode", prefix: "VIDEO_PICTURE_MODE" },
  { command: "video-wide-mode", prefix: "VIDEO_WIDE_MODE" },
  { command: "vocal", prefix: "VOCAL" }
];

export const SIMPLE_COMMANDS_MAP = generateSimpleCommands(COMMAND_DEFS);
export const ALL_SIMPLE_COMMANDS = Object.keys(SIMPLE_COMMANDS_MAP);

/** Add AVR-specific listening-mode names using the same IDs as generated simple commands. */
export function addListeningModeSimpleCommands(modes: Record<string, { name: string; setting: string }> | undefined): void {
  for (const [code, mode] of Object.entries(modes ?? {})) {
    if (!mode.name || mode.setting === EXCLUDE_LISTENING_MODE || mode.setting === "disable") continue;
    if (mode.setting === "learned") {
      const known = getKnownListeningModes().find((candidate) => candidate.code === code.toUpperCase());
      for (const alias of known?.aliases ?? []) {
        const aliasId = `LISTENING_MODE_${alias
          .replace(/[^a-zA-Z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .toUpperCase()}`;
        delete SIMPLE_COMMANDS_MAP[aliasId];
        const index = ALL_SIMPLE_COMMANDS.indexOf(aliasId);
        if (index >= 0) ALL_SIMPLE_COMMANDS.splice(index, 1);
      }
    }
    const normalized = mode.name
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase();
    if (!normalized) continue;
    const id = `LISTENING_MODE_${normalized}`;
    if (!SIMPLE_COMMANDS_MAP[id]) SIMPLE_COMMANDS_MAP[id] = `listening-mode ${mode.name}`;
    if (!ALL_SIMPLE_COMMANDS.includes(id)) ALL_SIMPLE_COMMANDS.push(id);
  }
}

export function logGeneratedCount(): void {
  log.info("%s generated %d simple commands", integrationName, ALL_SIMPLE_COMMANDS.length);
}
