// Tuner presets (DAB / DAB+ / FM / AM) the AVR reported about itself, collected from the NRI payload.
//
// This is the runtime counterpart of nothing in the command tables: `PRS` can only address a preset
// slot by number, and only NRI states which slot holds which station, with the exact station name the
// AVR shows. Selecting a station from the select entity therefore needs this map to turn a station
// name back into the slot number to send.
//
// The list is deliberately not persisted: the AVR is asked again on every NRI reply, so a station
// renamed or deleted on the device is reflected without a config change.

// One stored tuner preset, as reported by the AVR.
export type AvrTunerPreset = {
  // 1-based slot number on the AVR, which is what `PRS` recalls.
  slot: number;
  // Station name exactly as the AVR shows it, e.g. "NPO FunX" or "STRKSTAD".
  name: string;
  // Raw band attribute, see PRESET_BAND_* in avrInfoStore.
  band: string;
  // Frequency in MHz for FM/AM, "0" for DAB which has none.
  freq: string;
};

// Drop what cannot be selected and what the option list cannot show. Empty names are empty slots, which the AVR reports as `name=""`. Two slots can carry the same station name (e.g. the same station once for DAB and once for FM), which would make a duplicate option in the select entity that could not be told apart, so the first (lowest) slot wins.
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

// The presets collected for one physical AVR. One instance lives in that AVR's AvrContext (see avrContext.ts).
export class TunerPresetStore {
  private presets: AvrTunerPreset[] = [];

  // Store the presets collected for the AVR. Returns true when the effective list changed.
  set(presets: AvrTunerPreset[]): boolean {
    const normalized = normalizeTunerPresets(presets);
    const changed = JSON.stringify(normalized) !== JSON.stringify(this.presets);
    this.presets = normalized;
    return changed;
  }

  // Presets in AVR slot order. Empty when nothing was collected.
  list(): AvrTunerPreset[] {
    return [...this.presets];
  }

  // Station names for the select entity: alphabetical for user-facing option cycling, or in preset (slot) order.
  names(mode: "alphabetical" | "preset-order" = "alphabetical"): string[] {
    const names = this.presets.map((preset) => preset.name);
    return mode === "preset-order" ? names : names.sort((a, b) => a.localeCompare(b));
  }

  // True when the AVR reported at least one station.
  has(): boolean {
    return this.presets.length > 0;
  }

  // The stored preset for a station name, used to turn a selection back into a slot number.
  findByName(name: string): AvrTunerPreset | undefined {
    const wanted = name.trim().toLowerCase();
    return this.presets.find((preset) => preset.name.toLowerCase() === wanted);
  }

  // The station name the AVR currently has selected for a slot, used to report state back.
  findNameBySlot(slot: number): string | undefined {
    return this.presets.find((preset) => preset.slot === slot)?.name;
  }

  // Forget the collected presets, e.g. when the AVR stops answering with a preset list.
  clear(): void {
    this.presets = [];
  }
}

// `PRS` value for a slot: the slot number in upper case hex, zero padded to two characters.
export function tunerPresetCommandValue(slot: number): string {
  return Math.trunc(slot).toString(16).toUpperCase().padStart(2, "0");
}
