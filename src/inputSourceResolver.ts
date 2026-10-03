// Resolve configured input aliases against the names and IDs reported by the AVR.
import { eiscpMappings } from "./eiscp-mappings.js";
import { type AvrConfig } from "./configManager.js";
import { getAvrInputs, normalizeAvrInputs, type AvrInput } from "./inputSourceStore.js";
import { listSelectors } from "./avrInfoStore.js";

export type InputSourceListResolution = {
  inputs?: AvrInput[];
  reason: string;
};

/** Return the stable SLI ID for a built-in integration alias. */
export function getInputSourceId(option: string): string | undefined {
  const mappings = eiscpMappings.value_mappings.SLI as Record<string, { value: string }>;
  return mappings[option.trim().toLowerCase()]?.value.toLowerCase();
}

/** Resolve a displayed option to an AVR-reported ID, then fall back to the built-in alias mapping. */
export function resolveInputSourceId(physicalAvrId: string, option: string): string | undefined {
  return getAvrInputs(physicalAvrId).find((input) => input.name.toLowerCase() === option.trim().toLowerCase())?.id ?? getInputSourceId(option);
}

/** Build the options shown by the input selector for one configured AVR zone. */
export function getEffectiveInputSourceOptions(avrConfig: AvrConfig, physicalAvrId: string, builtInOptions: string[]): string[] {
  const configured = avrConfig.inputSelectorOptions;
  if (!avrConfig.useAvrReportedInputs) {
    return configured === null ? [] : Array.isArray(configured) ? configured.map((option) => option.trim()) : builtInOptions;
  }

  const reported = getAvrInputs(physicalAvrId);
  if (configured === null) {
    return [];
  }
  if (configured === undefined || configured === "all") {
    return reported.length > 0 ? reported.map((input) => input.name) : builtInOptions;
  }

  // The configured aliases remain the allowlist. AVR names replace matching aliases, while
  // aliases unknown to this AVR remain selectable through the existing hardcoded SLI mapping.
  return configured.map((option) => {
    const id = getInputSourceId(option);
    return reported.find((input) => input.id === id)?.name ?? option.trim();
  });
}

/** Resolve the AVR's input list when AVR-reported names are enabled. */
export function resolveInputSourceList(avrConfig: AvrConfig, entityId: string): InputSourceListResolution | undefined {
  if (!avrConfig.useAvrReportedInputs) {
    return undefined;
  }

  const selectors = listSelectors(entityId);
  const inputs = normalizeAvrInputs(selectors.map((selector) => ({ id: selector.id, name: selector.name })));

  if (inputs.length === 0) {
    return {
      reason: selectors.length === 0 ? "AVR reports no input sources, so integration mappings are used" : "AVR reports no usable input source names, so integration mappings are used"
    };
  }

  return {
    inputs,
    reason: `AVR reports ${inputs.length} input(s): ${inputs.map((input) => `${input.name} (${input.id})`).join(", ")}`
  };
}
