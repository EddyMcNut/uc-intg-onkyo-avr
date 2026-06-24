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
  { command: "audio-muting", prefix: "MUTE" },
  { command: "audio-return-channel", prefix: "AUDIO_RETURN_CHANNEL", excludeValues: ["up", "down"] },
  { command: "audio-selector", prefix: "AUDIO_SELECTOR", excludeValues: ["up"] },
  { command: "audyssey-2eq-multeq-multeq-xt", prefix: "AUDYSSEY_MULT_EQ", excludeValues: ["up"] },
  { command: "audyssey-dynamic-eq", prefix: "AUDYSSEY_DYNAMIC_EQ", excludeValues: ["up"] },
  { command: "audyssey-dynamic-volume", prefix: "AUDYSSEY_DYNAMIC_VOLUME", excludeValues: ["up"] },
  { command: "auto-power-down", prefix: "AUTO_POWER_DOWN", excludeValues: ["up"] },
  { command: "av-sync", prefix: "AV_SYNC" },
  { command: "center-temporary-level", prefix: "CENTER_LEVEL" },
  { command: "cinema-filter", prefix: "CINEMA_FILTER", excludeValues: ["up"] },
  { command: "dimmer-level", prefix: "DIMMER" },
  { command: "dirac", prefix: "DIRAC" },
  { command: "dolby-volume", prefix: "DOLBY_VOLUME", excludeValues: ["up"] },
  { command: "graphics-equalizer", prefix: "GRAPHIC_EQ" },
  { command: "hdmi-audio-out", prefix: "HDMI_AUDIO_OUT", excludeValues: ["up"] },
  { command: "hdmi-cec", prefix: "HDMI_CEC", excludeValues: ["up"] },
  { command: "hdmi-output-selector", prefix: "HDMI_OUTPUT", excludeValues: ["up"] },
  { command: "input-selector", prefix: "INPUT", excludeValues: ["up", "down"] },
  { command: "isf-mode", prefix: "ISF_MODE", excludeValues: ["up"] },
  { command: "late-night", prefix: "LATE_NIGHT", excludeValues: ["up", "down"] },
  { command: "lfe-level", prefix: "LFE_LEVEL", excludeValues: ["up", "down"] },
  { command: "lip-sync", prefix: "LIP_SYNC", excludeValues: ["up"] },
  { command: "listening-mode", prefix: "LISTENING_MODE", excludeValues: ["up", "down"] },
  { command: "loudness-management", prefix: "LOUDNESS_MANAGEMENT", excludeValues: ["up", "down"] },
  { command: "memory-setup", prefix: "MEMORY_SETUP" },
  { command: "multi-zone-muting", prefix: "MULTI_ZONE_MUTE" },
  { command: "multi-zone-volume", prefix: "MULTI_ZONE_VOLUME" },
  { command: "music-optimizer", prefix: "MUSIC_OPTIMIZER", excludeValues: ["up", "down"] },
  { command: "preset", prefix: "PRESET" },
  { command: "setup", prefix: "SETUP" },
  { command: "sleep-set", prefix: "SLEEP", excludeValues: ["up"] },
  { command: "speaker-a", prefix: "SPEAKER_A", excludeValues: ["up"] },
  { command: "speaker-b", prefix: "SPEAKER_B", excludeValues: ["up"] },
  { command: "speaker-level-calibration", prefix: "SPEAKER_LEVEL" },
  { command: "subwoofer-temporary-level", prefix: "SUBWOOFER_LEVEL" },
  { command: "tone-center", prefix: "TONE_CENTER", excludeValues: ["b-xx", "t-xx"] },
  { command: "tone-front", prefix: "TONE_FRONT", excludeValues: ["b-xx", "t-xx"] },
  { command: "tone-front-high", prefix: "TONE_FRONT_HIGH", excludeValues: ["b-xx", "t-xx"] },
  { command: "tone-front-wide", prefix: "TONE_FRONT_WIDE", excludeValues: ["b-xx", "t-xx"] },
  { command: "tone-subwoofer", prefix: "TONE_SUBWOOFER", excludeValues: ["b-xx"] },
  { command: "tone-surround", prefix: "TONE_SURROUND", excludeValues: ["b-xx", "t-xx"] },
  { command: "tone-surround-back", prefix: "TONE_SURROUND_BACK", excludeValues: ["b-xx", "t-xx"] },
  { command: "tuning", prefix: "TUNING" },
  { command: "video-picture-mode", prefix: "VIDEO_PICTURE_MODE", excludeValues: ["up"] },
  { command: "video-wide-mode", prefix: "VIDEO_WIDE_MODE", excludeValues: ["up"] }
];

export const SIMPLE_COMMANDS_MAP = generateSimpleCommands(COMMAND_DEFS);
export const ALL_SIMPLE_COMMANDS = Object.keys(SIMPLE_COMMANDS_MAP);
