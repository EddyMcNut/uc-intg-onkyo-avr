import path from "path";
import fs from "fs";
import log from "./loggers.js";

const integrationName = "configManager:";

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
  USER_COMMAND: 250, // input-selector, listening-mode, etc.
  RAW_COMMAND: 20 // raw MVL20, etc.
} as const;

/** Security: Validation patterns */
export const PATTERNS = {
  IP_ADDRESS: /^(\d{1,3}\.){3}\d{1,3}$/,
  MODEL_NAME: /^[a-zA-Z0-9\-_ ]+$/,
  ALBUM_ART_URL: /^[a-zA-Z0-9._\-/]+$/,
  PIN_CODE: /^\d{4}$/,
  USER_COMMAND: /^[a-z0-9\-\s.:=]+$/i, // Letters, numbers, hyphens, spaces, delimiters
  RAW_COMMAND: /^[A-Z0-9]+$/ // Uppercase letters and numbers only
} as const;

/**
 * Parse a select-entity options field from user input.
 * - Returns `null` when the user typed 'none' (signal: don't create the entity).
 * - Returns an empty array when the input is blank / undefined (use driver defaults).
 * - Returns the trimmed, non-empty items otherwise.
 */
export function parseSelectOptions(raw: unknown): string[] | null {
  if (raw === null) return null;
  if (raw === undefined || raw === "") return [];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.toLowerCase() === "none") return null;
    return trimmed
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s !== "");
  }
  if (Array.isArray(raw)) {
    const arr = (raw as unknown[]).map((s) => String(s).trim()).filter(Boolean);
    if (arr.length === 1 && arr[0].toLowerCase() === "none") return null;
    return arr;
  }
  return [];
}

/** Parse a boolean-like value from string/boolean/undefined */
export function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return defaultValue;
}

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
  adjustVolumeDispl: true,
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
  /**
   * Optional user-configured listening mode options.
   * - `undefined` / `[]`: show all/dynamic options.
   * - Non-empty array: show exactly these options.
   * - `null`: do not create the Listening Mode select entity.
   */
  listeningModeOptions?: string[] | null;
  /**
   * Optional user-configured input selector options.
   * - `undefined` / `[]`: show all available inputs.
   * - Non-empty array: show exactly these options.
   * - `null`: do not create the Input Selector select entity.
   */
  inputSelectorOptions?: string[] | null;
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
      netMenuDelay: avr.netMenuDelay ?? AVR_DEFAULTS.netMenuDelay,
      listeningModeOptions: avr.listeningModeOptions,
      inputSelectorOptions: avr.inputSelectorOptions
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
      log.error(`${integrationName} Failed to load config:`, err);
      this.config = {};
    }
    return this.config;
  }

  static save(newConfig: Partial<OnkyoConfig>) {
    this.config = { ...this.config, ...newConfig };
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (err) {
      log.error(`${integrationName} Failed to save config:`, err);
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
      log.info(`${integrationName} Updating existing AVR at ${normalizedAvr.ip} zone ${normalizedAvr.zone}`);
      this.config.avrs[existingIndex] = normalizedAvr;
      this.save(this.config);
      return;
    }

    // Add new AVR with defaults applied
    this.config.avrs.push(normalizedAvr);
    this.save(this.config);
  }

  /** Clear all configuration and persist empty config */
  static clear(): void {
    this.config = {} as OnkyoConfig;
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), "utf-8");
      log.info(`${integrationName} Cleared configuration and persisted empty config file`);
    } catch (err) {
      log.error(`${integrationName} Failed to clear config:`, err);
    }
  }

  static get(): OnkyoConfig {
    return this.config;
  }

  /**
   * Validate a single AVR object from a restored payload.
   * Returns an object with errors (if any) and a normalized AvrConfig when valid.
   */
  static validateAvrPayload(avr: any): { errors: string[]; normalized?: AvrConfig } {
    const errors: string[] = [];

    if (!avr || typeof avr !== "object") {
      errors.push("AVR entry must be an object");
      return { errors };
    }

    // model
    if (!avr.model || typeof avr.model !== "string" || avr.model.trim() === "") {
      errors.push("model is required and must be a non-empty string");
    } else if (avr.model.length > MAX_LENGTHS.MODEL_NAME) {
      errors.push(`model too long (max ${MAX_LENGTHS.MODEL_NAME})`);
    } else if (!PATTERNS.MODEL_NAME.test(avr.model)) {
      errors.push("model contains invalid characters");
    }

    // ip
    if (!avr.ip || typeof avr.ip !== "string" || avr.ip.trim() === "") {
      errors.push("ip is required and must be a non-empty string");
    } else {
      const trimmed = avr.ip.trim();
      if (trimmed.length > MAX_LENGTHS.IP_ADDRESS) {
        errors.push(`ip address too long (max ${MAX_LENGTHS.IP_ADDRESS})`);
      } else if (!PATTERNS.IP_ADDRESS.test(trimmed)) {
        errors.push("ip address has invalid format");
      } else {
        const octets = trimmed.split(".").map(Number);
        if (!octets.every((o: number) => o >= 0 && o <= 255)) {
          errors.push("ip address octets out of range");
        }
      }
    }

    // port
    const portNum = typeof avr.port === "number" ? avr.port : parseInt(String(avr.port ?? ""), 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      errors.push("port must be a valid number between 1 and 65535");
    }

    // zone
    const zone = avr.zone ?? "main";
    if (!["main", "zone2", "zone3"].includes(zone)) {
      errors.push('zone must be one of "main", "zone2", "zone3"');
    }

    // albumArtURL
    if (avr.albumArtURL && typeof avr.albumArtURL === "string") {
      if (avr.albumArtURL.length > MAX_LENGTHS.ALBUM_ART_URL) {
        errors.push(`albumArtURL too long (max ${MAX_LENGTHS.ALBUM_ART_URL})`);
      } else if (!PATTERNS.ALBUM_ART_URL.test(avr.albumArtURL)) {
        errors.push("albumArtURL contains invalid characters");
      }
    }

    // queueThreshold
    if (avr.queueThreshold !== undefined) {
      const qt = typeof avr.queueThreshold === "number" ? avr.queueThreshold : parseInt(String(avr.queueThreshold), 10);
      if (isNaN(qt) || qt < 0) {
        errors.push("queueThreshold must be a non-negative integer");
      }
    }

    // volumeScale
    if (avr.volumeScale !== undefined) {
      const vs = typeof avr.volumeScale === "number" ? avr.volumeScale : parseInt(String(avr.volumeScale), 10);
      if (![80, 100].includes(vs)) {
        errors.push("volumeScale must be 80 or 100");
      }
    }

    // adjustVolumeDispl
    if (avr.adjustVolumeDispl !== undefined && typeof avr.adjustVolumeDispl !== "boolean" && !(typeof avr.adjustVolumeDispl === "string")) {
      errors.push("adjustVolumeDispl must be boolean");
    }

    // createSensors
    if (avr.createSensors !== undefined && typeof avr.createSensors !== "boolean" && !(typeof avr.createSensors === "string")) {
      errors.push("createSensors must be boolean");
    }

    // netMenuDelay
    if (avr.netMenuDelay !== undefined) {
      const nm = typeof avr.netMenuDelay === "number" ? avr.netMenuDelay : parseInt(String(avr.netMenuDelay), 10);
      if (isNaN(nm) || nm < 0) {
        errors.push("netMenuDelay must be a non-negative integer");
      }
    }

    // Validate a select-options field (listeningModeOptions / inputSelectorOptions)
    const validateSelectOptions = (raw: unknown, fieldName: string): string[] | null | undefined => {
      if (raw === undefined) return undefined;
      const parsed = parseSelectOptions(raw);
      if (parsed === null) return null; // 'none' sentinel: don't create entity
      if (typeof raw !== "string" && !Array.isArray(raw) && raw !== null) {
        errors.push(`${fieldName} must be an array of strings or a semicolon-separated string`);
        return undefined;
      }
      for (const opt of parsed) {
        if (opt.length > MAX_LENGTHS.USER_COMMAND) {
          errors.push(`${fieldName} entry too long (max ${MAX_LENGTHS.USER_COMMAND}): ${opt}`);
          return undefined;
        }
        if (!PATTERNS.USER_COMMAND.test(opt)) {
          errors.push(`${fieldName} contains invalid characters: ${opt}`);
          return undefined;
        }
      }
      return parsed;
    };

    const lmoParsed = validateSelectOptions(avr.listeningModeOptions, "listeningModeOptions");
    const isoParsed = validateSelectOptions(avr.inputSelectorOptions, "inputSelectorOptions");

    if (errors.length > 0) {
      return { errors };
    }

    // Build normalized AVR with defaults
    const normalized: AvrConfig = this.applyDefaults({
      model: String(avr.model).trim(),
      ip: String(avr.ip).trim(),
      port: portNum,
      zone: this.validateZone(zone),
      queueThreshold: avr.queueThreshold,
      albumArtURL: avr.albumArtURL,
      volumeScale: typeof avr.volumeScale === "string" ? parseInt(avr.volumeScale, 10) : avr.volumeScale,
      adjustVolumeDispl: parseBoolean(avr.adjustVolumeDispl, AVR_DEFAULTS.adjustVolumeDispl),
      createSensors: parseBoolean(avr.createSensors, AVR_DEFAULTS.createSensors),
      netMenuDelay: typeof avr.netMenuDelay === "string" ? parseInt(avr.netMenuDelay, 10) : avr.netMenuDelay,
      listeningModeOptions: lmoParsed,
      inputSelectorOptions: isoParsed
    });

    return { errors: [], normalized };
  }

  /**
   * Validate an entire restored config payload. Returns errors if any and a normalized OnkyoConfig when valid.
   */
  static validateConfigPayload(payload: any): { errors: string[]; normalized?: OnkyoConfig } {
    const errors: string[] = [];
    if (!payload || typeof payload !== "object") {
      errors.push("Payload must be an object");
      return { errors };
    }

    // Allow either full payload {config: {...}} or bare config
    const cfg = payload.config ?? payload;

    if (!cfg) {
      errors.push("No config object found in payload");
      return { errors };
    }

    const normalizedConfig: OnkyoConfig = {};

    if (Array.isArray(cfg.avrs)) {
      const normalizedAvrs: AvrConfig[] = [];
      for (let i = 0; i < cfg.avrs.length; i++) {
        const avr = cfg.avrs[i];
        const res = this.validateAvrPayload(avr);
        if (res.errors.length > 0) {
          errors.push(`avrs[${i}]: ${res.errors.join("; ")}`);
        } else if (res.normalized) {
          normalizedAvrs.push(res.normalized);
        }
      }

      if (errors.length > 0) {
        return { errors };
      }

      normalizedConfig.avrs = normalizedAvrs;
    } else if (cfg.model && cfg.ip) {
      // Legacy single-model payload
      const res = this.validateAvrPayload({ model: cfg.model, ip: cfg.ip, port: cfg.port ?? AVR_DEFAULTS.port, zone: cfg.zone ?? "main" });
      if (res.errors.length > 0) {
        errors.push(...res.errors.map((e) => `legacy avrs: ${e}`));
        return { errors };
      }
      normalizedConfig.avrs = [res.normalized!];
    } else {
      errors.push("No avrs array or legacy model/ip fields found");
      return { errors };
    }

    return { errors: [], normalized: normalizedConfig };
  }
}
