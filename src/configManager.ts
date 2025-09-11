import path from "path";
import fs from "fs";

// Use UC_CONFIG_HOME if available, otherwise fallback to process.cwd()
const CONFIG_DIR = process.env.UC_CONFIG_HOME || process.cwd();
const CONFIG_PATH = path.resolve(CONFIG_DIR, "config.json");

export interface OnkyoConfig {
  model?: string;
  ip?: string;
  port?: number;
  longPressThreshold?: number;
  albumArtURL?: string;
  selectedAvr?: string;
}

export class ConfigManager {
  private static config: OnkyoConfig = {};

  static load(): OnkyoConfig {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
        this.config = JSON.parse(raw);
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

  static get(): OnkyoConfig {
    return this.config;
  }
}
