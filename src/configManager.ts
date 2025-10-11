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
  queueThreshold?: number;
  albumArtURL?: string;
}

export interface OnkyoConfig {
  avrs?: AvrConfig[];
  queueThreshold?: number;
  albumArtURL?: string;
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
              queueThreshold: this.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD,
              albumArtURL: this.config.albumArtURL ?? "album_art.cgi"
            }
          ];
        }

        // Migrate global settings to per-AVR settings if needed
        if (this.config.avrs && (this.config.queueThreshold || this.config.albumArtURL)) {
          this.config.avrs = this.config.avrs.map((avr) => ({
            ...avr,
            queueThreshold: avr.queueThreshold ?? this.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD,
            albumArtURL: avr.albumArtURL ?? this.config.albumArtURL ?? "album_art.cgi"
          }));
          // Remove global settings after migration
          delete this.config.queueThreshold;
          delete this.config.albumArtURL;
          this.save(this.config);
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
    // Check if AVR already exists (by IP)
    const existingIndex = this.config.avrs.findIndex((a) => a.ip === avr.ip);
    if (existingIndex >= 0) {
      // Update existing AVR
      this.config.avrs[existingIndex] = avr;
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
