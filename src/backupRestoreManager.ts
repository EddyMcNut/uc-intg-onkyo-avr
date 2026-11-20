// Focused responsibility: Backup and restore configuration data with file I/O
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { ConfigManager, IntegrationConfig } from "./configManager.js";
import log from "./loggers.js";
import { readDriverMetadata, type DriverMetadata } from "./driverMetadata.js";

const logSource = "backupRestoreManager:";

interface BackupPayload {
  meta: {
    driver_id: string;
    version: string;
    timestamp: string;
  };
  config: unknown;
}

export class BackupRestoreManager {
  async buildBackupString(getConfigDirPath: () => string | undefined): Promise<string> {
    const metadata = this.readDriverMetadata();
    const configData = this.readConfigData(getConfigDirPath);

    const backupPayload: BackupPayload = {
      meta: {
        driver_id: metadata.driverId,
        version: metadata.driverVersion,
        timestamp: new Date().toISOString()
      },
      config: configData
    };
    return JSON.stringify(backupPayload, null, 2);
  }

  parseRestorePayload(rawData: string): { payload: BackupPayload; isValid: boolean; errors?: string[] } {
    try {
      const parsed = JSON.parse(rawData);
      return { payload: parsed, isValid: true };
    } catch (err) {
      return {
        payload: {} as BackupPayload,
        isValid: false,
        errors: [`Invalid JSON: ${(err as Error).message}`]
      };
    }
  }

  validateAndNormalizeRestorePayload(rawData: string): {
    normalized: Partial<IntegrationConfig> | null;
    isValid: boolean;
    errors: string[];
  } {
    const { payload, isValid, errors: parseErrors } = this.parseRestorePayload(rawData);
    if (!isValid) {
      return { normalized: null, isValid: false, errors: parseErrors ?? ["Failed to parse JSON"] };
    }

    const configToValidate = payload && payload.config ? payload.config : payload;
    const validation = ConfigManager.validateConfigPayload(configToValidate);

    if (validation.errors && validation.errors.length > 0) {
      return { normalized: null, isValid: false, errors: validation.errors };
    }

    return { normalized: validation.normalized as Partial<IntegrationConfig>, isValid: true, errors: [] };
  }

  private readDriverMetadata(): DriverMetadata {
    const metadata = readDriverMetadata();
    if (metadata.error) {
      log.debug("%s Driver metadata unavailable, using fallback metadata: %s", logSource, metadata.error);
    }
    return metadata;
  }

  private readConfigData(getConfigDirPath: () => string | undefined): unknown {
    try {
      const cfgPath = resolve(getConfigDirPath() ?? process.cwd(), "config.json");
      if (existsSync(cfgPath)) {
        const rawCfg = readFileSync(cfgPath, "utf-8");
        return this.removeLegacyConfigVersion(JSON.parse(rawCfg));
      }
      return this.removeLegacyConfigVersion(ConfigManager.get());
    } catch (err) {
      log.debug("%s Config file unavailable, using in-memory configuration: %s", logSource, err);
      return this.removeLegacyConfigVersion(ConfigManager.get());
    }
  }

  private removeLegacyConfigVersion(config: unknown): unknown {
    if (!config || typeof config !== "object" || Array.isArray(config)) return config;
    const { configVersion: _configVersion, ...withoutVersion } = config as Record<string, unknown>;
    return withoutVersion;
  }
}
