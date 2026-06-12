// Focused responsibility: Handle auto-discovery and configuration persistence
import EiscpDriver from "./eiscp.js";
import { ConfigManager, type AvrConfig, type AvrZone, AVR_DEFAULTS, parseSelectOptions, type LogLevel, type OnkyoConfig } from "./configManager.js";
import { setLogLevel } from "./loggers.js";
import { type ParsedManualConfig } from "./manualConfigParser.js";

export interface OnConfigSavedCallback {
  (): Promise<void>;
}

export class ConfigPersistenceManager {
  constructor(private onConfigSaved: OnConfigSavedCallback) {}

  async performAutoDiscovery(): Promise<{ success: boolean; model?: string; host?: string; port?: number }> {
    try {
      const e = new EiscpDriver();
      const hosts = await e.discover({ address: "255.255.255.255", timeout: 3, devices: 1 });
      if (!hosts || hosts.length === 0) {
        return { success: false };
      }
      const found = hosts[0];
      return {
        success: true,
        model: found.model,
        host: found.host,
        port: Number(found.port) || AVR_DEFAULTS.port
      };
    } catch (_err) {
      return { success: false };
    }
  }

  async saveDiscoveredAvr(
    discovered: { model: string; host: string; port: number },
    parsedConfig: ParsedManualConfig
  ): Promise<void> {
    const discoveredAvr: Partial<AvrConfig> = {
      model: discovered.model,
      ip: discovered.host,
      port: discovered.port,
      zone: "main",
      volumeDisplay: parsedConfig.volumeDisplayValue,
      entityNameStyle: parsedConfig.entityNameStyleValue,
      tuneinMenuStyle: parsedConfig.tuneinMenuStyleValue
    };

    // Use parseSelectOptions which handles the 'none' sentinel (-> null = don't create entity)
    const lmoResult = parseSelectOptions(parsedConfig.listeningModeOptions);
    if (lmoResult === null || (Array.isArray(lmoResult) && lmoResult.length > 0)) {
      discoveredAvr.listeningModeOptions = lmoResult;
    }
    const isoResult = parseSelectOptions(parsedConfig.inputSelectorOptions);
    if (isoResult === null || (Array.isArray(isoResult) && isoResult.length > 0)) {
      discoveredAvr.inputSelectorOptions = isoResult;
    }

    ConfigManager.addAvr(discoveredAvr);
    ConfigManager.save({ logLevel: parsedConfig.logLevelValue });
    setLogLevel(parsedConfig.logLevelValue);
    await this.onConfigSaved();
  }

  async saveManualConfiguration(parsedConfig: ParsedManualConfig): Promise<{ errors: string[]; success: boolean }> {
    const basePayload = {
      model: parsedConfig.modelName,
      ip: parsedConfig.ipVal,
      port: parsedConfig.portNum,
      queueThreshold: parsedConfig.queueThresholdValue,
      albumArtURL: parsedConfig.albumArtURLValue,
      listeningModeOptions: parsedConfig.listeningModeOptions,
      inputSelectorOptions: parsedConfig.inputSelectorOptions,
      volumeScale: parsedConfig.volumeScaleValue,
      volumeDisplay: parsedConfig.volumeDisplayValue,
      adjustVolumeDispl: parsedConfig.adjustVolumeDisplValue,
      entityNameStyle: parsedConfig.entityNameStyleValue,
      createSensors: parsedConfig.createSensorsValue,
      netMenuDelay: parsedConfig.netMenuDelayValue,
      tuneinPresetPosition: parsedConfig.tuneinPresetPositionValue,
      tuneinMenuStyle: parsedConfig.tuneinMenuStyleValue
    };

    const zones: AvrZone[] = ["main"];
    if (parsedConfig.zoneCountValue >= 2) zones.push("zone2");
    if (parsedConfig.zoneCountValue >= 3) zones.push("zone3");
    if (parsedConfig.zoneCountValue >= 4) zones.push("zone4");

    const errors: string[] = [];
    const normalizedAvrs: AvrConfig[] = [];

    for (const zone of zones) {
      const res = ConfigManager.validateAvrPayload({ ...basePayload, zone });
      if (res.errors.length > 0) {
        errors.push(`zone ${zone}: ${res.errors.join("; ")}`);
      } else if (res.normalized) {
        normalizedAvrs.push(res.normalized);
      }
    }

    if (errors.length > 0) {
      return { errors, success: false };
    }

    for (const avrCfg of normalizedAvrs) {
      ConfigManager.addAvr(avrCfg);
    }

    ConfigManager.save({ logLevel: parsedConfig.logLevelValue });
    setLogLevel(parsedConfig.logLevelValue);
    await this.onConfigSaved();
    return { errors: [], success: true };
  }

  async restoreConfiguration(normalizedConfig: Partial<OnkyoConfig>): Promise<void> {
    ConfigManager.save(normalizedConfig);
    await this.onConfigSaved();
  }

  async deleteConfiguration(): Promise<void> {
    // Trigger the callback which is expected to clear config
    await this.onConfigSaved();
  }
}
