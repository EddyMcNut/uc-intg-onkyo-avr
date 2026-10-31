// Resolve configured input aliases against the names and IDs reported by the AVR.
import { eiscpMappings } from "./eiscp-mappings.js";
import { type AvrConfig } from "./configManager.js";
import { normalizeAvrInputs, type AvrInput } from "./inputSourceStore.js";
import { getAvrInfo, listSelectors } from "./avrInfoStore.js";
import { getAvrSourcesByPhysicalId } from "./avrSourceCatalog.js";
import { getInputSourceAliases } from "./inputSourcePreferences.js";
import { presentInputSourceOptions, stripInputSourceMarker } from "./inputSourcePresentation.js";
export { stripInputSourceMarker } from "./inputSourcePresentation.js";

export type InputSourceListResolution = {
  inputs?: AvrInput[];
  reason: string;
};

// Combine selector and network-service sources without losing services whose IDs collide with selectors.
export function collectAvrInputSources(selectors: AvrInput[], services: AvrInput[]): AvrInput[] {
  const selectorIds = new Set(selectors.map((input) => input.id.toLowerCase()));
  const namespacedServices = services.map((service) => ({
    ...service,
    network: true,
    id: selectorIds.has(service.id.toLowerCase()) ? `NSV${service.id.toUpperCase()}` : service.id
  }));
  return normalizeAvrInputs([...selectors, ...namespacedServices]);
}

// Return the stable SLI ID for a built-in integration alias.
export function getInputSourceId(option: string): string | undefined {
  option = stripInputSourceMarker(option);
  const mappings = eiscpMappings.value_mappings.SLI as Record<string, { value: string }>;
  return mappings[option.trim().toLowerCase()]?.value.toLowerCase();
}

// Resolve a displayed option to an AVR-reported ID, then fall back to the built-in alias mapping.
export function resolveInputSourceId(physicalAvrId: string, option: string): string | undefined {
  const cleanOption = stripInputSourceMarker(option);
  return getAvrSourcesByPhysicalId(physicalAvrId).find((input) => input.name.toLowerCase() === cleanOption.trim().toLowerCase())?.id ?? getInputSourceId(cleanOption);
}

// Convert a displayed/configured source name to the stable integration name used by internal state comparisons. AVR-learned names remain suitable for display, but must not replace values such as `net`, `fm`, or `dab` in the state model.
export function resolveCanonicalInputSource(physicalAvrId: string, option: string): string {
  const inputId = resolveInputSourceId(physicalAvrId, option);
  const aliases = inputId ? getInputSourceAliases(inputId) : [];
  return aliases[0] ?? stripInputSourceMarker(option).trim().toLowerCase().replace(/\s+/g, "-");
}

// Build the options shown by the input selector for one configured AVR zone.
export function getEffectiveInputSourceOptions(avrConfig: AvrConfig, physicalAvrId: string, builtInOptions: string[]): string[] {
  return presentInputSourceOptions(avrConfig, physicalAvrId, builtInOptions);
}

// Resolve the AVR's input list when AVR-reported names are enabled.
export function resolveInputSourceList(avrConfig: AvrConfig, entityId: string): InputSourceListResolution | undefined {
  if (!avrConfig.useAvrReportedInputs) {
    return undefined;
  }

  const selectors = listSelectors(entityId);
  const info = getAvrInfo(entityId);
  const services = (info?.netServices ?? []).filter((service) => service.enabled && service.id && service.name).map((service) => ({ id: service.id, name: service.name }));
  const inputs = collectAvrInputSources(
    selectors.map((selector) => ({ id: selector.id, name: selector.name })),
    services
  );

  if (inputs.length === 0) {
    return {
      reason:
        selectors.length === 0 && services.length === 0
          ? "AVR reports no input sources, so integration mappings are used"
          : "AVR reports no usable input source names, so integration mappings are used"
    };
  }

  return {
    inputs,
    reason: `AVR reports ${inputs.length} input(s), including network services where available: ${inputs.map((input) => `${input.name} (${input.id})`).join(", ")}`
  };
}
