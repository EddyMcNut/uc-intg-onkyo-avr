// Tuner presets (DAB / DAB+ / FM / AM) the AVR reported about itself, collected from the NRI payload.
//
// This is the runtime counterpart of nothing in the command tables: `PRS` can only address a preset
// slot by number, and only NRI states which slot holds which station, with the exact station name the
// AVR shows. Selecting a station from the select entity therefore needs this map to turn a station
// name back into the slot number to send.
//
// The list is deliberately not persisted: the AVR is asked again on every NRI reply, so a station
// renamed or deleted on the device is reflected without a config change.

/** One stored tuner preset, as reported by the AVR. */
export type AvrTunerPreset = {
  /** 1-based slot number on the AVR, which is what `PRS` recalls. */
  slot: number;
  /** Station name exactly as the AVR shows it, e.g. "NPO FunX" or "STRKSTAD". */
  name: string;
  /** Raw band attribute, see PRESET_BAND_* in avrInfoStore. */
  band: string;
  /** Frequency in MHz for FM/AM, "0" for DAB which has none. */
  freq: string;
};

/** Collected presets per physical AVR id ("MODEL HOST"). */
const presetsByAvr = new Map<string, AvrTunerPreset[]>();

/**
 * Drop what cannot be selected and what the option list cannot show.
 *
 * Empty names are empty slots, which the AVR reports as `name=""`. Two slots can carry the same
 * station name (e.g. the same station once for DAB and once for FM), which would make a duplicate
 * option in the select entity that could not be told apart, so the first (lowest) slot wins.
 */
export function normalizeTunerPresets(raw: AvrTunerPreset[]): AvrTunerPreset[] {
  const usable = raw.filter((preset) => Number.isInteger(preset.slot) && preset.slot >= 1 && preset.name.trim() !== "");

  // Sorted first, so the lowest slot of a repeated station name is the one that survives.
  usable.sort((a, b) => a.slot - b.slot);

  const seenNames = new Set<string>();
  const presets: AvrTunerPreset[] = [];

  for (const preset of usable) {
    const key = preset.name.trim().toLowerCase();
    if (seenNames.has(key)) {
      continue;
    }
    seenNames.add(key);
    presets.push({ slot: preset.slot, name: preset.name.trim(), band: preset.band, freq: preset.freq });
  }

  return presets;
}

/** Store the presets collected for an AVR. Returns true when the effective list changed. */
export function setTunerPresets(physicalAvrId: string, presets: AvrTunerPreset[]): boolean {
  const normalized = normalizeTunerPresets(presets);
  const changed = JSON.stringify(normalized) !== JSON.stringify(getTunerPresets(physicalAvrId));
  if (normalized.length === 0) {
    presetsByAvr.delete(physicalAvrId);
  } else {
    presetsByAvr.set(physicalAvrId, normalized);
  }
  return changed;
}

/** Presets collected for an AVR, in AVR slot order. Empty when nothing was collected. */
export function getTunerPresets(physicalAvrId: string): AvrTunerPreset[] {
  return presetsByAvr.get(physicalAvrId) ?? [];
}

/** Station names for the select entity, in AVR slot order. */
export function getTunerPresetNames(physicalAvrId: string): string[] {
  return getTunerPresets(physicalAvrId)
    .map((preset) => preset.name)
    .sort((a, b) => a.localeCompare(b));
}

/** True when the AVR reported at least one station. */
export function hasTunerPresets(physicalAvrId: string): boolean {
  return (presetsByAvr.get(physicalAvrId)?.length ?? 0) > 0;
}

/** The stored preset for a station name, used to turn a selection back into a slot number. */
export function findTunerPresetByName(physicalAvrId: string, name: string): AvrTunerPreset | undefined {
  const wanted = name.trim().toLowerCase();
  return getTunerPresets(physicalAvrId).find((preset) => preset.name.toLowerCase() === wanted);
}

/** The station name the AVR currently has selected for a slot, used to report state back. */
export function findTunerPresetNameBySlot(physicalAvrId: string, slot: number): string | undefined {
  return getTunerPresets(physicalAvrId).find((preset) => preset.slot === slot)?.name;
}

/** Forget the collected presets of an AVR, e.g. when the AVR stops answering with a preset list. */
export function clearTunerPresets(physicalAvrId: string): void {
  presetsByAvr.delete(physicalAvrId);
}

/** Forget every AVR, used when the config is cleared. */
export function clearAllTunerPresets(): void {
  presetsByAvr.clear();
}

/** `PRS` value for a slot: the slot number in upper case hex, zero padded to two characters. */
export function tunerPresetCommandValue(slot: number): string {
  return Math.trunc(slot).toString(16).toUpperCase().padStart(2, "0");
}
