import { eiscpMappings } from "./eiscp-mappings.js";
import { normalizeInputSourceSettings, type InputSourceSettings } from "./configConstants.js";

export const DISCOVERED_INPUT_SOURCE = "discovered";
export const DISCOVER_INPUT_SOURCE = "discover";
export const DONT_INCLUDE_INPUT_SOURCE = "dont-include";

export type KnownInputSource = { id: string; aliases: string[] };

const NRI_SERVICE_ALIASES: Record<string, string[]> = {
  tuneinradio: ["tunein"],
  spotify: ["spotify"],
  deezer: ["deezer"],
  tidal: ["tidal"],
  amazonmusic: ["amazonmusic"],
  chromecastbuiltin: ["chromecast"],
  dtsplayfi: ["dts-play-fi"],
  airplay: ["airplay"],
  amazonalexa: ["alexa"],
  musicserver: ["music-server"]
};

const NETWORK_SOURCE_ALIASES = new Set(
  Object.values(NRI_SERVICE_ALIASES)
    .flat()
    .map((alias) => alias.toLowerCase())
);

function normalizeSourceName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Return the integration aliases grouped by their stable SLI/NSS value.
export function getKnownInputSources(): KnownInputSource[] {
  const byId = new Map<string, string[]>();
  const values = eiscpMappings.value_mappings.SLI as Record<string, { value: string }>;
  for (const [alias, definition] of Object.entries(values)) {
    if (["up", "down", "query"].includes(alias)) continue;
    const id = definition.value.toUpperCase();
    if (!id || id === "QSTN" || id === "UP" || id === "DOWN") continue;
    const aliases = byId.get(id) ?? [];
    if (!aliases.includes(alias)) aliases.push(alias);
    byId.set(id, aliases);
  }
  return [...byId.entries()].map(([id, aliases]) => ({ id, aliases })).sort((a, b) => a.aliases[0].localeCompare(b.aliases[0]));
}

export function getInputSourceAliases(id: string): string[] {
  return getKnownInputSources().find((source) => source.id === id.toUpperCase())?.aliases ?? [];
}

// Return SLI aliases for an NRI-reported source, including logical NSS aliases.
export function getAliasesForReportedInput(id: string, name: string): string[] {
  const byId = getInputSourceAliases(id);
  if (byId.length > 0) return byId;
  return NRI_SERVICE_ALIASES[normalizeSourceName(name)] ?? [];
}

export function isNetworkInputSource(id: string, name: string, aliases: string[] = getAliasesForReportedInput(id, name)): boolean {
  return (
    id.toUpperCase().startsWith("NSV") ||
    aliases.some((alias) => NETWORK_SOURCE_ALIASES.has(normalizeSourceName(alias)) || NETWORK_SOURCE_ALIASES.has(alias.toLowerCase())) ||
    NETWORK_SOURCE_ALIASES.has(normalizeSourceName(name))
  );
}

export function normalizeInputSources(raw: unknown): InputSourceSettings {
  return normalizeInputSourceSettings(raw);
}

// Resolve configured input-source settings into the names exposed by a selector entity.
export function resolveConfiguredInputSources(settings: InputSourceSettings | undefined): string[] {
  return Object.entries(settings ?? {})
    .filter(([, entry]) => {
      const setting = entry.setting.trim().toLowerCase();
      return setting !== DONT_INCLUDE_INPUT_SOURCE && setting !== "exclude";
    })
    .map(([id, entry]) => ([DISCOVER_INPUT_SOURCE, DISCOVERED_INPUT_SOURCE].includes(entry.setting) ? entry.name : entry.setting || entry.name || getInputSourceAliases(id)[0]))
    .filter((name, index, all) => Boolean(name) && all.indexOf(name) === index)
    .sort((a, b) => a.localeCompare(b));
}

export function findConfiguredInputId(settings: InputSourceSettings | undefined, name: string): string | undefined {
  const wanted = name.trim().toLowerCase();
  return Object.entries(settings ?? {}).find(([, entry]) => entry.name.toLowerCase() === wanted || entry.setting.toLowerCase() === wanted)?.[0];
}
