// Focused responsibility: Handle auto-discovery and configuration persistence
import EiscpDriver from "./eiscp.js";
import { ConfigManager, type AvrConfig, type AvrZone, AVR_DEFAULTS, type IntegrationConfig } from "./configManager.js";
import { getKnownListeningModes } from "./listeningModePreferences.js";
import { setLogLevel } from "./loggers.js";
import { type ParsedManualConfig } from "./manualConfigParser.js";
import { getInputSourceAliases, EXCLUDE_INPUT_SOURCE, LEARN_INPUT_SOURCE, LEARNED_INPUT_SOURCE, getKnownInputSources } from "./inputSourcePreferences.js";
import type { InputSourceSettings } from "./configConstants.js";

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

  async saveDiscoveredAvr(discovered: { model: string; host: string; port: number }, parsedConfig: ParsedManualConfig): Promise<void> {
    const listeningModePreferences = parsedConfig.listeningModePreferences ?? {};
    const discoveredAvr: Partial<AvrConfig> = {
      model: discovered.model,
      ip: discovered.host,
      port: discovered.port,
      zone: "main",
      volumeDisplay: parsedConfig.volumeDisplayValue,
      entityNameStyle: parsedConfig.entityNameStyleValue,
      createRemoteEntity: parsedConfig.createRemoteEntityValue,
      createTunerPresets: parsedConfig.createTunerPresetsValue,
      createDiracSelectEntity: parsedConfig.createDiracSelectEntityValue,
      tuneinMenuStyle: parsedConfig.tuneinMenuStyleValue,
      useAvrReportedInputs: parsedConfig.useAvrReportedInputsValue,
      idInputSources: this.buildInputSources(parsedConfig, undefined, discovered.host)
    };

    // Use parseSelectOptions which handles the 'none' sentinel (-> null = don't create entity) and 'all'/empty (-> "all" = show all)
    discoveredAvr.listeningModes = this.buildListeningModes(listeningModePreferences, parsedConfig.listeningModeNames);

    ConfigManager.addAvr(discoveredAvr);
    ConfigManager.save({ logLevel: parsedConfig.logLevelValue });
    setLogLevel(parsedConfig.logLevelValue);
    await this.onConfigSaved();
  }

  async saveManualConfiguration(parsedConfig: ParsedManualConfig): Promise<{ errors: string[]; success: boolean }> {
    const listeningModePreferences = parsedConfig.listeningModePreferences ?? {};
    const basePayload = {
      model: parsedConfig.modelName,
      ip: parsedConfig.ipVal,
      port: parsedConfig.portNum,
      queueThreshold: parsedConfig.queueThresholdValue,
      albumArtURL: parsedConfig.albumArtURLValue,
      listeningModes: this.buildListeningModes(listeningModePreferences, parsedConfig.listeningModeNames, parsedConfig.modelName, parsedConfig.ipVal),
      volumeScale: parsedConfig.volumeScaleValue,
      useAvrReportedInputs: parsedConfig.useAvrReportedInputsValue,
      idInputSources: this.buildInputSources(parsedConfig, parsedConfig.modelName, parsedConfig.ipVal),
      volumeDisplay: parsedConfig.volumeDisplayValue,
      adjustVolumeDispl: parsedConfig.adjustVolumeDisplValue,
      entityNameStyle: parsedConfig.entityNameStyleValue,
      createSensors: parsedConfig.createSensorsValue,
      createTunerPresets: parsedConfig.createTunerPresetsValue,
      createRemoteEntity: parsedConfig.createRemoteEntityValue,
      createDiracSelectEntity: parsedConfig.createDiracSelectEntityValue,
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
      } else {
        normalizedAvrs.push(res.normalized!);
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

  private buildListeningModes(preferences: Record<string, string>, names: Record<string, string>, model?: string, ip?: string): Record<string, { name: string; setting: string }> {
    const existing = ConfigManager.get().avrs?.find((avr) => avr.model === model && avr.ip === ip)?.listeningModes ?? {};
    const rebuilt = Object.fromEntries(
      getKnownListeningModes().map((mode) => [
        mode.code,
        {
          // Keep the AVR-learned name when the user selects "learn" again. The
          // setting controls whether the learned value is used; replacing its
          // name here would erase the learned mode during setup reconfiguration.
          name: names[mode.code] ?? existing[mode.code]?.name ?? mode.aliases[0],
          setting: preferences[mode.code] ?? existing[mode.code]?.setting ?? "learn"
        }
      ])
    );
    for (const [code, entry] of Object.entries(existing)) {
      if (!rebuilt[code]) rebuilt[code] = entry;
    }
    return rebuilt;
  }

  private buildInputSources(parsed: ParsedManualConfig, model?: string, ip?: string): InputSourceSettings {
    const existing = ConfigManager.get().avrs?.find((avr) => avr.model === model && avr.ip === ip)?.idInputSources ?? {};
    const reported = new Map((parsed.inputSources ?? []).map((input) => [input.id.toUpperCase(), input.name]));
    const ids = new Set([...getKnownInputSources().map((source) => source.id), ...Object.keys(parsed.idInputSources ?? {}), ...reported.keys()]);
    const result: InputSourceSettings = {};
    for (const id of ids) {
      const aliases = getInputSourceAliases(id);
      const name = reported.get(id) ?? existing[id]?.name ?? aliases[0];
      if (!name) continue;
      const selected =
        parsed.idInputSources?.[id]?.setting ??
        existing[id]?.setting ??
        // A discovered AVR name is the default choice for sources the AVR actually
        // reported. Sources known to the integration but absent from that report
        // must remain excluded; otherwise saving setup adds legacy names back into
        // the selector alongside the learned AVR names.
        (parsed.inputSourceDiscoveryAvailable && (parsed.inputSources?.length ?? 0) > 0 ? (reported.has(id) ? LEARNED_INPUT_SOURCE : EXCLUDE_INPUT_SOURCE) : (aliases[0] ?? EXCLUDE_INPUT_SOURCE));
      result[id] = { name, setting: selected || LEARNED_INPUT_SOURCE };
    }
    return result;
  }

  async restoreConfiguration(normalizedConfig: Partial<IntegrationConfig>): Promise<void> {
    ConfigManager.save(normalizedConfig);
    await this.onConfigSaved();
  }

  async deleteConfiguration(): Promise<void> {
    // Trigger the callback which is expected to clear config
    await this.onConfigSaved();
  }
}
