import { ConfigManager, physicalAvrIdFromEntityId } from "./configManager.js";
import { normalizeLearnedListeningModes, type LearnedListeningMode, type ListeningModeContext } from "./configConstants.js";
import { DISCOVERED_LISTENING_MODE } from "./listeningModePreferences.js";

function key(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function contextKey(mode: Pick<LearnedListeningMode, "source" | "audioFormat" | "inputChannels">): string {
  return [key(mode.source), key(mode.audioFormat), key(mode.inputChannels)].join("|");
}

function modesForAvr(avrId: string): LearnedListeningMode[] {
  const avr = (ConfigManager.get().avrs ?? []).find((item) => `${item.model} ${item.ip}` === avrId);
  const result: LearnedListeningMode[] = [];
  for (const [code, mode] of Object.entries(avr?.listeningModes ?? {})) {
    if (mode.name) result.push({ code, name: mode.name });
    for (const context of mode.contexts ?? []) result.push({ code, ...context });
  }
  return normalizeLearnedListeningModes(result);
}

function matchingModes(modes: LearnedListeningMode[], source?: string, audioFormat?: string, inputChannels?: string): LearnedListeningMode[] {
  if (!source && !audioFormat) return modes;
  const wantedSource = key(source);
  const wantedFormat = key(audioFormat);
  const wantedChannels = key(inputChannels);
  const exact = modes.filter(
    (mode) => key(mode.source) === wantedSource && key(mode.audioFormat) === wantedFormat && (!wantedChannels || !mode.inputChannels || key(mode.inputChannels) === wantedChannels)
  );
  if (exact.length > 0) return exact;
  return modes.filter((mode) => !mode.source && !mode.audioFormat);
}

export function getLearnedListeningModes(entityId: string, source?: string, audioFormat?: string, inputChannels?: string): LearnedListeningMode[] {
  const avrId = physicalAvrIdFromEntityId(entityId);
  return avrId ? matchingModes(modesForAvr(avrId), source, audioFormat, inputChannels).map((mode) => ({ ...mode })) : [];
}

export function getAllLearnedListeningModes(physicalAvrId: string): LearnedListeningMode[] {
  return modesForAvr(physicalAvrId);
}

export function findLearnedListeningModeCode(physicalAvrId: string, name: string, source?: string, audioFormat?: string, inputChannels?: string): string | undefined {
  const wanted = key(name);
  return matchingModes(modesForAvr(physicalAvrId), source, audioFormat, inputChannels).find((mode) => key(mode.name) === wanted)?.code;
}

export function findLearnedListeningModeName(physicalAvrId: string, code: string, source?: string, audioFormat?: string, inputChannels?: string): string | undefined {
  const wanted = code.trim().toUpperCase();
  return matchingModes(modesForAvr(physicalAvrId), source, audioFormat, inputChannels).find((mode) => mode.code === wanted)?.name;
}

// Learn an observed mode and persist it under its source/audio context. The top-level name
// remains as a fallback and is updated for setup display when the AVR reports a new name.
export function learnListeningMode(entityId: string, mode: LearnedListeningMode): boolean {
  const avrId = physicalAvrIdFromEntityId(entityId);
  if (!avrId) return false;
  const normalized = normalizeLearnedListeningModes([mode]);
  if (normalized.length === 0) return false;
  const observed = normalized[0];
  const avr = (ConfigManager.get().avrs ?? []).find((item) => `${item.model} ${item.ip}` === avrId);
  if (!avr) return false;
  const listeningModes = { ...(avr.listeningModes ?? {}) };
  const wasExisting = Boolean(listeningModes[observed.code]);
  const existing = listeningModes[observed.code] ?? { name: observed.name, setting: DISCOVERED_LISTENING_MODE };
  const contexts = [...(existing.contexts ?? [])];
  const context: ListeningModeContext | undefined =
    observed.source && observed.audioFormat
      ? { source: observed.source, audioFormat: observed.audioFormat, ...(observed.inputChannels ? { inputChannels: observed.inputChannels } : {}), name: observed.name }
      : undefined;
  let changed = !wasExisting || existing.name !== observed.name;
  if (context) {
    const index = contexts.findIndex((item) => contextKey(item) === contextKey(context));
    if (index >= 0) {
      changed ||= JSON.stringify(contexts[index]) !== JSON.stringify(context);
      contexts[index] = context;
    } else {
      contexts.push(context);
      changed = true;
    }
  }
  listeningModes[observed.code] = { ...existing, name: observed.name, setting: existing.setting ?? DISCOVERED_LISTENING_MODE, ...(contexts.length ? { contexts } : {}) };
  if (!changed) return false;
  ConfigManager.save({ avrs: (ConfigManager.get().avrs ?? []).map((item) => (`${item.model} ${item.ip}` === avrId ? { ...item, listeningModes } : item)) });
  return true;
}
