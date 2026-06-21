// Focused responsibility: Parse and validate manual configuration input
import { LogLevel, AVR_DEFAULTS, parseBoolean } from "./configManager.js";

export interface ManualConfigInput {
  model?: unknown;
  ipAddress?: unknown;
  port?: unknown;
  queueThreshold?: unknown;
  albumArtURL?: unknown;
  listeningModeOptions?: unknown;
  inputSelectorOptions?: unknown;
  volumeScale?: unknown;
  volumeDisplay?: unknown;
  adjustVolumeDispl?: unknown;
  zoneCount?: unknown;
  createSensors?: unknown;
  netMenuDelay?: unknown;
  tuneinPresetPosition?: unknown;
  tuneinMenuStyle?: unknown;
  entityNameStyle?: unknown;
  logLevel?: unknown;
}

export interface ParsedManualConfig {
  modelName: string;
  ipVal: string;
  portNum: number;
  queueThresholdValue: number;
  albumArtURLValue: string;
  listeningModeOptions: string;
  inputSelectorOptions: string;
  volumeScaleValue: number;
  volumeDisplayValue: "absolute" | "relative";
  adjustVolumeDisplValue: boolean;
  entityNameStyleValue: "long" | "short";
  zoneCountValue: number;
  createSensorsValue: boolean;
  netMenuDelayValue: number;
  tuneinPresetPositionValue: number;
  tuneinMenuStyleValue: "mypresets" | "full";
  logLevelValue: LogLevel;
  errorMessage?: string;
}

export class ManualConfigParser {
  parse(input: ManualConfigInput, fallbackLogLevel: LogLevel = "warn"): ParsedManualConfig {
    return {
      modelName: (input.model ?? "").toString().trim(),
      ipVal: (input.ipAddress ?? "").toString().trim(),
      portNum: this.parsePort(input.port),
      queueThresholdValue: this.parseQueueThreshold(input.queueThreshold),
      albumArtURLValue: this.parseAlbumArtUrl(input.albumArtURL),
      listeningModeOptions: String(input.listeningModeOptions ?? ""),
      inputSelectorOptions: String(input.inputSelectorOptions ?? ""),
      volumeScaleValue: this.parseVolumeScale(input.volumeScale),
      volumeDisplayValue: this.parseVolumeDisplay(input.volumeDisplay),
      adjustVolumeDisplValue: parseBoolean(input.adjustVolumeDispl, true),
      entityNameStyleValue: this.parseEntityNameStyle(input.entityNameStyle),
      createSensorsValue: parseBoolean(input.createSensors, AVR_DEFAULTS.createSensors),
      netMenuDelayValue: this.parseNetMenuDelay(input.netMenuDelay),
      tuneinPresetPositionValue: this.parseTuneInPresetPosition(input.tuneinPresetPosition),
      tuneinMenuStyleValue: this.parseTuneInMenuStyle(input.tuneinMenuStyle),
      logLevelValue: this.parseLogLevel(input.logLevel, fallbackLogLevel),
      zoneCountValue: this.parseZoneCount(input.zoneCount)
    };
  }

  private parsePort(port: unknown): number {
    const p = parseInt((port ?? "").toString(), 10);
    return isNaN(p) ? AVR_DEFAULTS.port : p;
  }

  private parseQueueThreshold(threshold: unknown): number {
    if (threshold === undefined || threshold === null || threshold === "") return AVR_DEFAULTS.queueThreshold;
    const parsed = parseInt(String(threshold), 10);
    return isNaN(parsed) ? AVR_DEFAULTS.queueThreshold : parsed;
  }

  private parseAlbumArtUrl(url: unknown): string {
    return typeof url === "string" && url.trim() !== "" ? url.trim() : AVR_DEFAULTS.albumArtURL;
  }

  private parseVolumeScale(scale: unknown): number {
    const parsed = parseInt(String(scale), 10);
    if (isNaN(parsed)) return AVR_DEFAULTS.volumeScale;
    return [80, 100].includes(parsed) ? parsed : AVR_DEFAULTS.volumeScale;
  }

  private parseVolumeDisplay(display: unknown): "absolute" | "relative" {
    return String(display ?? AVR_DEFAULTS.volumeDisplay).toLowerCase() === "relative" ? "relative" : "absolute";
  }

  private parseEntityNameStyle(style: unknown): "long" | "short" {
    return String(style ?? AVR_DEFAULTS.entityNameStyle).toLowerCase() === "short" ? "short" : "long";
  }

  private parseNetMenuDelay(delay: unknown): number {
    const parsed = parseInt(String(delay), 10);
    return isNaN(parsed) ? AVR_DEFAULTS.netMenuDelay : parsed;
  }

  private parseTuneInPresetPosition(position: unknown): number {
    const parsed = parseInt(String(position), 10);
    if (isNaN(parsed)) return AVR_DEFAULTS.tuneinPresetPosition;
    return parsed >= 1 && parsed <= 9 ? parsed : AVR_DEFAULTS.tuneinPresetPosition;
  }

  private parseTuneInMenuStyle(style: unknown): "mypresets" | "full" {
    return String(style ?? AVR_DEFAULTS.tuneinMenuStyle).toLowerCase() === "full" ? "full" : "mypresets";
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
