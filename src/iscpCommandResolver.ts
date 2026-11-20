// Resolves a user command ("input-selector Music Server", "listening-mode stereo", "volume 40") into the ISCP
// message to send. Read-only: it looks up the AVR-reported services and inputs, configured input ids and learned
// listening modes, but changes nothing. EiscpDriver only queues and sends the result.
import { eiscpMappings } from "./eiscp-mappings.js";
import { buildEntityId, buildPhysicalAvrId } from "./configManager.js";
import type { AvrContextRegistry } from "./avrContext.js";
import { findLearnedListeningModeCode } from "./learnedListeningModeStore.js";
import { findConfiguredInputId } from "./inputSourcePreferences.js";
import { stripInputSourceMarker } from "./inputSourceResolver.js";
import { NSS_SERVICE_NAMES } from "./eiscpCommandWorkflow.js";
import { getMenuBrowseService } from "./menuBrowseServices.js";
import { MUSIC_SERVER_SERVICE_ID } from "./browseServiceContract.js";
import { getZonePrefix } from "./zoneMappings.js";
import type { AvrStateReader } from "./eiscp-command-parser.js";
import type { EiscpConfig } from "./eiscpTypes.js";
import log from "./loggers.js";

const COMMAND_MAPPINGS = eiscpMappings.command_mappings;
const VALUE_MAPPINGS = eiscpMappings.value_mappings;
const logSource = "eISCP:";

export interface IscpCommandContext {
  config: Readonly<EiscpConfig>;
  stateReader: AvrStateReader;
  avrContexts: AvrContextRegistry;
}

export function resolveIscpCommand(command: string, args: string | number | undefined, zone: string, context: IscpCommandContext): string {
  const prefix = (COMMAND_MAPPINGS as Record<string, string>)[command];
  let value: string;
  const modernNavigation = context.config.networkNavigationMode !== "legacy";
  if (prefix === "SLI" && typeof args === "string") {
    const normalizedSource = stripInputSourceMarker(args)
      .toLowerCase()
      .replace(/[\s_-]+/g, "-");
    const physicalAvrId = buildPhysicalAvrId(context.config.model ?? "", context.config.host ?? "");
    const reportedService = context.avrContexts.get(physicalAvrId).avrInfo.findNetServiceByName([args]);
    if (reportedService) {
      const logicalService = Object.entries(NSS_SERVICE_NAMES).find(([, names]) => names.includes(reportedService.name.toLowerCase().replace(/[^a-z0-9]/g, "")));
      if (logicalService) {
        log.debug("%s Sending reported network service %s through %s", logSource, args, logicalService[0]);
        return logicalService[0];
      }
      log.debug("%s Sending reported network service %s directly through NSV%s", logSource, args, reportedService.id);
      return `NSV${reportedService.id.toUpperCase()}0`;
    }

    // Tidal, Deezer and Music Server open directly through NSV with modern navigation. Music Server has both the
    // legacy SLI27 alias and the network-service NSS10 alias: display names such as "Music Server" must resolve to
    // the latter; otherwise separator-insensitive matching picks SLI27 first. (This deliberately uses the dashed
    // normalizer above, not toServiceId: "musicserver" without a separator is the SLI27 input.)
    const menuService = getMenuBrowseService(normalizedSource);
    if (menuService?.id === MUSIC_SERVER_SERVICE_ID && !modernNavigation) return "NSS10";
    if (menuService && modernNavigation) return menuService.modernSelectSourceCommand;
  }
  const valueMap = (VALUE_MAPPINGS as unknown as Record<string, Record<string, { value: string }>>)[prefix];
  const mappedKey =
    args !== undefined && valueMap
      ? Object.keys(valueMap).find(
          (key) =>
            key.toLowerCase() === String(args).toLowerCase() ||
            key.toLowerCase().replace(/[\s_-]+/g, "") ===
              String(args)
                .toLowerCase()
                .replace(/[\s_-]+/g, "")
        )
      : undefined;
  if (args !== undefined && valueMap && mappedKey !== undefined) {
    value = valueMap[mappedKey].value;
  } else if (prefix === "SLI" && typeof args === "string") {
    args = stripInputSourceMarker(args);
    const physicalAvrId = buildPhysicalAvrId(context.config.model ?? "", context.config.host ?? "");
    // An input name the AVR reported itself ("BD/DVD", "CBL/SAT") is not in the hardcoded SLI table: send the input id the AVR gave for it instead.
    const inputId = context.avrContexts.get(physicalAvrId).inputs.findId(args) ?? findConfiguredInputId(context.config.idInputSources, args);
    if (inputId) {
      log.debug("%s Sending input-selector %s as %s%s (id reported by the AVR)", logSource, args, getZonePrefix(prefix, zone), inputId);
      return getZonePrefix(prefix, zone) + inputId;
    }
    log.error("%s Input source alias is not mapped: %s %s", logSource, command, args);
    value = String(args ?? "");
  } else if (prefix === "LMD" && typeof args === "string") {
    const physicalAvrId = buildPhysicalAvrId(context.config.model ?? "", context.config.host ?? "");
    const entityId = buildEntityId(context.config.model ?? "", context.config.host ?? "", zone);
    const learnedCode = findLearnedListeningModeCode(physicalAvrId, args, context.stateReader.getSource(entityId), context.stateReader.getAudioFormat?.(entityId));
    if (learnedCode) {
      log.debug("%s Sending learned listening mode %s as LMD%s", logSource, args, learnedCode);
      value = learnedCode;
    } else {
      log.warn("%s Listening mode is not mapped: %s", logSource, args);
      value = String(args);
    }
  } else if (valueMap && Object.prototype.hasOwnProperty.call(valueMap, "intgrRange")) {
    value = (+args!).toString(16).toUpperCase().padStart(2, "0");
  } else {
    log.warn("%s not found in JSON: %s %s", logSource, command, args);
    value = String(args ?? "");
  }

  // Translate main zone command prefixes to zone-specific prefixes
  const zonePrefix = getZonePrefix(prefix, zone);

  return zonePrefix + value;
}
