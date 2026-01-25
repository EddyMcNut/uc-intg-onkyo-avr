import path from "path";
import fs from "fs";
import log from "./loggers.js";

export const DEFAULT_QUEUE_THRESHOLD = 100;

// Config directory is configurable at runtime to support integration manager backups/restores
let CONFIG_DIR = process.env.UC_CONFIG_HOME || process.cwd();
let CONFIG_PATH = path.resolve(CONFIG_DIR, "config.json");

/**
 * Set the configuration directory explicitly (used by the driver when the
 * Integration API exposes the proper config dir). This ensures the
 * integration reads/writes the same files the Integration Manager will back up.
 */
export function setConfigDir(dir: string) {
  CONFIG_DIR = dir || process.env.UC_CONFIG_HOME || process.cwd();
  CONFIG_PATH = path.resolve(CONFIG_DIR, "config.json");
}

/**
 * Helper to get current config path (useful for testing/manager compatibility)
 */
export function getConfigPath(): string {
  return CONFIG_PATH;
}

/** Security: Maximum input lengths for validation */
export const MAX_LENGTHS = {
  MODEL_NAME: 50,
  IP_ADDRESS: 15,
  ALBUM_ART_URL: 250,
  PIN_CODE: 4,
  USER_COMMAND: 250,      // input-selector, listening-mode, etc.
  RAW_COMMAND: 20         // raw MVL20, etc.
} as const;

/** Security: Validation patterns */
export const PATTERNS = {
  IP_ADDRESS: /^(\d{1,3}\.){3}\d{1,3}$/,
  MODEL_NAME: /^[a-zA-Z0-9\-_ ]+$/,
  ALBUM_ART_URL: /^[a-zA-Z0-9._\-/]+$/,
  PIN_CODE: /^\d{4}$/,
  USER_COMMAND: /^[a-z0-9\-\s.:=]+$/i,  // Letters, numbers, hyphens, spaces, delimiters
  RAW_COMMAND: /^[A-Z0-9]+$/             // Uppercase letters and numbers only
} as const;

/** Valid zone identifiers */
export type AvrZone = "main" | "zone2" | "zone3";

/**
 * Construct an entity ID from model, host/ip, and zone.
 * Format: "MODEL IP ZONE" (e.g., "TX-RZ50 192.168.2.103 main")
 */
export function buildEntityId(model: string, host: string, zone: string): string {
  return `${model} ${host} ${zone}`;
}

/**
 * Construct a physical AVR identifier from model and host/ip.
 * Format: "MODEL IP" (e.g., "TX-RZ50 192.168.2.103")
 * Used to identify a physical AVR regardless of zone.
 */
export function buildPhysicalAvrId(model: string, host: string): string {
  return `${model} ${host}`;
}

/** Default values for AVR configuration */
export const AVR_DEFAULTS = {
  queueThreshold: DEFAULT_QUEUE_THRESHOLD,
  albumArtURL: "album_art.cgi",
  volumeScale: 100,
  adjustVolumeDispl: false,
  createSensors: true,
  netMenuDelay: 500,
  port: 60128
} as const;

export interface AvrConfig {
  model: string;
  ip: string;
  port: number;
  zone: AvrZone;
  queueThreshold?: number;
  albumArtURL?: string;
  volumeScale?: number; // 80 or 100
  adjustVolumeDispl?: boolean; // true = use 0.5 dB steps (×2 / ÷2), false = direct EISCP value
  createSensors?: boolean; // true = create sensor entities for this AVR
  netMenuDelay?: number; // delay in ms for NET menu to load (default 2500)
}

export interface OnkyoConfig {
  avrs?: AvrConfig[];
  queueThreshold?: number;
  albumArtURL?: string;
  volumeScale?: number; // 80 or 100
  adjustVolumeDispl?: boolean; // true = use 0.5 dB steps (×2 / ÷2), false = direct EISCP value
  createSensors?: boolean; // true = create sensor entities
  // Legacy fields for backward compatibility
  model?: string;
  ip?: string;
  port?: number;
  selectedAvr?: string;
}

export class ConfigManager {
  private static config: OnkyoConfig = {};

  /** Apply default values to an AVR config */
  private static applyDefaults(avr: Partial<AvrConfig>): AvrConfig {
    return {
      model: avr.model ?? "",
      ip: avr.ip ?? "",
      port: avr.port ?? 60128,
      zone: avr.zone ?? "main",
      queueThreshold: avr.queueThreshold ?? AVR_DEFAULTS.queueThreshold,
      albumArtURL: avr.albumArtURL ?? AVR_DEFAULTS.albumArtURL,
      volumeScale: avr.volumeScale ?? AVR_DEFAULTS.volumeScale,
      adjustVolumeDispl: avr.adjustVolumeDispl ?? AVR_DEFAULTS.adjustVolumeDispl,
      createSensors: avr.createSensors ?? AVR_DEFAULTS.createSensors,
      netMenuDelay: avr.netMenuDelay ?? AVR_DEFAULTS.netMenuDelay
    };
  }

  /** Validate zone string and return typed zone or default */
  private static validateZone(zone: string | undefined): AvrZone {
    if (zone === "main" || zone === "zone2" || zone === "zone3") {
      return zone;
    }
    return "main";
  }

  static load(): OnkyoConfig {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
        this.config = JSON.parse(raw);

        // Migrate legacy config to new format
        if (this.config.model && this.config.ip && this.config.port && !this.config.avrs) {
          this.config.avrs = [
            this.applyDefaults({
              model: this.config.model,
              ip: this.config.ip,
              port: this.config.port,
              zone: "main",
              queueThreshold: this.config.queueThreshold,
              albumArtURL: this.config.albumArtURL
            })
          ];
        }

        // Migrate global settings to per-AVR settings if needed
        if (this.config.avrs && (this.config.queueThreshold || this.config.albumArtURL)) {
          this.config.avrs = this.config.avrs.map((avr) =>
            this.applyDefaults({
              ...avr,
              zone: this.validateZone(avr.zone),
              queueThreshold: avr.queueThreshold ?? this.config.queueThreshold,
              albumArtURL: avr.albumArtURL ?? this.config.albumArtURL
            })
          );
          // Remove global settings after migration
          delete this.config.queueThreshold;
          delete this.config.albumArtURL;
          this.save(this.config);
        }

        // Ensure all AVRs have defaults applied
        if (this.config.avrs) {
          this.config.avrs = this.config.avrs.map((avr) =>
            this.applyDefaults({
              ...avr,
              zone: this.validateZone(avr.zone)
            })
          );
        }
      }
    } catch (err) {
      log.error("Failed to load config:", err);
      this.config = {};
    }
    return this.config;
  }

  static save(newConfig: Partial<OnkyoConfig>) {
    this.config = { ...this.config, ...newConfig };
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (err) {
      log.error("Failed to save config:", err);
    }
  }

  static addAvr(avr: Partial<AvrConfig>) {
    if (!this.config.avrs) {
      this.config.avrs = [];
    }

    const normalizedAvr = this.applyDefaults({
      ...avr,
      zone: this.validateZone(avr.zone)
    });

    // Check if AVR already exists (by IP and zone)
    const existingIndex = this.config.avrs.findIndex((a) => a.ip === normalizedAvr.ip && a.zone === normalizedAvr.zone);
    if (existingIndex >= 0) {
      // AVR already exists, update it with new settings from setup
      log.info(`ConfigManager: Updating existing AVR at ${normalizedAvr.ip} zone ${normalizedAvr.zone}`);
      this.config.avrs[existingIndex] = normalizedAvr;
      this.save(this.config);
      return;
    }

    // Add new AVR with defaults applied
    this.config.avrs.push(normalizedAvr);
    this.save(this.config);
  }

  static get(): OnkyoConfig {
    return this.config;
  }
}
