import path from "path";
import fs from "fs";
import log, { setLogLevel } from "./loggers.js";

// Re-export everything from configConstants so existing imports via configManager continue to work.
export * from "./configConstants.js";
import { AvrZone, AvrConfig, IntegrationConfig, LogLevel, buildEntityId } from "./configConstants.js";
import { applyAvrDefaults, validateZone } from "./configValidation.js";

const logSource = "configManager:";

// The integration's config file (config.json) and its in-memory copy. One store per config file; the driver creates it
// for the Integration API's config directory.
export class ConfigStore {
  private config: IntegrationConfig = {};

  constructor(private readonly filePath: string) {}

  // The config file this store reads and writes.
  get path(): string {
    return this.filePath;
  }

  load(): IntegrationConfig {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
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
            applyAvrDefaults({
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
            applyAvrDefaults({
              ...avr,
              zone: validateZone(avr.zone),
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
            applyAvrDefaults({
              ...avr,
              zone: validateZone(avr.zone)
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

  save(newConfig: Partial<IntegrationConfig>) {
    this.config = { ...this.config, ...newConfig };
    // configVersion was an old, redundant field. Versioning belongs to the backup metadata.
    delete (this.config as Record<string, unknown>).configVersion;
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (err) {
      log.error(`${logSource} Failed to save config:`, err);
    }
  }

  addAvr(avr: Partial<AvrConfig>) {
    if (!this.config.avrs) {
      this.config.avrs = [];
    }

    const normalizedAvr = applyAvrDefaults({
      ...avr,
      zone: validateZone(avr.zone)
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
  patchAvr(ip: string, zone: AvrZone, patch: Partial<AvrConfig>): boolean {
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
  clear(): void {
    this.config = {} as IntegrationConfig;
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.config, null, 2), "utf-8");
      log.info(`${logSource} Cleared configuration and persisted empty config file: ${this.filePath}`);
    } catch (err) {
      log.error(`${logSource} Failed to clear config:`, err);
    }
  }

  get(): IntegrationConfig {
    return this.config;
  }
}

// Read access to the integration config, for components that only look up settings.
export type ConfigSource = Pick<ConfigStore, "get">;

// A config source without settings, for EiscpDriver instances that only discover or probe an AVR.
export const EMPTY_CONFIG_SOURCE: ConfigSource = { get: () => ({}) };

// The configured AVR zone whose entity id is `entityId`, if any.
export function findAvrConfig(config: ConfigSource, entityId: string): AvrConfig | undefined {
  return config.get()?.avrs?.find((avr) => buildEntityId(avr.model, avr.ip, avr.zone) === entityId);
}

// Path of config.json in a config directory, falling back to UC_CONFIG_HOME and the working directory.
export function configPathFor(dir: string | undefined): string {
  return path.resolve(dir || process.env.UC_CONFIG_HOME || process.cwd(), "config.json");
}
