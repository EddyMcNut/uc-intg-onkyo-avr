// Resolve the "auto" input source list setting against what the AVR reports about itself.
//
// The hardcoded SLI table in eiscp-commands.ts has to guess what an AVR calls its inputs and which
// ones it has, and gets it wrong for renamed inputs, model-specific variants and inputs added by a
// firmware update. NRI knows: it states the exact input ids and the exact names per AVR.
//
// "auto" therefore uses those collected names. When the AVR reports no inputs at all — because it
// does not support NRI, or its firmware has no input list — there is nothing to use, so the setting
// is stored as "manual" and the hardcoded table is used from then on.
import { INPUT_SOURCE_LIST_AUTO, INPUT_SOURCE_LIST_MANUAL, type AvrConfig, type InputSourceList } from "./configManager.js";
import { listSelectors } from "./avrInfoStore.js";
import { isExcludedInputName, normalizeAvrInputs, type AvrInput } from "./inputSourceStore.js";

export type InputSourceListResolution = {
  /** Mode to keep, or to store in the config. */
  mode: InputSourceList;
  /** Collected inputs, only set when the mode stays "auto". */
  inputs?: AvrInput[];
  /** How this was arrived at, for the debug log. */
  reason: string;
};

/**
 * Resolve the input source list of one AVR when it is set to "auto".
 *
 * Returns undefined when there is nothing to do: the AVR is already on "manual", so a setting the
 * user made is never overwritten.
 */
export function resolveInputSourceList(avrConfig: AvrConfig, entityId: string): InputSourceListResolution | undefined {
  if (avrConfig.inputSourceList !== INPUT_SOURCE_LIST_AUTO) {
    return undefined;
  }

  const selectors = listSelectors(entityId);
  const inputs = normalizeAvrInputs(selectors.map((selector) => ({ id: selector.id, name: selector.name })));

  if (inputs.length === 0) {
    return {
      mode: INPUT_SOURCE_LIST_MANUAL,
      reason:
        selectors.length === 0
          ? "AVR reports no input sources, so the manual list is used"
          : isOnlyPlaceholderInputs(selectors)
            ? "AVR only reports placeholder inputs, so the manual list is used"
            : "AVR reports input sources without usable names, so the manual list is used"
    };
  }

  return {
    mode: INPUT_SOURCE_LIST_AUTO,
    inputs,
    reason: `AVR reports ${inputs.length} input(s): ${inputs.map((input) => `${input.name} (${input.id})`).join(", ")}`
  };
}

/** True when every reported entry is a placeholder that is not collected (see EXCLUDED_INPUT_NAMES). */
function isOnlyPlaceholderInputs(selectors: { name: string }[]): boolean {
  return selectors.every((selector) => isExcludedInputName(selector.name));
}
