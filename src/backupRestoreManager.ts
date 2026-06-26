// Focused responsibility: Backup and restore configuration data with file I/O
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { ConfigManager, OnkyoConfig } from "./configManager.js";

interface BackupPayload {
  meta: {
    driver_id: string;
    version: string;
    timestamp: string;
  };
  config: any;
}

export class BackupRestoreManager {
  async buildBackupString(getConfigDirPath: () => string | undefined): Promise<string> {
    const metadata = await this.readDriverMetadata();
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
    normalized: Partial<OnkyoConfig> | null;
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

    return { normalized: validation.normalized as Partial<OnkyoConfig>, isValid: true, errors: [] };
  }

  private async readDriverMetadata(): Promise<{ driverId: string; driverVersion: string }> {
    try {
      const driverJsonPath = resolve(process.cwd(), "driver.json");
      const driverJsonRaw = readFileSync(driverJsonPath, "utf-8");
      const driverJson = JSON.parse(driverJsonRaw);
      return {
        driverId: driverJson.driver_id || "unknown",
        driverVersion: driverJson.version || "unknown"
      };
    } catch (_err) {
      return { driverId: "unknown", driverVersion: "unknown" };
    }
  }

  private readConfigData(getConfigDirPath: () => string | undefined): any {
    try {
      const cfgPath = resolve(getConfigDirPath() ?? process.cwd(), "config.json");
      if (existsSync(cfgPath)) {
        const rawCfg = readFileSync(cfgPath, "utf-8");
        return JSON.parse(rawCfg);
      }
      return ConfigManager.get();
    } catch (_err) {
      return ConfigManager.get();
    }
  }
}
