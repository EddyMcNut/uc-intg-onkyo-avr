// Focused responsibility: Parse and validate manual configuration input
import { LogLevel, AVR_DEFAULTS, parseBoolean, parseVolumeScale, type VolumeScale } from "./configManager.js";
import type { AvrInput } from "./inputSourceStore.js";
import {
  parseAlbumArtUrl,
  parseEntityNameStyle,
  parseInputSourceLayout,
  parseIntegerSetting,
  parseNetworkInputMarker,
  parseNetworkNavigationMode,
  parseTunerPresetMode,
  parseTuneInMenuStyle,
  parseVolumeDisplay,
  type InputSourceLayout,
  type InputSourceSettings,
  type NetworkInputMarker,
  type NetworkNavigationMode,
  type TunerPresetMode,
  type TuneInMenuStyle
} from "./configConstants.js";

export interface ManualConfigInput {
  model?: unknown;
  ipAddress?: unknown;
  port?: unknown;
  queueThreshold?: unknown;
  albumArtURL?: unknown;
  listeningModePreferences?: unknown;
  listeningModeNames?: unknown;
  volumeScale?: unknown;
  volumeScaleDiscovered?: unknown;
  useAvrReportedInputs?: unknown;
  idInputSources?: unknown;
  inputSources?: unknown;
  inputSourceDiscoveryAvailable?: unknown;
  volumeDisplay?: unknown;
  adjustVolumeDispl?: unknown;
  zoneCount?: unknown;
  createSensors?: unknown;
  createTunerPresets?: unknown;
  createRemoteEntity?: unknown;
  createDiracSelectEntity?: unknown;
  netMenuDelay?: unknown;
  tuneinPresetPosition?: unknown;
  tuneinMenuStyle?: unknown;
  inputSourceLayout?: unknown;
  networkInputMarker?: unknown;
  networkNavigationMode?: unknown;
  entityNameStyle?: unknown;
  logLevel?: unknown;
}

export interface ParsedManualConfig {
  modelName: string;
  ipVal: string;
  portNum: number;
  queueThresholdValue: number;
  albumArtURLValue: string;
  listeningModePreferences: Record<string, string>;
  listeningModeNames: Record<string, string>;
  volumeScaleValue: VolumeScale;
  volumeScaleDiscoveredValue: boolean;
  useAvrReportedInputsValue: boolean;
  idInputSources: InputSourceSettings;
  inputSources: AvrInput[];
  inputSourceDiscoveryAvailable: boolean;
  volumeDisplayValue: "absolute" | "relative";
  adjustVolumeDisplValue: boolean;
  entityNameStyleValue: "long" | "short";
  zoneCountValue: number;
  createSensorsValue: boolean;
  createTunerPresetsValue: TunerPresetMode;
  createRemoteEntityValue: boolean;
  createDiracSelectEntityValue: boolean;
  netMenuDelayValue: number;
  tuneinPresetPositionValue: number;
  tuneinMenuStyleValue: TuneInMenuStyle;
  inputSourceLayoutValue: InputSourceLayout;
  networkInputMarkerValue: NetworkInputMarker;
  networkNavigationModeValue: NetworkNavigationMode;
  logLevelValue: LogLevel;
  errorMessage?: string;
}

export class ManualConfigParser {
  parse(input: ManualConfigInput, fallbackLogLevel: LogLevel = "warn"): ParsedManualConfig {
    const useAvrReportedInputsValue = parseBoolean(input.useAvrReportedInputs, AVR_DEFAULTS.useAvrReportedInputs);
    return {
      modelName: (input.model ?? "").toString().trim(),
      ipVal: (input.ipAddress ?? "").toString().trim(),
      portNum: this.parsePort(input.port),
      queueThresholdValue: this.parseQueueThreshold(input.queueThreshold),
      albumArtURLValue: this.parseAlbumArtUrl(input.albumArtURL),
      listeningModePreferences: this.parseListeningModePreferences(input),
      listeningModeNames: this.parseListeningModeNames(input),
      volumeScaleValue: this.parseVolumeScale(input.volumeScale),
      volumeScaleDiscoveredValue: parseBoolean(input.volumeScaleDiscovered, false),
      useAvrReportedInputsValue,
      idInputSources: this.parseInputSourceSettings(input),
      inputSources: Array.isArray(input.inputSources) ? (input.inputSources as AvrInput[]) : [],
      inputSourceDiscoveryAvailable: Boolean(input.inputSourceDiscoveryAvailable),
      volumeDisplayValue: this.parseVolumeDisplay(input.volumeDisplay),
      adjustVolumeDisplValue: parseBoolean(input.adjustVolumeDispl, AVR_DEFAULTS.adjustVolumeDispl),
      entityNameStyleValue: this.parseEntityNameStyle(input.entityNameStyle),
      createSensorsValue: parseBoolean(input.createSensors, AVR_DEFAULTS.createSensors),
      createTunerPresetsValue: parseTunerPresetMode(input.createTunerPresets ?? AVR_DEFAULTS.createTunerPresets),
      createRemoteEntityValue: parseBoolean(input.createRemoteEntity, AVR_DEFAULTS.createRemoteEntity),
      createDiracSelectEntityValue: parseBoolean(input.createDiracSelectEntity, AVR_DEFAULTS.createDiracSelectEntity),
      netMenuDelayValue: this.parseNetMenuDelay(input.netMenuDelay),
      tuneinPresetPositionValue: this.parseTuneInPresetPosition(input.tuneinPresetPosition),
      tuneinMenuStyleValue: this.parseTuneInMenuStyle(input.tuneinMenuStyle),
      inputSourceLayoutValue: this.parseInputSourceLayout(input.inputSourceLayout),
      networkInputMarkerValue: this.parseNetworkInputMarker(input.networkInputMarker),
      networkNavigationModeValue: this.parseNetworkNavigationMode(input.networkNavigationMode),
      logLevelValue: this.parseLogLevel(input.logLevel, fallbackLogLevel),
      zoneCountValue: this.parseZoneCount(input.zoneCount)
    };
  }

  private parseInputSourceLayout(raw: unknown): InputSourceLayout {
    return parseInputSourceLayout(raw);
  }

  private parseListeningModePreferences(input: ManualConfigInput): Record<string, string> {
    const preferences: Record<string, string> = {};
    if (input.listeningModePreferences && typeof input.listeningModePreferences === "object" && !Array.isArray(input.listeningModePreferences)) {
      Object.assign(preferences, input.listeningModePreferences);
    }
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (key.startsWith("lmd_") && value !== undefined) {
        preferences[key.substring(4).toUpperCase()] = String(value);
      }
    }
    return preferences;
  }

  private parseListeningModeNames(input: ManualConfigInput): Record<string, string> {
    const names = input.listeningModeNames;
    return names && typeof names === "object" && !Array.isArray(names) ? { ...(names as Record<string, string>) } : {};
  }

  private parseInputSourceSettings(input: ManualConfigInput): InputSourceSettings {
    const settings: InputSourceSettings = {};
    if (input.idInputSources && typeof input.idInputSources === "object" && !Array.isArray(input.idInputSources)) {
      Object.assign(settings, input.idInputSources);
    }
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (key.startsWith("ids_") && value !== undefined) {
        const id = key.substring(4).toUpperCase();
        const existing = settings[id];
        settings[id] = { name: existing?.name ?? "", setting: String(value) };
      }
    }
    return settings;
  }

  // Numbers are only converted here (not a number -> default). Range checks are left to
  // validateAvrPayload (configValidation.ts), so an out-of-range value is reported to the user instead of silently replaced.
  private parsePort(port: unknown): number {
    return parseIntegerSetting(port, AVR_DEFAULTS.port);
  }

  private parseQueueThreshold(threshold: unknown): number {
    return parseIntegerSetting(threshold, AVR_DEFAULTS.queueThreshold);
  }

  private parseAlbumArtUrl(url: unknown): string {
    return parseAlbumArtUrl(url);
  }

  private parseVolumeScale(scale: unknown): VolumeScale {
    return parseVolumeScale(scale);
  }

  private parseVolumeDisplay(display: unknown): "absolute" | "relative" {
    return parseVolumeDisplay(display);
  }

  private parseEntityNameStyle(style: unknown): "long" | "short" {
    return parseEntityNameStyle(style);
  }

  private parseNetMenuDelay(delay: unknown): number {
    return parseIntegerSetting(delay, AVR_DEFAULTS.netMenuDelay);
  }

  private parseTuneInPresetPosition(position: unknown): number {
    return parseIntegerSetting(position, AVR_DEFAULTS.tuneinPresetPosition);
  }

  private parseTuneInMenuStyle(style: unknown): TuneInMenuStyle {
    return parseTuneInMenuStyle(style ?? AVR_DEFAULTS.tuneinMenuStyle);
  }

  private parseNetworkInputMarker(marker: unknown): NetworkInputMarker {
    return parseNetworkInputMarker(marker);
  }

  private parseNetworkNavigationMode(mode: unknown): NetworkNavigationMode {
    return parseNetworkNavigationMode(mode);
  }

  private parseLogLevel(level: unknown, fallback: LogLevel): LogLevel {
    const levelStr = String(level ?? "").toLowerCase();
    return ["debug", "info", "warn", "error"].includes(levelStr) ? (levelStr as LogLevel) : fallback;
  }

  private parseZoneCount(count: unknown): number {
    const parsed = parseInt(String(count), 10);
    if (isNaN(parsed)) return 1;
    return parsed >= 1 && parsed <= 4 ? parsed : 1;
  }
}
