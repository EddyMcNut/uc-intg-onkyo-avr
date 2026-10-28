import type { AvrConfig } from "./configManager.js";
import { NETWORK_INPUT_MARKERS } from "./configConstants.js";
import { getAvrSourcesByPhysicalId } from "./avrSourceCatalog.js";
import { eiscpMappings } from "./eiscp-mappings.js";
import { getAliasesForReportedInput, getInputSourceAliases, isNetworkInputSource, resolveConfiguredInputSources } from "./inputSourcePreferences.js";

export const SETUP_SELECTION_PAGE_SIZE = 10;

export function isNetworkInputMarker(value: string): boolean {
  return (NETWORK_INPUT_MARKERS as readonly string[]).includes(value);
}

export function presentInputSourceOptions(avrConfig: AvrConfig, physicalAvrId: string, builtInOptions: string[]): string[] {
  const options = getInputSourceOptions(avrConfig, physicalAvrId, builtInOptions);
  const reported = getAvrSourcesByPhysicalId(physicalAvrId);
  const decorated = options.map((option) => {
    const reportedInput = reported.find((input) => input.name.toLowerCase() === option.toLowerCase());
    const configured = Object.entries(avrConfig.idInputSources ?? {}).find(([, entry]) => entry.name.toLowerCase() === option.toLowerCase() || entry.setting.toLowerCase() === option.toLowerCase());
    const mappings = eiscpMappings.value_mappings.SLI as Record<string, { value: string }>;
    const id = reportedInput?.id ?? configured?.[0] ?? mappings[option.trim().toLowerCase()]?.value.toLowerCase() ?? "";
    const aliases = reportedInput ? getAliasesForReportedInput(id, reportedInput.name) : getInputSourceAliases(id);
    return { option, network: isNetworkInputSource(id, reportedInput?.name ?? option, aliases) };
  });

  if (avrConfig.inputSourceLayout === "separate") {
    decorated.sort((a, b) => Number(a.network) - Number(b.network));
  }

  const marker = avrConfig.networkInputMarker ?? "none";
  return decorated.map(({ option, network }) => (network && marker !== "none" ? `${marker} ${option}` : option));
}

function getInputSourceOptions(avrConfig: AvrConfig, physicalAvrId: string, builtInOptions: string[]): string[] {
  if (avrConfig.idInputSources && Object.keys(avrConfig.idInputSources).length > 0) {
    return resolveConfiguredInputSources(avrConfig.idInputSources);
  }
  if (!avrConfig.useAvrReportedInputs) return builtInOptions;

  const reported = getAvrSourcesByPhysicalId(physicalAvrId);
  return reported.length > 0 ? reported.map((input) => input.name) : builtInOptions;
}
