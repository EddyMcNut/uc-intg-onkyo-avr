import { ConfigManager, physicalAvrIdFromEntityId } from "./configManager.js";
import { normalizeLearnedListeningModes, type LearnedListeningMode } from "./configConstants.js";

function key(value: string): string {
  return value.trim().toLowerCase();
}

function modesForAvr(avrId: string): LearnedListeningMode[] {
  const avr = (ConfigManager.get().avrs ?? []).find((item) => `${item.model} ${item.ip}` === avrId);
  return Object.entries(avr?.listeningModes ?? {}).map(([code, mode]) => ({ code, name: mode.name }));
}

/** Return all observed modes for an AVR. Context is intentionally not tracked. */
export function getLearnedListeningModes(entityId: string, _source?: string, _audioFormat?: string): LearnedListeningMode[] {
  const avrId = physicalAvrIdFromEntityId(entityId);
  return avrId ? modesForAvr(avrId).map((mode) => ({ ...mode })) : [];
}

export function findLearnedListeningModeCode(physicalAvrId: string, name: string): string | undefined {
  const wanted = key(name);
  return modesForAvr(physicalAvrId).find((mode) => key(mode.name) === wanted)?.code;
}

export function findLearnedListeningModeName(physicalAvrId: string, code: string): string | undefined {
  const wanted = code.trim().toUpperCase();
  return modesForAvr(physicalAvrId).find((mode) => mode.code === wanted)?.name;
}

/** Learn an observed mode and persist it on the matching AVR configuration. */
export function learnListeningMode(entityId: string, mode: LearnedListeningMode): boolean {
  const avrId = physicalAvrIdFromEntityId(entityId);
  if (!avrId) return false;
  const normalized = normalizeLearnedListeningModes([mode]);
  if (normalized.length === 0) return false;
  const existing = modesForAvr(avrId);
  const merged = normalizeLearnedListeningModes([...existing, ...normalized]);
  if (JSON.stringify(existing) === JSON.stringify(merged)) return false;
  const avr = (ConfigManager.get().avrs ?? []).find((item) => `${item.model} ${item.ip}` === avrId);
  if (!avr) return false;
  const listeningModes = { ...(avr.listeningModes ?? {}) };
  for (const item of merged) listeningModes[item.code] = { name: item.name, setting: listeningModes[item.code]?.setting ?? "learn" };
  const avrs = (ConfigManager.get().avrs ?? []).map((item) => (`${item.model} ${item.ip}` === avrId ? { ...item, listeningModes } : item));
  ConfigManager.save({ avrs });
  return true;
}
