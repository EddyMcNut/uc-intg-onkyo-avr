/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import EiscpDriver from "./eiscp.js";
import { ConfigManager, parseBoolean, OnkyoConfig, AvrConfig, AvrZone, AVR_DEFAULTS } from "./configManager.js";
import log from "./loggers.js";

const integrationName = "driver:";

type SetupHost = {
  driver: uc.IntegrationAPI;
  getConfigDirPath: () => string | undefined;
  onConfigSaved: () => Promise<void>;
  onConfigCleared: () => Promise<void>;
  log: typeof log;
};

export default class SetupHandler {
  private host: SetupHost;
  constructor(host: SetupHost) {
    this.host = host;
  }

  async handle(msg: uc.SetupDriver): Promise<uc.SetupAction> {
    // Delegate to smaller helpers for clarity and easier testing
    if (msg instanceof uc.DriverSetupRequest) {
      if (msg.reconfigure) {
        const res = await this.handleDriverSetupReconfigure(msg);
        if (res) return res;
      } else {
        const res = await this.handleDriverSetupInitial();
        if (res) return res;
      }
    }

    if (msg instanceof uc.UserDataResponse) {
      const res = await this.handleUserDataResponse(msg);
      if (res) return res;
    }

    // Default to complete if nothing else matched
    return new uc.SetupComplete();
  }

  private async handleDriverSetupReconfigure(msg: uc.DriverSetupRequest): Promise<uc.SetupAction | undefined> {
    const setupData = (msg as uc.DriverSetupRequest).setupData ?? {};

    if (setupData && Object.prototype.hasOwnProperty.call(setupData, "choice")) {
      const selected = String(setupData.choice ?? "").toLowerCase();

      if (selected === "restore") return this.handleRestorePayload(setupData.backup_data);
      if (selected === "backup") return this.handleBackupPayload(setupData.backup_data);
      if (selected === "delete_config") return this.handleDeleteConfigPayload(parseBoolean(setupData.confirm_delete_config, false), true);
    }

    if (!setupData || !Object.prototype.hasOwnProperty.call(setupData, "choice")) {
      return new uc.RequestUserInput("Configuration", [
        {
          id: "choice",
          label: { en: "Action" },
          field: {
            dropdown: {
              value: "configure",
              items: [
                { id: "configure", label: { en: "Configure" } },
                { id: "backup", label: { en: "Create configuration backup" } },
                { id: "restore", label: { en: "Restore configuration from backup" } },
                { id: "delete_config", label: { en: "Delete config" } }
              ]
            }
          }
        }
      ]);
    }

    return undefined;
  }

  private async handleDriverSetupInitial(): Promise<uc.SetupAction | undefined> {
    return new uc.RequestUserInput("Initial setup", [
      {
        id: "info",
        label: { en: "Setup" },
        field: {
          label: {
            value: {
              en: "Choose whether to configure the integration manually, create a backup, or restore from a backup."
            }
          }
        }
      },
      {
        id: "choice",
        label: { en: "Action" },
        field: {
          dropdown: {
            value: "configure",
            items: [
              { id: "configure", label: { en: "Configure" } },
              { id: "backup", label: { en: "Create configuration backup" } },
              { id: "restore", label: { en: "Restore configuration from backup" } }
            ]
          }
        }
      }
    ]);
  }

  private async handleUserDataResponse(msg: uc.UserDataResponse): Promise<uc.SetupAction | undefined> {
    const input = (msg as uc.UserDataResponse).inputValues || {};
    const action = String(input.action ?? input.choice ?? "").toLowerCase();

    if (action === "restore") {
      if (!input.backup_data) {
        return new uc.RequestUserInput("Restore data", [
          {
            id: "backup_data",
            label: { en: "Configuration Backup Data" },
            field: { textarea: { value: "" } }
          }
        ]);
      }
      return this.handleRestorePayload(input.backup_data);
    }

    if (action === "backup") {
      // Integration Manager uses a placeholder of "[]" when requesting a backup.
      // Treat undefined/empty or placeholder as a request for us to generate and
      // return the backup textarea instead of treating it as a completed request.
      const provided = typeof input.backup_data === "string" ? String(input.backup_data).trim() : "";
      if (provided && provided !== "[]") return new uc.SetupComplete();
      return this.handleBackupPayload(provided || undefined);
    }

    if (action === "delete_config") {
      if (!input.confirm_delete_config) {
        return new uc.RequestUserInput("Confirm delete", [
          {
            id: "info",
            label: { en: "Delete config" },
            field: { label: { value: { en: "This will remove all configured AVRs and reset integration state. This action cannot be undone." } } }
          },
          {
            id: "confirm_delete_config",
            label: { en: "Confirm delete config" },
            field: { checkbox: { value: false } }
          }
        ]);
      }
      return this.handleDeleteConfigPayload(true, false);
    }

    if (action === "configure") {
      const hasManualFields = Boolean(
        input.model ||
          input.ipAddress ||
          input.port ||
          input.queueThreshold ||
          input.albumArtURL ||
          input.listeningModeOptions ||
          input.volumeScale ||
          input.adjustVolumeDispl ||
          input.zoneCount ||
          input.createSensors ||
          input.netMenuDelay
      );

      if (!hasManualFields) {
        const cfg = ConfigManager.load();
        const currentAvr = cfg.avrs && cfg.avrs.length > 0 ? cfg.avrs[0] : undefined;
        const initialModel = currentAvr ? currentAvr.model : "";
        const initialIp = currentAvr ? currentAvr.ip : "";
        const initialPort = currentAvr ? currentAvr.port : AVR_DEFAULTS.port;
        const initialListeningModes = currentAvr && Array.isArray(currentAvr.listeningModeOptions) ? currentAvr.listeningModeOptions.join('; ') : "";

        return new uc.RequestUserInput("Manual configuration", [
          {
            id: "model",
            label: { en: "AVR Model (or a name you prefer)" },
            field: { text: { value: initialModel } }
          },
          {
            id: "ipAddress",
            label: { en: "AVR IP Address (for example `192.168.1.100`)" },
            field: { text: { value: initialIp } }
          },
          {
            id: "port",
            label: { en: "AVR Port (default `60128`)" },
            field: { number: { value: initialPort } }
          },
          {
            id: "albumArtURL",
            label: { en: "AVR AlbumArt endpoint. Default `album_art.cgi`, if not known set to `na`." },
            field: { text: { value: AVR_DEFAULTS.albumArtURL } }
          },
          {
            id: "listeningModeOptions",
            label: { en: "Listening mode select options (semicolon-separated, leave empty to show all)" },
            field: { text: { value: initialListeningModes } },
            description: { en: "Optional — provide a semicolon-separated list (e.g. stereo; straight-decode; neural-thx). If left empty the driver will show dynamic options based on audio format." }
          },
          {
            id: "queueThreshold",
            label: { en: "Message queue threshold. Default `100`" },
            field: { number: { value: AVR_DEFAULTS.queueThreshold } }
          },
          {
            id: "netMenuDelay",
            label: { en: "NET sub-source selection delay. Default `500`" },
            field: { number: { value: AVR_DEFAULTS.netMenuDelay } }
          },
          {
            id: "volumeScale",
            label: { en: "Volume scale (0-80 or 0-100)" },
            field: {
              dropdown: {
                value: String(AVR_DEFAULTS.volumeScale),
                items: [
                  { id: "100", label: { en: "0-100" } },
                  { id: "80", label: { en: "0-80" } }
                ]
              }
            }
          },
          {
            id: "adjustVolumeDispl",
            label: { en: "Adjust volume display" },
            field: {
              dropdown: {
                value: "true",
                items: [
                  { id: "true", label: { en: "Yes - eISCP divided by 2" } },
                  { id: "false", label: { en: "No - just eISCP" } }
                ]
              }
            }
          },
          {
            id: "zoneCount",
            label: { en: "Number of zones to configure" },
            field: {
              dropdown: {
                value: "1",
                items: [
                  { id: "1", label: { en: "1 zone (Main only)" } },
                  { id: "2", label: { en: "2 zones (Main + Zone 2)" } },
                  { id: "3", label: { en: "3 zones (Main + Zone 2 + Zone 3)" } }
                ]
              }
            }
          },
          {
            id: "createSensors",
            label: { en: "Create sensor entities?" },
            field: {
              dropdown: {
                value: "true",
                items: [
                  { id: "true", label: { en: "Yes" } },
                  { id: "false", label: { en: "No" } }
                ]
              }
            }
          },
          {
            id: "listeningModeOptions",
            label: { en: "Listening mode select options (semicolon-separated, leave empty to show all)" },
            field: { text: { value: initialListeningModes } },
            description: { en: "Optional — provide a semicolon-separated list (e.g. stereo; straight-decode; neural-thx). If left empty the driver will show dynamic options based on audio format." }
          }
        ]);
      }

      // Has manual fields - validate and persist
      try {
        return await this.handleManualConfiguration(input as any);
      } catch (err) {
        this.host.log.error("%s Failed to save configuration:", integrationName, err);
        return new uc.SetupError("OTHER");
      }
    }

    return undefined;
  }

  private async handleBackupPayload(backup_data?: string): Promise<uc.SetupAction> {
    // Integration Manager sends a placeholder value of "[]" when requesting a backup.
    // Treat undefined, empty or the placeholder as a request for us to produce the backup data.
    const provided = typeof backup_data === "string" ? backup_data.trim() : "";
    if (provided && provided !== "[]") return new uc.SetupComplete();

    const backupString = await this.buildBackupString();

    return new uc.RequestUserInput("Backup data", [
      {
        id: "backup_data",
        label: { en: "Backup data (JSON)" },
        field: {
          textarea: {
            value: backupString
          }
        }
      }
    ]);
  }

  private async buildBackupString(): Promise<string> {
    let driverId = "unknown";
    let driverVersion = "unknown";
    try {
      const fs = await import("fs");
      const path = await import("path");
      const driverJsonPath = path.resolve(process.cwd(), "driver.json");
      const driverJsonRaw = fs.readFileSync(driverJsonPath, "utf-8");
      const driverJson = JSON.parse(driverJsonRaw);
      driverId = driverJson.driver_id || driverId;
      driverVersion = driverJson.version || driverVersion;
    } catch (err) {
      this.host.log.warn(`${integrationName} Could not read driver.json metadata for backup:`, err);
    }

    let configData: any = {};
    try {
      const fs2 = await import("fs");
      const path2 = await import("path");
      const cfgPath = path2.resolve(this.host.getConfigDirPath() ?? process.cwd(), "config.json");
      if (fs2.existsSync(cfgPath)) {
        const rawCfg = fs2.readFileSync(cfgPath, "utf-8");
        configData = JSON.parse(rawCfg);
      } else {
        this.host.log.info("%s Config file not present at %s, falling back to ConfigManager.get()", integrationName, cfgPath);
        configData = ConfigManager.get();
      }
    } catch (err) {
      this.host.log.warn(`${integrationName} Failed to read config file for backup, falling back to in-memory ConfigManager:`, err);
      configData = ConfigManager.get();
    }

    const backupPayload = {
      meta: {
        driver_id: driverId,
        version: driverVersion,
        timestamp: new Date().toISOString()
      },
      config: configData
    };
    return JSON.stringify(backupPayload, null, 2);
  }

  private async handleRestorePayload(rawData?: string): Promise<uc.SetupAction> {
    if (!rawData) {
      return new uc.RequestUserInput("Restore data", [
        {
          id: "backup_data",
          label: { en: "Configuration Backup Data" },
          field: { textarea: { value: "" } }
        }
      ]);
    }

    try {
      const raw = String(rawData ?? "").trim();
      const parsed = JSON.parse(raw);
      const newConfigObj = parsed && parsed.config ? parsed.config : parsed;

      const validation = ConfigManager.validateConfigPayload(newConfigObj);
      if (validation.errors && validation.errors.length > 0) {
        return new uc.RequestUserInput("Restore data", [
          {
            id: "info",
            label: { en: "Restore validation errors" },
            field: { label: { value: { en: `Errors:\n- ${validation.errors.join("\n- ")}` } } }
          },
          {
            id: "backup_data",
            label: { en: "Configuration Backup Data" },
            field: { textarea: { value: raw } }
          }
        ]);
      }

      ConfigManager.save(validation.normalized as Partial<OnkyoConfig>);
      await this.host.onConfigSaved();
      return new uc.SetupComplete();
    } catch (err) {
      this.host.log.error("%s Failed to parse or apply restore data (reconfigure):", integrationName, err);
      return new uc.SetupError("OTHER");
    }
  }

  private async handleDeleteConfigPayload(confirm?: boolean, reconfigureMode: boolean = false): Promise<uc.SetupAction> {
    if (!confirm) {
      return new uc.RequestUserInput("Confirm delete", [
        {
          id: "info",
          label: { en: "Delete config" },
          field: { label: { value: { en: "This will remove all configured AVRs and reset integration state. This action cannot be undone." } } }
        },
        {
          id: "confirm_delete_config",
          label: { en: "Confirm delete config" },
          field: { checkbox: { value: false } }
        }
      ]);
    }

    try {
      await this.host.onConfigCleared();
      this.host.log.info("%s Configuration deleted by user%s", integrationName, reconfigureMode ? " (via reconfigure)" : "");
      return new uc.SetupComplete();
    } catch (err) {
      this.host.log.error("%s Failed to delete configuration%s:", integrationName, reconfigureMode ? " (via reconfigure)" : "", err);
      return new uc.SetupError("OTHER");
    }
  }

  private async handleManualConfiguration(input: any): Promise<uc.SetupAction> {
    // Normalize inputs safely (avoid String(undefined) -> "undefined")
    const modelName = (input.model ?? "").toString().trim();
    const ipVal = (input.ipAddress ?? "").toString().trim();

    // If user left both model and ip blank, attempt autodiscovery
    if (modelName === "" && ipVal === "") {
      try {
        const e = new EiscpDriver();
        const hosts = await e.discover({ address: "255.255.255.255", timeout: 3, devices: 1 });
        if (!hosts || hosts.length === 0) {
          return new uc.RequestUserInput("Manual configuration", [
            {
              id: "info",
              label: { en: "Auto-discovery failed" },
              field: {
                label: {
                  value: {
                    en: "No Onkyo AVR found on the network during auto-discovery. Please enter the AVR model and IP address manually."
                  }
                }
              }
            },
            {
              id: "model",
              label: { en: "AVR Model (or a name you prefer)" },
              field: { text: { value: "" } }
            },
            {
              id: "ipAddress",
              label: { en: "AVR IP Address (for example `192.168.1.100`)" },
              field: { text: { value: "" } }
            }
          ]);
        }

        const found = hosts[0];
        const discoveredAvr: Partial<AvrConfig> = {
          model: found.model,
          ip: found.host,
          port: Number(found.port) || AVR_DEFAULTS.port,
          zone: "main"
        };

        // Save discovered AVR
        ConfigManager.addAvr(discoveredAvr);
        await this.host.onConfigSaved();
        this.host.log.info("%s Auto-discovered AVR and saved configuration: %s", integrationName, JSON.stringify(discoveredAvr));
        return new uc.SetupComplete();
      } catch (err) {
        this.host.log.error("%s Failed during auto-discovery:", integrationName, err);
        return new uc.RequestUserInput("Manual configuration", [
          {
            id: "info",
            label: { en: "Auto-discovery error" },
            field: { label: { value: { en: "Auto-discovery failed due to an unexpected error. Please enter the AVR model and IP address manually." } } }
          },
          {
            id: "model",
            label: { en: "AVR Model (or a name you prefer)" },
            field: { text: { value: "" } }
          },
          {
            id: "ipAddress",
            label: { en: "AVR IP Address (for example `192.168.1.100`)" },
            field: { text: { value: "" } }
          }
        ]);
      }
    }

    const portNum = (() => {
      const p = parseInt((input.port ?? "").toString(), 10);
      return isNaN(p) ? AVR_DEFAULTS.port : p;
    })();

    const queueThresholdValue = ((value) => {
      if (value === undefined || value === null || value === "") return AVR_DEFAULTS.queueThreshold;
      const parsed = parseInt(String(value), 10);
      return isNaN(parsed) ? AVR_DEFAULTS.queueThreshold : parsed;
    })(input.queueThreshold);

    const albumArtURLValue = typeof input.albumArtURL === "string" && input.albumArtURL.trim() !== "" ? input.albumArtURL.trim() : AVR_DEFAULTS.albumArtURL;
    const volumeScaleValue = ((value) => {
      const parsed = parseInt(String(value), 10);
      if (isNaN(parsed)) return AVR_DEFAULTS.volumeScale;
      return [80, 100].includes(parsed) ? parsed : AVR_DEFAULTS.volumeScale;
    })(input.volumeScale);
    const adjustVolumeDisplValue = parseBoolean(input.adjustVolumeDispl, true);
    const createSensorsValue = parseBoolean(input.createSensors, AVR_DEFAULTS.createSensors);
    const netMenuDelayValue = ((value) => {
      const parsed = parseInt(String(value), 10);
      return isNaN(parsed) ? AVR_DEFAULTS.netMenuDelay : parsed;
    })(input.netMenuDelay);

    const zoneCountValue = ((value) => {
      const parsed = parseInt(String(value), 10);
      if (isNaN(parsed)) return 1;
      return parsed >= 1 && parsed <= 3 ? parsed : 1;
    })(input.zoneCount);

    const basePayload: any = {
      model: modelName,
      ip: ipVal,
      port: portNum,
      queueThreshold: queueThresholdValue,
      albumArtURL: albumArtURLValue,
      listeningModeOptions: input.listeningModeOptions,
      volumeScale: volumeScaleValue,
      adjustVolumeDispl: adjustVolumeDisplValue,
      createSensors: createSensorsValue,
      netMenuDelay: netMenuDelayValue
    };

    const zones: AvrZone[] = ["main"];
    if (zoneCountValue >= 2) zones.push("zone2");
    if (zoneCountValue >= 3) zones.push("zone3");

    const errors: string[] = [];
    const normalizedAvrs: AvrConfig[] = [];

    for (const zone of zones) {
      const payload = { ...basePayload, zone };
      const res = ConfigManager.validateAvrPayload(payload);
      if (res.errors.length > 0) {
        errors.push(`zone ${zone}: ${res.errors.join("; ")}`);
      } else if (res.normalized) {
        normalizedAvrs.push(res.normalized);
      }
    }

    if (errors.length > 0) {
      return new uc.RequestUserInput("Manual configuration", [
        {
          id: "info",
          label: { en: "Validation errors" },
          field: { label: { value: { en: `Errors:\n- ${errors.join("\n- ")}` } } }
        },
        {
          id: "model",
          label: { en: "AVR Model (or a name you prefer)" },
          field: { text: { value: modelName } }
        },
        {
          id: "ipAddress",
          label: { en: "AVR IP Address (for example `192.168.1.100`)" },
          field: { text: { value: ipVal } }
        },
        {
          id: "port",
          label: { en: "AVR Port (default `60128`)" },
          field: { number: { value: portNum } }
        },
        {
          id: "albumArtURL",
          label: { en: "AVR AlbumArt endpoint. Default `album_art.cgi`, if not known set to `na`." },
          field: { text: { value: albumArtURLValue } }
        },
        {
          id: "listeningModeOptions",
          label: { en: "Listening mode select options (semicolon-separated, leave empty to show all)" },
          field: { text: { value: String(input.listeningModeOptions ?? "") } },
          description: { en: "Optional — provide a semicolon-separated list (e.g. stereo; straight-decode; neural-thx). If left empty the driver will show dynamic options based on audio format." }
        },
        {
          id: "queueThreshold",
          label: { en: "Message queue threshold. Default `100`" },
          field: { number: { value: queueThresholdValue } }
        },
        {
          id: "netMenuDelay",
          label: { en: "NET sub-source selection delay. Default `500`" },
          field: { number: { value: netMenuDelayValue } }
        },
        {
          id: "volumeScale",
          label: { en: "Volume scale (0-80 or 0-100)" },
          field: {
            dropdown: {
              value: String(volumeScaleValue),
              items: [
                { id: "100", label: { en: "0-100" } },
                { id: "80", label: { en: "0-80" } }
              ]
            }
          }
        },
        {
          id: "adjustVolumeDispl",
          label: { en: "Adjust volume display" },
          field: {
            dropdown: {
              value: String(adjustVolumeDisplValue),
              items: [
                { id: "true", label: { en: "Yes - eISCP divided by 2" } },
                { id: "false", label: { en: "No - just eISCP" } }
              ]
            }
          }
        },
        {
          id: "zoneCount",
          label: { en: "Number of zones to configure" },
          field: {
            dropdown: {
              value: String(zoneCountValue),
              items: [
                { id: "1", label: { en: "1 zone (Main only)" } },
                { id: "2", label: { en: "2 zones (Main + Zone 2)" } },
                { id: "3", label: { en: "3 zones (Main + Zone 2 + Zone 3)" } }
              ]
            }
          }
        },
        {
          id: "createSensors",
          label: { en: "Create sensor entities?" },
          field: {
            dropdown: {
              value: String(createSensorsValue),
              items: [
                { id: "true", label: { en: "Yes" } },
                { id: "false", label: { en: "No" } }
              ]
            }
          }
        }
      ]);
    }

    for (const avrCfg of normalizedAvrs) {
      this.host.log.info(
        "%s Adding AVR config for zone %s with volumeScale: %d, adjustVolumeDispl: %s, createSensors: %s, netMenuDelay: %d",
        integrationName,
        avrCfg.zone,
        avrCfg.volumeScale,
        avrCfg.adjustVolumeDispl,
        avrCfg.createSensors,
        avrCfg.netMenuDelay
      );
      ConfigManager.addAvr(avrCfg);
    }

    await this.host.onConfigSaved();

    return new uc.SetupComplete();
  }
}
