// Input sources the AVR reported about itself, collected from the NRI payload.
//
// This is the runtime counterpart of the hardcoded SLI command table in eiscp-commands.ts: it maps the
// input id used by SLI (e.g. "33" for DAB) to the name the AVR itself shows ("DAB", "BD/DVD", ...).
// Keeping it separate from avrInfoStore makes the collected list authoritative for the option list
// and the send path, so a stale AVR-info document cannot resurrect inputs the AVR no longer has.
//
// The list is deliberately not persisted: the config only stores whether "auto" or "manual" is in
// effect, and the inputs are collected again on every NRI reply.

// One input as reported by the AVR.
export type AvrInput = {
  // Input id as used by SLI, e.g. "33" for DAB.
  id: string;
  // Name as the AVR shows it, e.g. "DAB" or "BD/DVD".
  name: string;
  // True when the entry came from the AVR's network-service list rather than its selector list.
  network?: boolean;
};

// Sort the way the option list is presented: alphabetically, ignoring case and accents.
function byName(a: AvrInput, b: AvrInput): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

// Names that are not real inputs. Some AVRs add a placeholder entry named "Source" to the selector list, which cannot be selected, so it is dropped whatever case the AVR uses for it.
const EXCLUDED_INPUT_NAMES = new Set(["source"]);

// True when a reported name is a placeholder and not a selectable input.
export function isExcludedInputName(name: string): boolean {
  return EXCLUDED_INPUT_NAMES.has(name.trim().toLowerCase());
}

// Deduplicate and order the raw collected inputs. The AVR can report the same name more than once (aliases of the same input), and duplicates would break the option cycling of the select entity, so only the first of each id and name is kept.
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
    inputs.push({ id, name, ...(input.network ? { network: true } : {}) });
  }

  return inputs.sort(byName);
}

// The inputs collected for one physical AVR. One instance lives in that AVR's AvrContext (see avrContext.ts).
export class InputSourceStore {
  private inputs: AvrInput[] = [];

  // Store the inputs collected for the AVR. Returns true when the effective list changed.
  set(inputs: AvrInput[]): boolean {
    const normalized = normalizeAvrInputs(inputs);
    const changed = JSON.stringify(normalized) !== JSON.stringify(this.inputs);
    this.inputs = normalized;
    return changed;
  }

  // Inputs sorted by name. Empty when nothing was collected (or manual mode is used).
  list(): AvrInput[] {
    return [...this.inputs];
  }

  // True when the AVR reported inputs and they are in use.
  has(): boolean {
    return this.inputs.length > 0;
  }

  // Input id for an AVR-reported input name, used to send SLI with the id the AVR itself gave.
  findId(name: string): string | undefined {
    const wanted = name.trim().toLowerCase();
    return this.inputs.find((input) => input.name.toLowerCase() === wanted)?.id;
  }

  // AVR-reported name for an input id, used to report back what the AVR is playing.
  findName(id: string): string | undefined {
    const wanted = id.trim().toLowerCase();
    return this.inputs.find((input) => input.id === wanted)?.name;
  }

  // Forget the collected inputs, e.g. when the user switches the setting to "manual".
  clear(): void {
    this.inputs = [];
  }
}
