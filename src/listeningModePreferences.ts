import { eiscpCommands } from "./eiscp-commands.js";
import type { LearnedListeningMode } from "./configConstants.js";

export const LEARN_LISTENING_MODE = "learn";
export const LEARNED_LISTENING_MODE = "learned";
export const DISABLE_LISTENING_MODE = "disable";

export type ListeningModePreferences = Record<string, string>;
export type ListeningModeEntry = { name: string; setting: string };
export type ListeningModes = Record<string, ListeningModeEntry>;

export type KnownListeningMode = {
  code: string;
  aliases: string[];
};

const CONTROL_ALIASES = new Set(["up", "down", "movie", "music", "game", "thx", "auto", "surr", "stereo", "query"]);

/** Known LMD settings grouped by code, preserving the mapping's alias order. */
export function getKnownListeningModes(): KnownListeningMode[] {
  const byCode = new Map<string, string[]>();
  const values = eiscpCommands.commands.LMD.values as Record<string, { name: string | string[] }>;
  for (const [rawCode, definition] of Object.entries(values)) {
    const normalizedRawCode = rawCode.toUpperCase();
    if (CONTROL_ALIASES.has(rawCode.toLowerCase()) || rawCode.toUpperCase() === "QSTN") continue;
    const code = rawCode.toUpperCase();
    const aliases = Array.isArray(definition.name) ? definition.name : [definition.name];
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

/** Normalize one persisted preference map, retaining only known codes and valid aliases. */
export function normalizeListeningModePreferences(raw: unknown): ListeningModePreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const normalized: ListeningModePreferences = {};
  for (const mode of getKnownListeningModes()) {
    const value = String(input[mode.code] ?? "").trim();
    if (value === LEARN_LISTENING_MODE || value === DISABLE_LISTENING_MODE || mode.aliases.includes(value)) {
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
          if (/^[0-9A-F]{2}$/.test(code) && name) result[code] = { name, setting: LEARN_LISTENING_MODE };
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
    const setting = String(entry.setting ?? "learn").trim();
    if (!name || ![LEARN_LISTENING_MODE, LEARNED_LISTENING_MODE, DISABLE_LISTENING_MODE, ...getKnownListeningModes().flatMap((mode) => mode.aliases)].includes(setting)) continue;
    result[code] = { name, setting };
  }
  return result;
}

/** Resolve configured options, using the learned AVR name for the default "learn" choice. */
export function resolveListeningModePreferences(preferences: ListeningModePreferences | undefined, learned: LearnedListeningMode[]): string[] | undefined {
  if (!preferences) return undefined;
  const learnedByCode = new Map(learned.map((mode) => [mode.code.toUpperCase(), mode.name]));
  const options: string[] = [];
  for (const mode of getKnownListeningModes()) {
    // When preferences exist, only explicitly configured settings are offered. This prevents
    // newly added catalog entries from silently reappearing after an older setup.
    if (!Object.prototype.hasOwnProperty.call(preferences, mode.code)) continue;
    const choice = preferences[mode.code] ?? LEARN_LISTENING_MODE;
    if (choice === DISABLE_LISTENING_MODE) continue;
    const option = [LEARN_LISTENING_MODE, LEARNED_LISTENING_MODE].includes(choice) ? (learnedByCode.get(mode.code) ?? mode.aliases[0]) : choice;
    if (option && !options.includes(option)) options.push(option);
  }
  // New firmware can report a mode code not present in our static catalog. Learn mode is
  // the implicit default for such entries, so keep the AVR-reported name available too.
  for (const mode of learned) {
    if (!options.includes(mode.name) && preferences[mode.code.toUpperCase()] !== DISABLE_LISTENING_MODE) {
      options.push(mode.name);
    }
  }
  return options.sort((a, b) => a.localeCompare(b));
}

export function resolveListeningModes(modes: ListeningModes | undefined, learned: LearnedListeningMode[] = []): string[] {
  const learnedByCode = new Map(learned.map((mode) => [mode.code.toUpperCase(), mode.name]));
  return Object.entries(modes ?? {})
    .filter(([, mode]) => mode.setting !== DISABLE_LISTENING_MODE)
    .map(([code, mode]) => ([LEARN_LISTENING_MODE, LEARNED_LISTENING_MODE].includes(mode.setting) ? (learnedByCode.get(code) ?? mode.name) : mode.setting))
    .filter((name, index, list) => name && list.indexOf(name) === index)
    .sort((a, b) => a.localeCompare(b));
}
