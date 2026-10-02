// Input sources the AVR reported about itself, collected from the NRI payload.
//
// This is the runtime counterpart of the hardcoded SLI command table in eiscp-commands.ts: it maps the
// input id used by SLI (e.g. "33" for DAB) to the name the AVR itself shows ("DAB", "BD/DVD", ...).
// Keeping it separate from avrInfoStore makes the collected list authoritative for the option list
// and the send path, so a stale AVR-info document cannot resurrect inputs the AVR no longer has.
//
// The list is deliberately not persisted: the config only stores whether "auto" or "manual" is in
// effect, and the inputs are collected again on every NRI reply.

/** One input as reported by the AVR. */
export type AvrInput = {
  /** Input id as used by SLI, e.g. "33" for DAB. */
  id: string;
  /** Name as the AVR shows it, e.g. "DAB" or "BD/DVD". */
  name: string;
};

/** Collected inputs per physical AVR id ("MODEL HOST"). */
const inputsByAvr = new Map<string, AvrInput[]>();

/** Sort the way the option list is presented: alphabetically, ignoring case and accents. */
function byName(a: AvrInput, b: AvrInput): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/**
 * Names that are not real inputs. Some AVRs add a placeholder entry named "Source" to the selector
 * list, which cannot be selected, so it is dropped whatever case the AVR uses for it.
 */
const EXCLUDED_INPUT_NAMES = new Set(["source"]);

/** True when a reported name is a placeholder and not a selectable input. */
export function isExcludedInputName(name: string): boolean {
  return EXCLUDED_INPUT_NAMES.has(name.trim().toLowerCase());
}

/**
 * Deduplicate and order the raw collected inputs.
 *
 * The AVR can report the same name more than once (aliases of the same input), and duplicates would
 * break the option cycling of the select entity, so only the first of each id and name is kept.
 */
export function normalizeAvrInputs(raw: AvrInput[]): AvrInput[] {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const inputs: AvrInput[] = [];

  for (const input of raw) {
    const id = input.id.trim().toLowerCase();
    const name = input.name.trim();
    const key = name.toLowerCase();
    if (!id || !name || isExcludedInputName(name) || seenIds.has(id) || seenNames.has(key)) {
      continue;
    }
    seenIds.add(id);
    seenNames.add(key);
    inputs.push({ id, name });
  }

  return inputs.sort(byName);
}

/** Store the inputs collected for an AVR. Returns true when the effective list changed. */
export function setAvrInputs(physicalAvrId: string, inputs: AvrInput[]): boolean {
  const normalized = normalizeAvrInputs(inputs);
  const changed = JSON.stringify(normalized) !== JSON.stringify(getAvrInputs(physicalAvrId));
  if (normalized.length === 0) {
    inputsByAvr.delete(physicalAvrId);
  } else {
    inputsByAvr.set(physicalAvrId, normalized);
  }
  return changed;
}

/** Inputs collected for an AVR, sorted by name. Empty when nothing was collected (or manual mode is used). */
export function getAvrInputs(physicalAvrId: string): AvrInput[] {
  return inputsByAvr.get(physicalAvrId) ?? [];
}

/** True when the AVR reported inputs and they are in use. */
export function hasAvrInputs(physicalAvrId: string): boolean {
  return (inputsByAvr.get(physicalAvrId)?.length ?? 0) > 0;
}

/** Input id for an AVR-reported input name, used to send SLI with the id the AVR itself gave. */
export function findAvrInputId(physicalAvrId: string, name: string): string | undefined {
  const wanted = name.trim().toLowerCase();
  return getAvrInputs(physicalAvrId).find((input) => input.name.toLowerCase() === wanted)?.id;
}

/** AVR-reported name for an input id, used to report back what the AVR is playing. */
export function findAvrInputName(physicalAvrId: string, id: string): string | undefined {
  const wanted = id.trim().toLowerCase();
  return getAvrInputs(physicalAvrId).find((input) => input.id === wanted)?.name;
}

/** Forget the collected inputs of an AVR, e.g. when the user switches the setting to "manual". */
export function clearAvrInputs(physicalAvrId: string): void {
  inputsByAvr.delete(physicalAvrId);
}

/** Forget every AVR, used when the config is cleared. */
export function clearAllAvrInputs(): void {
  inputsByAvr.clear();
}
