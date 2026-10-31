import { eiscpCommands } from "./eiscp-commands.js";
import type { LearnedListeningMode, ListeningModeContext } from "./configConstants.js";

export const DISCOVER_LISTENING_MODE = "discover";
export const DISCOVERED_LISTENING_MODE = "discovered";
const LEGACY_DETECTED_LISTENING_MODE = "detected";
export const INTEGRATION_PREFERRED_LISTENING_MODE = "integration-preferred";
export const DONT_INCLUDE_LISTENING_MODE = "dont-include";
const LEGACY_DISABLE_LISTENING_MODE = "disable";

export function normalizeListeningModeSetting(setting: string): string {
  if (setting === LEGACY_DISABLE_LISTENING_MODE) return DONT_INCLUDE_LISTENING_MODE;
  return setting === LEGACY_DETECTED_LISTENING_MODE ? DISCOVERED_LISTENING_MODE : setting;
}

function isExcludedListeningModeSetting(setting: string): boolean {
  return setting === DONT_INCLUDE_LISTENING_MODE || setting === LEGACY_DISABLE_LISTENING_MODE;
}

export type ListeningModePreferences = Record<string, string>;
export type ListeningModeEntry = { name: string; setting: string; contexts?: ListeningModeContext[] };
export type ListeningModes = Record<string, ListeningModeEntry>;

export function displayListeningModeName(name: string): string {
  return name === "straight-decode" ? "Straight Decode" : name;
}

export type KnownListeningMode = {
  code: string;
  aliases: string[];
};

const CONTROL_ALIASES = new Set(["up", "down", "movie", "music", "game", "thx", "auto", "surr", "stereo", "query"]);

// Known LMD settings grouped by code, preserving the mapping's alias order.
export function getKnownListeningModes(): KnownListeningMode[] {
  const byCode = new Map<string, string[]>();
  const values = eiscpCommands.commands.LMD.values as Record<string, { name: string | string[] }>;
  for (const [rawCode, definition] of Object.entries(values)) {
    if (CONTROL_ALIASES.has(rawCode.toLowerCase()) || rawCode.toUpperCase() === "QSTN") continue;
    const code = rawCode.toUpperCase();
    const aliases = (Array.isArray(definition.name) ? definition.name : [definition.name]).filter((alias): alias is string => typeof alias === "string" && alias.length > 0);
    const existing = byCode.get(code) ?? [];
    for (const alias of aliases) {
      if (alias && !existing.includes(alias)) existing.push(alias);
    }
    byCode.set(code, existing);
  }
  return [...byCode.entries()]
    .map(([code, aliases]) => ({ code, aliases }))
    .filter((mode) => mode.aliases.length > 0)
    .sort((a, b) => a.aliases[0].localeCompare(b.aliases[0]));
}

// Normalize one persisted preference map, retaining only known codes and valid aliases.
export function normalizeListeningModePreferences(raw: unknown): ListeningModePreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const normalized: ListeningModePreferences = {};
  for (const mode of getKnownListeningModes()) {
    const value = String(input[mode.code] ?? "").trim();
    if (value === DISCOVER_LISTENING_MODE || value === INTEGRATION_PREFERRED_LISTENING_MODE || isExcludedListeningModeSetting(value) || mode.aliases.includes(value)) {
      normalized[mode.code] = value;
    }
  }
  return normalized;
}

export function normalizeListeningModes(raw: unknown): ListeningModes {
  const result: ListeningModes = {};
  if (Array.isArray(raw)) {
    for (const group of raw) {
      if (group && typeof group === "object" && Array.isArray((group as Record<string, unknown>).modes)) {
        for (const mode of (group as Record<string, unknown>).modes as Array<Record<string, unknown>>) {
          const code = String(mode.code ?? "").toUpperCase();
          const name = String(mode.name ?? "").trim();
          if (/^[0-9A-F]{2}$/.test(code) && name) result[code] = { name, setting: DISCOVER_LISTENING_MODE };
        }
      }
    }
    return result;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  for (const [rawCode, rawEntry] of Object.entries(raw as Record<string, unknown>)) {
    const code = rawCode.toUpperCase();
    if (!/^[0-9A-F]{2}$/.test(code) || !rawEntry || typeof rawEntry !== "object") continue;
    const entry = rawEntry as Record<string, unknown>;
    const name = String(entry.name ?? "").trim();
    const setting = normalizeListeningModeSetting(String(entry.setting ?? DISCOVER_LISTENING_MODE).trim());
    const contexts = Array.isArray(entry.contexts)
      ? entry.contexts
          .filter((context): context is Record<string, unknown> => Boolean(context) && typeof context === "object")
          .map((context) => ({
            source: String(context.source ?? "").trim(),
            audioFormat: String(context.audioFormat ?? "").trim(),
            ...(context.inputChannels ? { inputChannels: String(context.inputChannels).trim() } : {}),
            name: String(context.name ?? "").trim()
          }))
          .filter((context) => context.source && context.audioFormat && context.name)
      : undefined;
    if (
      !name ||
      ![DISCOVER_LISTENING_MODE, DISCOVERED_LISTENING_MODE, INTEGRATION_PREFERRED_LISTENING_MODE, DONT_INCLUDE_LISTENING_MODE, ...getKnownListeningModes().flatMap((mode) => mode.aliases)].includes(setting)
    )
      continue;
    result[code] = { name, setting, ...(contexts?.length ? { contexts } : {}) };
  }
  return result;
}

// Resolve configured options, using the detected AVR name for the default "discover" choice.
export function resolveListeningModePreferences(preferences: ListeningModePreferences | undefined, learned: LearnedListeningMode[]): string[] | undefined {
  if (!preferences) return undefined;
  const learnedByCode = new Map(learned.map((mode) => [mode.code.toUpperCase(), mode.name]));
  const options: string[] = [];
  for (const mode of getKnownListeningModes()) {
    // When preferences exist, only explicitly configured settings are offered. This prevents
    // newly added catalog entries from silently reappearing after an older setup.
    if (!Object.prototype.hasOwnProperty.call(preferences, mode.code)) continue;
    const choice = normalizeListeningModeSetting(preferences[mode.code] ?? DISCOVER_LISTENING_MODE);
    if (isExcludedListeningModeSetting(choice)) continue;
    const option = [DISCOVER_LISTENING_MODE, DISCOVERED_LISTENING_MODE].includes(choice)
      ? displayListeningModeName(learnedByCode.get(mode.code) ?? mode.aliases[0])
      : choice === INTEGRATION_PREFERRED_LISTENING_MODE
          ? displayListeningModeName(mode.aliases[0])
        : choice;
    if (option && !options.includes(option)) options.push(option);
  }
  // New firmware can report a mode code not present in our static catalog. Learn mode is
  // the implicit default for such entries, so keep the AVR-reported name available too.
  for (const mode of learned) {
    if (!options.includes(mode.name) && !isExcludedListeningModeSetting(preferences[mode.code.toUpperCase()] ?? "")) {
      options.push(mode.name);
    }
  }
  return options.sort((a, b) => a.localeCompare(b));
}

export function resolveListeningModes(modes: ListeningModes | undefined, learned: LearnedListeningMode[] = []): string[] {
  const learnedByCode = new Map(learned.map((mode) => [mode.code.toUpperCase(), mode.name]));
  return Object.entries(modes ?? {})
    .filter(([, mode]) => !isExcludedListeningModeSetting(mode.setting))
    .map(([code, mode]) =>
      [DISCOVER_LISTENING_MODE, DISCOVERED_LISTENING_MODE].includes(normalizeListeningModeSetting(mode.setting))
        ? displayListeningModeName(learnedByCode.get(code) ?? mode.name)
        : mode.setting === INTEGRATION_PREFERRED_LISTENING_MODE
          ? displayListeningModeName(getKnownListeningModes().find((known) => known.code === code)?.aliases[0] ?? mode.name)
          : mode.setting
    )
    .filter((name, index, list) => name && list.indexOf(name) === index)
    .sort((a, b) => a.localeCompare(b));
}
