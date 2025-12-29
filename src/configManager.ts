export const DEFAULT_QUEUE_THRESHOLD = 100;
import path from "path";
import fs from "fs";

// Use UC_CONFIG_HOME if available, otherwise fallback to process.cwd()
const CONFIG_DIR = process.env.UC_CONFIG_HOME || process.cwd();
const CONFIG_PATH = path.resolve(CONFIG_DIR, "config.json");

export interface AvrConfig {
  model: string;
  ip: string;
  port: number;
  zone: string; // 'main', 'zone2', 'zone3'
  queueThreshold?: number;
  albumArtURL?: string;
  volumeScale?: number; // 80 or 100
  useHalfDbSteps?: boolean; // true = use 0.5 dB steps (×2 / ÷2), false = direct EISCP value
  createSensors?: boolean; // true = create sensor entities for this AVR
}

export interface OnkyoConfig {
  avrs?: AvrConfig[];
  queueThreshold?: number;
  albumArtURL?: string;
  volumeScale?: number; // 80 or 100
  useHalfDbSteps?: boolean; // true = use 0.5 dB steps (×2 / ÷2), false = direct EISCP value
  createSensors?: boolean; // true = create sensor entities
  // Legacy fields for backward compatibility
  model?: string;
  ip?: string;
  port?: number;
  selectedAvr?: string;
}

export class ConfigManager {
  private static config: OnkyoConfig = {};

  static load(): OnkyoConfig {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
        this.config = JSON.parse(raw);

        // Migrate legacy config to new format
        if (this.config.model && this.config.ip && this.config.port && !this.config.avrs) {
          this.config.avrs = [
            {
              model: this.config.model,
              ip: this.config.ip,
              port: this.config.port,
              zone: "main", // Legacy configs default to main zone
              queueThreshold: this.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD,
              albumArtURL: this.config.albumArtURL ?? "album_art.cgi",
              volumeScale: 100, // Default for legacy configs
              useHalfDbSteps: true // Default for legacy configs (original behavior)
            }
          ];
        }

        // Migrate global settings to per-AVR settings if needed
        if (this.config.avrs && (this.config.queueThreshold || this.config.albumArtURL)) {
          this.config.avrs = this.config.avrs.map((avr) => ({
            ...avr,
            queueThreshold: avr.queueThreshold ?? this.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD,
            albumArtURL: avr.albumArtURL ?? this.config.albumArtURL ?? "album_art.cgi",
            volumeScale: avr.volumeScale ?? 100, // Default to 100 if not set
            useHalfDbSteps: avr.useHalfDbSteps ?? true // Default to true (original behavior)
          }));
          // Remove global settings after migration
          delete this.config.queueThreshold;
          delete this.config.albumArtURL;
          this.save(this.config);
        }

        // Ensure all AVRs have volumeScale set
        if (this.config.avrs) {
          this.config.avrs = this.config.avrs.map((avr) => ({
            ...avr,
            volumeScale: avr.volumeScale ?? 100, // Default to 100 for existing configs
            useHalfDbSteps: avr.useHalfDbSteps ?? true // Default to true (original behavior)
          }));
        }
      }
    } catch (err) {
      console.error("Failed to load config:", err);
      this.config = {};
    }
    return this.config;
  }

  static save(newConfig: Partial<OnkyoConfig>) {
    this.config = { ...this.config, ...newConfig };
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to save config:", err);
    }
  }

  static addAvr(avr: AvrConfig) {
    if (!this.config.avrs) {
      this.config.avrs = [];
    }
    // Check if AVR already exists (by IP and zone)
    const existingIndex = this.config.avrs.findIndex((a) => a.ip === avr.ip && a.zone === avr.zone);
    if (existingIndex >= 0) {
      // AVR already exists, don't update it to preserve per-AVR settings
      console.log(`ConfigManager: AVR at ${avr.ip} zone ${avr.zone} already exists, skipping update`);
      return;
    } else {
      // Add new AVR
      this.config.avrs.push(avr);
    }
    this.save(this.config);
  }

  static get(): OnkyoConfig {
    return this.config;
  }
}
