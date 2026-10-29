import path from "path";
import fs from "fs";
import log, { setLogLevel } from "./loggers.js";

// Re-export everything from configConstants so existing imports via configManager continue to work.
export * from "./configConstants.js";
import {
  MAX_LENGTHS,
  PATTERNS,
  parseBoolean,
  parseVolumeScale,
  AvrZone,
  AvrConfig,
  IntegrationConfig,
  AVR_DEFAULTS,
  EntityNameStyle,
  LogLevel,
  VOLUME_SCALE_AUTO,
  normalizeInputSourceSettings,
  NETWORK_INPUT_MARKERS
} from "./configConstants.js";
import { normalizeListeningModes } from "./listeningModePreferences.js";

const logSource = "configManager:";

function parseStrictInteger(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value !== "string" || !/^[+-]?\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

// Config directory is configurable at runtime to support integration manager backups/restores
let CONFIG_DIR = process.env.UC_CONFIG_HOME || process.cwd();
let CONFIG_PATH = path.resolve(CONFIG_DIR, "config.json");

// Set the config directory to match the Integration API's path so backups/restores work correctly.
export function setConfigDir(dir: string) {
  CONFIG_DIR = dir || process.env.UC_CONFIG_HOME || process.cwd();
  CONFIG_PATH = path.resolve(CONFIG_DIR, "config.json");
}

// Returns the current config file path (useful for testing/manager compatibility).
export function getConfigPath(): string {
  return CONFIG_PATH;
}

export class ConfigManager {
  private static config: IntegrationConfig = {};

  // Apply default values to an AVR config
  private static applyDefaults(avr: Partial<AvrConfig>): AvrConfig {
    return {
      model: avr.model ?? "",
      ip: avr.ip ?? "",
      port: avr.port ?? 60128,
      zone: avr.zone ?? "main",
      queueThreshold: avr.queueThreshold ?? AVR_DEFAULTS.queueThreshold,
      albumArtURL: avr.albumArtURL ?? AVR_DEFAULTS.albumArtURL,
      volumeScale: parseVolumeScale(avr.volumeScale),
      volumeScaleDiscovered: Boolean(avr.volumeScaleDiscovered),
      useAvrReportedInputs: parseBoolean(avr.useAvrReportedInputs, AVR_DEFAULTS.useAvrReportedInputs),
      volumeDisplay: avr.volumeDisplay ?? AVR_DEFAULTS.volumeDisplay,
      adjustVolumeDispl: avr.adjustVolumeDispl ?? AVR_DEFAULTS.adjustVolumeDispl,
      entityNameStyle: avr.entityNameStyle ?? AVR_DEFAULTS.entityNameStyle,
      createSensors: avr.createSensors ?? AVR_DEFAULTS.createSensors,
      createTunerPresets: avr.createTunerPresets ?? AVR_DEFAULTS.createTunerPresets,
      createRemoteEntity: avr.createRemoteEntity ?? AVR_DEFAULTS.createRemoteEntity,
      createDiracSelectEntity: avr.createDiracSelectEntity ?? AVR_DEFAULTS.createDiracSelectEntity,
      netMenuDelay: avr.netMenuDelay ?? AVR_DEFAULTS.netMenuDelay,
      tuneinPresetPosition: avr.tuneinPresetPosition ?? AVR_DEFAULTS.tuneinPresetPosition,
      tuneinMenuStyle: avr.tuneinMenuStyle ?? AVR_DEFAULTS.tuneinMenuStyle,
      inputSourceLayout: avr.inputSourceLayout ?? AVR_DEFAULTS.inputSourceLayout,
      networkInputMarker: avr.networkInputMarker ?? AVR_DEFAULTS.networkInputMarker,
      listeningModes: normalizeListeningModes(avr.listeningModes),
      idInputSources: normalizeInputSourceSettings(avr.idInputSources)
    };
  }

  // Validate zone string and return typed zone or default
  private static validateZone(zone: string | undefined): AvrZone {
    if (zone === "main" || zone === "zone2" || zone === "zone3" || zone === "zone4") {
      return zone;
    }
    return "main";
  }

  static load(): IntegrationConfig {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
        this.config = JSON.parse(raw);
        let shouldPersistMigration = false;

        // Remove legacy learning-store keys from the abandoned feature/learn experiment.
        // Not used at runtime; drop them from memory and persist the cleaned config so
        // startup logs and subsequent backup/restore payloads stay clean.
        const rawConfig = this.config as Record<string, unknown>;
        // The backup envelope already carries the driver version in meta.version.  Do not
        // keep a second, stale version inside the persisted configuration.
        if ("configVersion" in rawConfig) {
          delete rawConfig.configVersion;
          shouldPersistMigration = true;
        }
        if ("learning" in rawConfig || "learningEnabled" in rawConfig) {
          delete rawConfig.learning;
          delete rawConfig.learningEnabled;
          shouldPersistMigration = true;
          log.info("%s Removed legacy learning/learningEnabled keys from config", logSource);
        }

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
        if (this.config.avrs && (this.config.queueThreshold || this.config.albumArtURL || this.config.entityNameStyle || this.config.volumeDisplay)) {
          this.config.avrs = this.config.avrs.map((avr) =>
            this.applyDefaults({
              ...avr,
              zone: this.validateZone(avr.zone),
              queueThreshold: avr.queueThreshold ?? this.config.queueThreshold,
              albumArtURL: avr.albumArtURL ?? this.config.albumArtURL,
              entityNameStyle: avr.entityNameStyle ?? this.config.entityNameStyle,
              volumeDisplay: avr.volumeDisplay ?? this.config.volumeDisplay
            })
          );
          // Remove global settings after migration
          delete this.config.queueThreshold;
          delete this.config.albumArtURL;
          delete this.config.entityNameStyle;
          delete this.config.volumeDisplay;
          shouldPersistMigration = true;
        }

        // Ensure all AVRs have defaults applied
        if (this.config.avrs) {
          const configBeforeDefaults = JSON.stringify(this.config.avrs);
          this.config.avrs = this.config.avrs.map((avr) =>
            this.applyDefaults({
              ...avr,
              zone: this.validateZone(avr.zone)
            })
          );
          // A config can already carry the current version while still having been written by an
          // older build that did not know the newer per-AVR fields. Persist the normalized shape,
          // rather than relying only on setup, so the normalized shape is persisted immediately.
          // the current runtime defaults.
          if (JSON.stringify(this.config.avrs) !== configBeforeDefaults) {
            shouldPersistMigration = true;
          }
        }

        // Persist the normalized settings once so installations upgraded without opening setup
        // receive the same per-AVR configuration as installations that saved an older form.
        if (shouldPersistMigration) {
          this.save(this.config);
          log.info("%s Persisted normalized configuration", logSource);
        }
      }
    } catch (err) {
      log.error(`${logSource} Failed to load config:`, err);
      this.config = {};
    }
    if (this.config.logLevel) {
      setLogLevel(this.config.logLevel as LogLevel);
    }
    return this.config;
  }

  static save(newConfig: Partial<IntegrationConfig>) {
    this.config = { ...this.config, ...newConfig };
    // configVersion was an old, redundant field. Versioning belongs to the backup metadata.
    delete (this.config as Record<string, unknown>).configVersion;
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (err) {
      log.error(`${logSource} Failed to save config:`, err);
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
      log.info(`${logSource} Updating existing AVR at ${normalizedAvr.ip} zone ${normalizedAvr.zone}`);
      this.config.avrs[existingIndex] = normalizedAvr;
      this.save(this.config);
      return;
    }

    // Add new AVR with defaults applied
    this.config.avrs.push(normalizedAvr);
    this.save(this.config);
  }

  // Merge a partial update into one configured AVR zone and persist it. Used for values the integration determines itself (e.g. a volume scale resolved from the AVR), so the other settings of that AVR are left untouched. Returns false when the zone is not configured.
  static patchAvr(ip: string, zone: AvrZone, patch: Partial<AvrConfig>): boolean {
    if (!this.config.avrs) {
      return false;
    }
    const index = this.config.avrs.findIndex((a) => a.ip === ip && a.zone === zone);
    if (index < 0) {
      return false;
    }
    this.config.avrs[index] = { ...this.config.avrs[index], ...patch };
    this.save(this.config);
    return true;
  }

  // Clear all configuration and persist empty config
  static clear(): void {
    this.config = {} as IntegrationConfig;
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), "utf-8");
      log.info(`${logSource} Cleared configuration and persisted empty config file`);
    } catch (err) {
      log.error(`${logSource} Failed to clear config:`, err);
    }
  }

  static get(): IntegrationConfig {
    return this.config;
  }

  // Validate a single AVR object from a restored payload. Returns an object with errors (if any) and a normalized AvrConfig when valid.
  static validateAvrPayload(avr: unknown): { errors: string[]; normalized?: AvrConfig } {
    const errors: string[] = [];

    if (!avr || typeof avr !== "object") {
      errors.push("AVR entry must be an object");
      return { errors };
    }
    const value = avr as Record<string, unknown>;

    // model
    if (!value.model || typeof value.model !== "string" || value.model.trim() === "") {
      errors.push("model is required and must be a non-empty string");
    } else if (value.model.length > MAX_LENGTHS.MODEL_NAME) {
      errors.push(`model too long (max ${MAX_LENGTHS.MODEL_NAME})`);
    } else if (!PATTERNS.MODEL_NAME.test(value.model)) {
      errors.push("model contains invalid characters");
    }

    // ip
    if (!value.ip || typeof value.ip !== "string" || value.ip.trim() === "") {
      errors.push("ip is required and must be a non-empty string");
    } else {
      const trimmed = value.ip.trim();
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
    const portNum = parseStrictInteger(value.port);
    if (portNum === undefined || portNum < 1 || portNum > 65535) {
      errors.push("port must be a valid number between 1 and 65535");
    }

    // zone
    const zone = String(value.zone ?? "main");
    if (!["main", "zone2", "zone3", "zone4"].includes(zone)) {
      errors.push('zone must be one of "main", "zone2", "zone3", "zone4"');
    }

    // albumArtURL
    if (value.albumArtURL && typeof value.albumArtURL === "string") {
      if (value.albumArtURL.length > MAX_LENGTHS.ALBUM_ART_URL) {
        errors.push(`albumArtURL too long (max ${MAX_LENGTHS.ALBUM_ART_URL})`);
      } else if (!PATTERNS.ALBUM_ART_URL.test(value.albumArtURL)) {
        errors.push("albumArtURL contains invalid characters");
      }
    }

    // queueThreshold
    const queueThreshold = parseStrictInteger(value.queueThreshold);
    if (value.queueThreshold !== undefined) {
      if (queueThreshold === undefined || queueThreshold < 0) {
        errors.push("queueThreshold must be a non-negative integer");
      }
    }

    // volumeScale
    if (value.volumeScale !== undefined) {
      const raw = String(value.volumeScale).trim().toLowerCase();
      if (raw !== VOLUME_SCALE_AUTO && raw !== "80" && raw !== "100") {
        errors.push('volumeScale must be 80, 100 or "auto"');
      }
    }

    // useAvrReportedInputs
    if (value.useAvrReportedInputs !== undefined && typeof value.useAvrReportedInputs !== "boolean" && typeof value.useAvrReportedInputs !== "string") {
      errors.push("useAvrReportedInputs must be boolean");
    }

    // volumeDisplay
    if (value.volumeDisplay !== undefined) {
      const vd = String(value.volumeDisplay).toLowerCase();
      if (vd !== "absolute" && vd !== "relative") {
        errors.push('volumeDisplay must be "absolute" or "relative"');
      }
    }

    // adjustVolumeDispl
    if (value.adjustVolumeDispl !== undefined && typeof value.adjustVolumeDispl !== "boolean" && !(typeof value.adjustVolumeDispl === "string")) {
      errors.push("adjustVolumeDispl must be boolean");
    }

    // entityNameStyle
    if (value.entityNameStyle !== undefined) {
      const style = String(value.entityNameStyle).toLowerCase();
      if (style !== "long" && style !== "short") {
        errors.push('entityNameStyle must be "long" or "short"');
      }
    }

    // createSensors
    if (value.createSensors !== undefined && typeof value.createSensors !== "boolean" && !(typeof value.createSensors === "string")) {
      errors.push("createSensors must be boolean");
    }

    // createTunerPresets
    if (value.createTunerPresets !== undefined && typeof value.createTunerPresets !== "boolean" && !(typeof value.createTunerPresets === "string")) {
      errors.push("createTunerPresets must be boolean");
    }

    // createRemoteEntity
    if (value.createRemoteEntity !== undefined && typeof value.createRemoteEntity !== "boolean" && !(typeof value.createRemoteEntity === "string")) {
      errors.push("createRemoteEntity must be boolean");
    }

    // createDiracSelectEntity
    if (value.createDiracSelectEntity !== undefined && typeof value.createDiracSelectEntity !== "boolean" && !(typeof value.createDiracSelectEntity === "string")) {
      errors.push("createDiracSelectEntity must be boolean");
    }

    // netMenuDelay
    const netMenuDelay = parseStrictInteger(value.netMenuDelay);
    if (value.netMenuDelay !== undefined) {
      if (netMenuDelay === undefined || netMenuDelay < 0) {
        errors.push("netMenuDelay must be a non-negative integer");
      }
    }

    // tuneinPresetPosition
    const tuneinPresetPosition = parseStrictInteger(value.tuneinPresetPosition);
    if (value.tuneinPresetPosition !== undefined) {
      if (tuneinPresetPosition === undefined || tuneinPresetPosition < 1 || tuneinPresetPosition > 10) {
        errors.push("tuneinPresetPosition must be an integer between 1 and 10");
      }
    }

    // tuneinMenuStyle
    if (value.tuneinMenuStyle !== undefined) {
      const style = String(value.tuneinMenuStyle).toLowerCase();
      if (style !== "mypresets" && style !== "full") {
        errors.push('tuneinMenuStyle must be "mypresets" or "full"');
      }
    }

    if (value.inputSourceLayout !== undefined && !["combined", "network-first", "network-last", "separate"].includes(String(value.inputSourceLayout).toLowerCase())) {
      errors.push('inputSourceLayout must be "combined", "network-first" or "network-last"');
    }
    if (value.networkInputMarker !== undefined && !(NETWORK_INPUT_MARKERS as readonly string[]).includes(String(value.networkInputMarker))) {
      errors.push("networkInputMarker is not supported");
    }

    if (errors.length > 0) {
      return { errors };
    }

    // Build normalized AVR with defaults
    const useAvrReportedInputs = parseBoolean(value.useAvrReportedInputs, AVR_DEFAULTS.useAvrReportedInputs);
    const normalized: AvrConfig = this.applyDefaults({
      model: String(value.model).trim(),
      ip: String(value.ip).trim(),
      port: portNum!,
      zone: this.validateZone(zone),
      queueThreshold,
      albumArtURL: typeof value.albumArtURL === "string" ? value.albumArtURL : undefined,
      volumeScale: parseVolumeScale(value.volumeScale),
      useAvrReportedInputs,
      volumeDisplay: String(value.volumeDisplay ?? AVR_DEFAULTS.volumeDisplay).toLowerCase() === "relative" ? "relative" : "absolute",
      adjustVolumeDispl: parseBoolean(value.adjustVolumeDispl, AVR_DEFAULTS.adjustVolumeDispl),
      entityNameStyle: (String(value.entityNameStyle ?? AVR_DEFAULTS.entityNameStyle).toLowerCase() === "short" ? "short" : "long") as EntityNameStyle,
      createSensors: parseBoolean(value.createSensors, AVR_DEFAULTS.createSensors),
      createTunerPresets: parseBoolean(value.createTunerPresets, AVR_DEFAULTS.createTunerPresets),
      createRemoteEntity: parseBoolean(value.createRemoteEntity, AVR_DEFAULTS.createRemoteEntity),
      createDiracSelectEntity: parseBoolean(value.createDiracSelectEntity, AVR_DEFAULTS.createDiracSelectEntity),
      netMenuDelay,
      tuneinPresetPosition,
      tuneinMenuStyle: String(value.tuneinMenuStyle ?? AVR_DEFAULTS.tuneinMenuStyle).toLowerCase() === "full" ? "full" : "mypresets",
      inputSourceLayout: (() => {
        const layout = String(value.inputSourceLayout ?? AVR_DEFAULTS.inputSourceLayout).toLowerCase();
        return layout === "network-first" ? "network-first" : layout === "network-last" || layout === "separate" ? "network-last" : "combined";
      })(),
      networkInputMarker: (value.networkInputMarker ?? AVR_DEFAULTS.networkInputMarker) as AvrConfig["networkInputMarker"],
      listeningModes: normalizeListeningModes(value.listeningModes),
      idInputSources: normalizeInputSourceSettings(value.idInputSources)
    });

    return { errors: [], normalized };
  }

  // Validate an entire restored config payload. Returns errors if any and a normalized IntegrationConfig when valid.
  static validateConfigPayload(payload: unknown): { errors: string[]; normalized?: IntegrationConfig } {
    const errors: string[] = [];
    if (!payload || typeof payload !== "object") {
      errors.push("Payload must be an object");
      return { errors };
    }

    // Allow either full payload {config: {...}} or bare config
    const cfg = (payload as Record<string, unknown>).config ?? payload;

    if (!cfg) {
      errors.push("No config object found in payload");
      return { errors };
    }

    const normalizedConfig: IntegrationConfig = {};

    // Learned modes are stored on their corresponding AVR configuration.

    // Preserve global logLevel if present
    const validLogLevels = ["debug", "info", "warn", "error"];
    const config = cfg as Record<string, unknown>;
    if (config.logLevel !== undefined) {
      const level = String(config.logLevel).toLowerCase();
      if (validLogLevels.includes(level)) {
        normalizedConfig.logLevel = level as LogLevel;
      }
    }

    if (Array.isArray(config.avrs)) {
      const normalizedAvrs: AvrConfig[] = [];
      for (let i = 0; i < config.avrs.length; i++) {
        const avr = { ...(config.avrs[i] as Record<string, unknown>) };
        const res = this.validateAvrPayload(avr);
        if (res.errors.length > 0) {
          errors.push(`avrs[${i}]: ${res.errors.join("; ")}`);
        } else {
          normalizedAvrs.push(res.normalized!);
        }
      }

      if (errors.length > 0) {
        return { errors };
      }

      normalizedConfig.avrs = normalizedAvrs;
    } else if (config.model && config.ip) {
      // Legacy single-model payload
      const res = this.validateAvrPayload({ model: config.model, ip: config.ip, port: config.port ?? AVR_DEFAULTS.port, zone: config.zone ?? "main" });
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
