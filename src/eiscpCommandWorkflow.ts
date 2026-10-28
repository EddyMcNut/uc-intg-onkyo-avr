import { buildPhysicalAvrId } from "./configManager.js";
import { findNetServiceByName } from "./avrInfoStore.js";
import { delay } from "./utils.js";
import type { EiscpConfig } from "./eiscpTypes.js";
import { getZonePrefix } from "./zoneMappings.js";

export const NSS_SERVICE_NAMES: Readonly<Record<string, string[]>> = {
  NSS01: ["tuneinradio", "tunein"],
  NSS02: ["spotify"],
  NSS03: ["deezer"],
  NSS04: ["tidal"],
  NSS05: ["amazonmusic"],
  NSS06: ["chromecastbuiltin", "chromecast"],
  NSS07: ["dtsplayfi", "playfi"],
  NSS08: ["airplay", "airplay2"],
  NSS09: ["alexa"],
  NSS10: ["musicserver"]
};

export interface WorkflowMetadata {
  artist: string;
  album: string;
}

export interface EiscpCommandWorkflowDependencies {
  getConfig: () => Readonly<EiscpConfig>;
  raw: (command: string) => Promise<void>;
  publishMetadata: (metadata: WorkflowMetadata, command: string) => void;
}

export function isTuneInPresetCommand(command: string): boolean {
  return command.startsWith("TIP") && command.length > 3 && /^[0-9A-Fa-f]+$/.test(command.slice(3));
}

export function extractNetworkServiceCode(command: string): string | undefined {
  const index = command.indexOf("NSS");
  if (index < 0 || index + 5 > command.length) return undefined;
  const code = command.slice(index, index + 5);
  return /^NSS\d{2}$/.test(code) ? code : undefined;
}

/** Handles AVR-specific multi-command navigation while EiscpDriver owns transport concerns. */
export class EiscpCommandWorkflow {
  constructor(private readonly dependencies: EiscpCommandWorkflowDependencies) {}

  async send(command: string, zone: string): Promise<void> {
    if (isTuneInPresetCommand(command)) {
      return this.sendTuneInPreset(command);
    }

    const nssCode = extractNetworkServiceCode(command);
    if (nssCode) {
      return this.sendNetworkService(nssCode, zone);
    }

    const nsvMatch = command.match(/^NSV([0-9A-Fa-f]{2})0$/);
    if (nsvMatch) {
      return this.sendNetworkServiceById(nsvMatch[1], zone);
    }

    return;
  }

  private async sendTuneInPreset(command: string): Promise<void> {
    const config = this.dependencies.getConfig();
    const preset = parseInt(command.slice(3), 16);
    const presetIndex = String(preset).padStart(5, "0");
    const menuDelay = config.netMenuDelay ?? 2500;
    const menuPosition = String(config.tuneinPresetPosition ?? 1).padStart(5, "0");

    this.dependencies.publishMetadata({ artist: `Selecting preset ${preset}...`, album: "please wait" }, command);
    await this.dependencies.raw("NTCTOP");
    await delay(menuDelay);
    await this.dependencies.raw("NTCSELECT");
    await delay(menuDelay * 3);
    await this.dependencies.raw(`NLSI${menuPosition}`);
    await delay(menuDelay * 2);
    await this.dependencies.raw(`NLSI${presetIndex}`);
  }

  private async sendNetworkService(code: string, zone: string): Promise<void> {
    const config = this.dependencies.getConfig();
    const menuDelay = config.netMenuDelay ?? 2500;
    const zonePrefix = getZonePrefix("SLI", zone);
    const queryCommand = `${zonePrefix}QSTN`;
    const directService = config.model && config.host ? findNetServiceByName(buildPhysicalAvrId(config.model, config.host), NSS_SERVICE_NAMES[code] ?? []) : undefined;

    await this.dependencies.raw(`${zonePrefix}2B`);
    await delay(menuDelay);
    if (directService) {
      await this.dependencies.raw(`NSV${directService.id.toUpperCase()}0`);
      await delay(menuDelay);
      await this.dependencies.raw(queryCommand);
      return;
    }

    await this.dependencies.raw("NTCTOP");
    await delay(menuDelay);
    await this.dependencies.raw(`NLSI${String(code.slice(-2)).padStart(5, "0")}`);
    await delay(menuDelay);
    await this.dependencies.raw(queryCommand);
  }

  private async sendNetworkServiceById(serviceId: string, zone: string): Promise<void> {
    const config = this.dependencies.getConfig();
    const menuDelay = config.netMenuDelay ?? 2500;
    const zonePrefix = getZonePrefix("SLI", zone);
    await this.dependencies.raw(`${zonePrefix}2B`);
    await delay(menuDelay);
    await this.dependencies.raw(`NSV${serviceId.toUpperCase()}0`);
    await delay(menuDelay);
    await this.dependencies.raw(`${zonePrefix}QSTN`);
  }
}
