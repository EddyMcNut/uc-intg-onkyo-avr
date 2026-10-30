import type { AvrConfig } from "./configManager.js";
import { getAvrSourcesByPhysicalId } from "./avrSourceCatalog.js";
import { eiscpMappings } from "./eiscp-mappings.js";
import { getAliasesForReportedInput, getInputSourceAliases, isNetworkInputSource, resolveConfiguredInputSources } from "./inputSourcePreferences.js";
import { NETWORK_INPUT_MARKERS } from "./configConstants.js";

export const SETUP_SELECTION_PAGE_SIZE = 10;

export function stripInputSourceMarker(option: string): string {
  const markers = NETWORK_INPUT_MARKERS.filter((marker) => marker !== "none").map((marker) => marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return option.replace(new RegExp(`^(?:${markers})\\s+`, "u"), "");
}

export function presentInputSourceOptions(avrConfig: AvrConfig, physicalAvrId: string, builtInOptions: string[]): string[] {
  const options = getInputSourceOptions(avrConfig, physicalAvrId, builtInOptions);
  const reportedByName = new Map(getAvrSourcesByPhysicalId(physicalAvrId).map((input) => [input.name.toLowerCase(), input]));
  const configuredByName = new Map(
    Object.entries(avrConfig.idInputSources ?? {}).flatMap(([id, entry]) => [
      [entry.name.toLowerCase(), [id, entry] as const],
      [entry.setting.toLowerCase(), [id, entry] as const]
    ])
  );
  const mappings = eiscpMappings.value_mappings.SLI as Record<string, { value: string }>;
  const decorated = options.map((option) => {
    const reportedInput = reportedByName.get(option.toLowerCase());
    const configured = configuredByName.get(option.toLowerCase());
    const id = reportedInput?.id ?? configured?.[0] ?? mappings[option.trim().toLowerCase()]?.value.toLowerCase() ?? "";
    const aliases = reportedInput ? getAliasesForReportedInput(id, reportedInput.name) : getInputSourceAliases(id);
    return { option, network: reportedInput?.network || isNetworkInputSource(id, reportedInput?.name ?? option, aliases) };
  });

  if (avrConfig.inputSourceLayout === "network-first") decorated.sort((a, b) => Number(b.network) - Number(a.network));
  if (avrConfig.inputSourceLayout === "network-last" || avrConfig.inputSourceLayout === "separate") decorated.sort((a, b) => Number(a.network) - Number(b.network));
  const marker = avrConfig.networkInputMarker ?? "none";
  return decorated.map(({ option, network }) => (network && marker !== "none" ? `${marker} ${option}` : option));
}

export function displayInputSourceOption(avrConfig: AvrConfig, physicalAvrId: string, option: string): string {
  const cleanOption = stripInputSourceMarker(option).toLowerCase();
  const reportedInput = getAvrSourcesByPhysicalId(physicalAvrId).find((input) => input.name.toLowerCase() === cleanOption);
  const configured = Object.entries(avrConfig.idInputSources ?? {}).find(([, entry]) => entry.name.toLowerCase() === cleanOption || entry.setting.toLowerCase() === cleanOption);
  const mappings = eiscpMappings.value_mappings.SLI as Record<string, { value: string }>;
  const id = reportedInput?.id ?? configured?.[0] ?? mappings[cleanOption]?.value.toLowerCase() ?? "";
  const aliases = reportedInput ? getAliasesForReportedInput(id, reportedInput.name) : getInputSourceAliases(id);
  const isNetwork = reportedInput?.network || isNetworkInputSource(id, reportedInput?.name ?? cleanOption, aliases);
  const marker = avrConfig.networkInputMarker ?? "none";
  return isNetwork && marker !== "none" ? `${marker} ${stripInputSourceMarker(option)}` : stripInputSourceMarker(option);
}

function getInputSourceOptions(avrConfig: AvrConfig, physicalAvrId: string, builtInOptions: string[]): string[] {
  if (avrConfig.idInputSources && Object.keys(avrConfig.idInputSources).length > 0) return resolveConfiguredInputSources(avrConfig.idInputSources);
  if (!avrConfig.useAvrReportedInputs) return builtInOptions;
  const reported = getAvrSourcesByPhysicalId(physicalAvrId);
  return reported.length > 0 ? reported.map((input) => input.name) : builtInOptions;
}
