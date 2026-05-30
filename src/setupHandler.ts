/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import EiscpDriver from "./eiscp.js";
import { ConfigManager, parseBoolean, parseSelectOptions, OnkyoConfig, AvrConfig, AvrZone, AVR_DEFAULTS } from "./configManager.js";
import log from "./loggers.js";

const integrationName = "setupHandler:";

type SetupHost = {
  driver: uc.IntegrationAPI;
  getConfigDirPath: () => string | undefined;
  onConfigSaved: () => Promise<void>;
  onConfigCleared: () => Promise<void>;
  log: typeof log;
};

// ---------- Manual configuration helpers ----------

interface ManualConfigInput {
  model?: unknown;
  ipAddress?: unknown;
  port?: unknown;
  queueThreshold?: unknown;
  albumArtURL?: unknown;
  listeningModeOptions?: unknown;
  inputSelectorOptions?: unknown;
  volumeScale?: unknown;
  volumeDisplay?: unknown;
  adjustVolumeDispl?: unknown;
  zoneCount?: unknown;
  createSensors?: unknown;
  netMenuDelay?: unknown;
  tuneinPresetPosition?: unknown;
  entityNameStyle?: unknown;
}

interface ManualConfigFormValues {
  modelName: string;
  ipVal: string;
  portNum: number;
  queueThresholdValue: number;
  albumArtURLValue: string;
  listeningModeOptions: string;
  inputSelectorOptions: string;
  volumeScaleValue: number;
  volumeDisplayValue: "absolute" | "relative";
  adjustVolumeDisplValue: boolean;
  entityNameStyleValue: "long" | "short";
  zoneCountValue: number;
  createSensorsValue: boolean;
  netMenuDelayValue: number;
  tuneinPresetPositionValue: number;
  errorMessage?: string;
}

function parseManualInput(input: ManualConfigInput): ManualConfigFormValues {
  return {
    modelName: (input.model ?? "").toString().trim(),
    ipVal: (input.ipAddress ?? "").toString().trim(),
    portNum: (() => {
      const p = parseInt((input.port ?? "").toString(), 10);
      return isNaN(p) ? AVR_DEFAULTS.port : p;
    })(),
    queueThresholdValue: (() => {
      if (input.queueThreshold === undefined || input.queueThreshold === null || input.queueThreshold === "") return AVR_DEFAULTS.queueThreshold;
      const parsed = parseInt(String(input.queueThreshold), 10);
      return isNaN(parsed) ? AVR_DEFAULTS.queueThreshold : parsed;
    })(),
    albumArtURLValue: typeof input.albumArtURL === "string" && input.albumArtURL.trim() !== "" ? input.albumArtURL.trim() : AVR_DEFAULTS.albumArtURL,
    listeningModeOptions: String(input.listeningModeOptions ?? ""),
    inputSelectorOptions: String(input.inputSelectorOptions ?? ""),
    volumeScaleValue: (() => {
      const parsed = parseInt(String(input.volumeScale), 10);
      if (isNaN(parsed)) return AVR_DEFAULTS.volumeScale;
      return [80, 100].includes(parsed) ? parsed : AVR_DEFAULTS.volumeScale;
    })(),
    volumeDisplayValue: String(input.volumeDisplay ?? AVR_DEFAULTS.volumeDisplay).toLowerCase() === "relative" ? "relative" : "absolute",
    adjustVolumeDisplValue: parseBoolean(input.adjustVolumeDispl, true),
    entityNameStyleValue: String(input.entityNameStyle ?? AVR_DEFAULTS.entityNameStyle).toLowerCase() === "short" ? "short" : "long",
    createSensorsValue: parseBoolean(input.createSensors, AVR_DEFAULTS.createSensors),
    netMenuDelayValue: (() => {
      const parsed = parseInt(String(input.netMenuDelay), 10);
      return isNaN(parsed) ? AVR_DEFAULTS.netMenuDelay : parsed;
    })(),
    tuneinPresetPositionValue: (() => {
      const parsed = parseInt(String(input.tuneinPresetPosition), 10);
      if (isNaN(parsed)) return AVR_DEFAULTS.tuneinPresetPosition;
      return parsed >= 1 && parsed <= 9 ? parsed : AVR_DEFAULTS.tuneinPresetPosition;
    })(),
    zoneCountValue: (() => {
      const parsed = parseInt(String(input.zoneCount), 10);
      if (isNaN(parsed)) return 1;
      return parsed >= 1 && parsed <= 4 ? parsed : 1;
    })()
  };
}

function buildManualConfigForm(values: ManualConfigFormValues): uc.RequestUserInput {
  return new uc.RequestUserInput("Manual configuration", [
    ...(values.errorMessage ? [{ id: "info", label: { en: "Validation errors" }, field: { label: { value: { en: values.errorMessage } } } }] : []),
    { id: "model", label: { en: "AVR Model (or a name you prefer)" }, field: { text: { value: values.modelName } } },
    { id: "ipAddress", label: { en: "AVR IP Address (for example `192.168.1.100`)" }, field: { text: { value: values.ipVal } } },
    { id: "port", label: { en: "AVR Port (default `60128`)" }, field: { number: { value: values.portNum } } },
    { id: "albumArtURL", label: { en: "AVR AlbumArt endpoint. Default `album_art.cgi`, if not known set to `na`." }, field: { text: { value: values.albumArtURLValue } } },
    {
      id: "listeningModeOptions",
      label: { en: "Listening mode select options (semicolon-separated, 'none' to disable, empty shows all)" },
      field: { text: { value: values.listeningModeOptions } },
      description: { en: "Optional — semicolon-separated list (e.g. stereo; straight-decode; neural-thx). Leave empty for dynamic options, enter 'none' to hide this entity." }
    },
    {
      id: "inputSelectorOptions",
      label: { en: "Input selector options (semicolon-separated, 'none' to disable, empty shows all)" },
      field: { text: { value: values.inputSelectorOptions } },
      description: { en: "Optional — semicolon-separated list (e.g. dvd; bd; net; bluetooth). Leave empty to show all inputs, enter 'none' to hide this entity." }
    },
    { id: "queueThreshold", label: { en: "Message queue threshold. Default `100`" }, field: { number: { value: values.queueThresholdValue } } },
    { id: "netMenuDelay", label: { en: "NET sub-source selection delay. Default `500`" }, field: { number: { value: values.netMenuDelayValue } } },
    {
      id: "tuneinPresetPosition",
      label: { en: "TuneIn 'My Presets' menu position (1-9). Default `1`" },
      field: { number: { value: values.tuneinPresetPositionValue } },
      description: { en: "Position of 'My Presets' in your AVR's TuneIn menu (1=first, 2=second, etc.)" }
    },
    {
      id: "volumeScale",
      label: { en: "Volume scale (0-80 or 0-100)" },
      field: {
        dropdown: {
          value: String(values.volumeScaleValue),
          items: [
            { id: "100", label: { en: "0-100" } },
            { id: "80", label: { en: "0-80" } }
          ]
        }
      }
    },
    {
      id: "volumeDisplay",
      label: { en: "Volume display" },
      field: {
        dropdown: {
          value: String(values.volumeDisplayValue),
          items: [
            { id: "absolute", label: { en: "Absolute (1-100)" } },
            { id: "relative", label: { en: "Relative (dB)" } }
          ]
        }
      }
    },
    {
      id: "adjustVolumeDispl",
      label: { en: "Adjust volume display" },
      field: {
        dropdown: {
          value: String(values.adjustVolumeDisplValue),
          items: [
            { id: "true", label: { en: "Yes - eISCP divided by 2" } },
            { id: "false", label: { en: "No - just eISCP" } }
          ]
        }
      }
    },
    {
      id: "entityNameStyle",
      label: { en: "Entity name style" },
      field: {
        dropdown: {
          value: String(values.entityNameStyleValue),
          items: [
            { id: "long", label: { en: "Long - include IP address" } },
            { id: "short", label: { en: "Short - hide IP address" } }
          ]
        }
      }
    },
    {
      id: "zoneCount",
      label: { en: "Number of zones to configure" },
      field: {
        dropdown: {
          value: String(values.zoneCountValue),
          items: [
            { id: "1", label: { en: "1 zone (Main only)" } },
            { id: "2", label: { en: "2 zones (Main + Zone 2)" } },
            { id: "3", label: { en: "3 zones (Main + Zone 2 + Zone 3)" } },
            { id: "4", label: { en: "4 zones (Main + Zone 2 + Zone 3 + Zone 4)" } }
          ]
        }
      }
    },
    {
      id: "createSensors",
      label: { en: "Create sensor entities?" },
      field: {
        dropdown: {
          value: String(values.createSensorsValue),
          items: [
            { id: "true", label: { en: "Yes" } },
            { id: "false", label: { en: "No" } }
          ]
        }
      }
    }
  ]);
}

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

      if (selected === "restore") return this.handleRestorePayload(setupData.restore_data ?? setupData.backup_data);
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
        id: "restore_from_backup",
        label: { en: "Setup mode" },
        field: {
          dropdown: {
            value: "false",
            items: [
              { id: "false", label: { en: "Configure manually" } },
              { id: "true", label: { en: "Restore from backup" } }
            ]
          }
        },
        description: {
          en: "Manual setup opens the configuration form. Integration Manager uses restore mode automatically during update restore."
        }
      }
    ]);
  }

  private async handleUserDataResponse(msg: uc.UserDataResponse): Promise<uc.SetupAction | undefined> {
    const input = (msg as uc.UserDataResponse).inputValues || {};
    const action = String(input.action ?? input.choice ?? "").toLowerCase();
    const restoreModeSelected = parseBoolean(input.restore_from_backup, false);
    const restoreRequested = action === "restore" || restoreModeSelected;
    const restoreData = typeof input.restore_data === "string" && input.restore_data.trim() ? input.restore_data : input.backup_data;

    if (restoreModeSelected) {
      this.host.log.info("%s Detected manager-driven restore request%s", integrationName, restoreData ? " with payload" : " awaiting payload");
    }

    if (restoreRequested) {
      if (!restoreData) {
        return new uc.RequestUserInput("Restore data", [
          {
            id: "restore_data",
            label: { en: "Configuration Backup Data" },
            field: { textarea: { value: "" } }
          }
        ]);
      }
      return this.handleRestorePayload(restoreData);
    }

    const hasManualFields = Boolean(
      input.model ||
      input.ipAddress ||
      input.port ||
      input.queueThreshold ||
      input.albumArtURL ||
      input.listeningModeOptions ||
      input.inputSelectorOptions ||
      input.volumeScale ||
      input.volumeDisplay ||
      input.adjustVolumeDispl ||
      input.zoneCount ||
      input.createSensors ||
      input.netMenuDelay ||
      input.tuneinPresetPosition ||
      input.entityNameStyle
    );

    if (!action && hasManualFields) {
      try {
        return await this.handleManualConfiguration(input as ManualConfigInput);
      } catch (err) {
        this.host.log.error("%s Failed to save configuration:", integrationName, err);
        return new uc.SetupError("OTHER");
      }
    }

    if (!action && Object.prototype.hasOwnProperty.call(input, "restore_from_backup")) {
      return this.requestManualConfiguration();
    }

    if (!action) {
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

    if (action === "backup") {
      // Integration Manager uses a placeholder of "[]" when requesting a backup. Treat undefined/empty or placeholder as a request for us to generate and return the backup textarea instead of treating it as a completed request.
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
        input.inputSelectorOptions ||
        input.volumeScale ||
        input.volumeDisplay ||
        input.adjustVolumeDispl ||
        input.zoneCount ||
        input.createSensors ||
        input.netMenuDelay ||
        input.tuneinPresetPosition ||
        input.entityNameStyle
      );

      if (!hasManualFields) {
        return this.requestManualConfiguration();
      }

      // Has manual fields - validate and persist
      try {
        return await this.handleManualConfiguration(input as ManualConfigInput);
      } catch (err) {
        this.host.log.error("%s Failed to save configuration:", integrationName, err);
        return new uc.SetupError("OTHER");
      }
    }

    return undefined;
  }

  private requestManualConfiguration(): uc.RequestUserInput {
    const cfg = ConfigManager.load();
    const currentAvr = cfg.avrs && cfg.avrs.length > 0 ? cfg.avrs[0] : undefined;
    return buildManualConfigForm({
      modelName: currentAvr?.model ?? "",
      ipVal: currentAvr?.ip ?? "",
      portNum: currentAvr?.port ?? AVR_DEFAULTS.port,
      queueThresholdValue: currentAvr?.queueThreshold ?? AVR_DEFAULTS.queueThreshold,
      albumArtURLValue: currentAvr?.albumArtURL ?? AVR_DEFAULTS.albumArtURL,
      listeningModeOptions: Array.isArray(currentAvr?.listeningModeOptions) ? currentAvr.listeningModeOptions.join("; ") : currentAvr?.listeningModeOptions === null ? "none" : "",
      inputSelectorOptions: Array.isArray(currentAvr?.inputSelectorOptions) ? currentAvr.inputSelectorOptions.join("; ") : currentAvr?.inputSelectorOptions === null ? "none" : "",
      volumeScaleValue: currentAvr?.volumeScale ?? AVR_DEFAULTS.volumeScale,
      volumeDisplayValue: (currentAvr?.volumeDisplay ?? AVR_DEFAULTS.volumeDisplay) as "absolute" | "relative",
      adjustVolumeDisplValue: currentAvr?.adjustVolumeDispl ?? true,
      entityNameStyleValue: (currentAvr?.entityNameStyle ?? AVR_DEFAULTS.entityNameStyle) as "long" | "short",
      zoneCountValue: currentAvr && cfg.avrs ? cfg.avrs.filter((a) => a.model === currentAvr.model && a.ip === currentAvr.ip).length : 1,
      createSensorsValue: currentAvr?.createSensors ?? AVR_DEFAULTS.createSensors,
      netMenuDelayValue: currentAvr?.netMenuDelay ?? AVR_DEFAULTS.netMenuDelay,
      tuneinPresetPositionValue: currentAvr?.tuneinPresetPosition ?? AVR_DEFAULTS.tuneinPresetPosition
    });
  }

  private async handleBackupPayload(backup_data?: string): Promise<uc.SetupAction> {
    // Integration Manager sends a placeholder value of "[]" when requesting a backup. Treat undefined, empty or the placeholder as a request for us to produce the backup data.
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
          id: "restore_data",
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
        this.host.log.warn("%s Restore payload validation failed with %d error(s)", integrationName, validation.errors.length);
        return new uc.RequestUserInput("Restore data", [
          {
            id: "info",
            label: { en: "Restore validation errors" },
            field: { label: { value: { en: `Errors:\n- ${validation.errors.join("\n- ")}` } } }
          },
          {
            id: "restore_data",
            label: { en: "Configuration Backup Data" },
            field: { textarea: { value: raw } }
          }
        ]);
      }

      ConfigManager.save(validation.normalized as Partial<OnkyoConfig>);
      await this.host.onConfigSaved();
      this.host.log.info("%s Restore payload applied successfully", integrationName);
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

  private async handleManualConfiguration(input: ManualConfigInput): Promise<uc.SetupAction> {
    const cfg = parseManualInput(input);

    // Auto-discovery: user left both model and IP blank
    if (cfg.modelName === "" && cfg.ipVal === "") {
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
          zone: "main",
          volumeDisplay: cfg.volumeDisplayValue,
          entityNameStyle: cfg.entityNameStyleValue
        };

        // Use parseSelectOptions which handles the 'none' sentinel (-> null = don't create entity)
        const lmoResult = parseSelectOptions(cfg.listeningModeOptions);
        if (lmoResult === null || (Array.isArray(lmoResult) && lmoResult.length > 0)) {
          discoveredAvr.listeningModeOptions = lmoResult;
        }
        const isoResult = parseSelectOptions(cfg.inputSelectorOptions);
        if (isoResult === null || (Array.isArray(isoResult) && isoResult.length > 0)) {
          discoveredAvr.inputSelectorOptions = isoResult;
        }

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

    // Manual input: validate and save
    const basePayload = {
      model: cfg.modelName,
      ip: cfg.ipVal,
      port: cfg.portNum,
      queueThreshold: cfg.queueThresholdValue,
      albumArtURL: cfg.albumArtURLValue,
      listeningModeOptions: cfg.listeningModeOptions,
      inputSelectorOptions: cfg.inputSelectorOptions,
      volumeScale: cfg.volumeScaleValue,
      volumeDisplay: cfg.volumeDisplayValue,
      adjustVolumeDispl: cfg.adjustVolumeDisplValue,
      entityNameStyle: cfg.entityNameStyleValue,
      createSensors: cfg.createSensorsValue,
      netMenuDelay: cfg.netMenuDelayValue,
      tuneinPresetPosition: cfg.tuneinPresetPositionValue
    };

    const zones: AvrZone[] = ["main"];
    if (cfg.zoneCountValue >= 2) zones.push("zone2");
    if (cfg.zoneCountValue >= 3) zones.push("zone3");
    if (cfg.zoneCountValue >= 4) zones.push("zone4");

    const errors: string[] = [];
    const normalizedAvrs: AvrConfig[] = [];

    for (const zone of zones) {
      const res = ConfigManager.validateAvrPayload({ ...basePayload, zone });
      if (res.errors.length > 0) {
        errors.push(`zone ${zone}: ${res.errors.join("; ")}`);
      } else if (res.normalized) {
        normalizedAvrs.push(res.normalized);
      }
    }

    if (errors.length > 0) {
      return buildManualConfigForm({ ...cfg, errorMessage: `Errors:\n- ${errors.join("\n- ")}` });
    }

    for (const avrCfg of normalizedAvrs) {
      this.host.log.info(
        "%s Adding AVR config for zone %s with volumeScale: %d, volumeDisplay: %s, adjustVolumeDispl: %s, entityNameStyle: %s, createSensors: %s, netMenuDelay: %d, tuneinPresetPosition: %d",
        integrationName,
        avrCfg.zone,
        avrCfg.volumeScale,
        avrCfg.volumeDisplay,
        avrCfg.adjustVolumeDispl,
        avrCfg.entityNameStyle,
        avrCfg.createSensors,
        avrCfg.netMenuDelay,
        avrCfg.tuneinPresetPosition
      );
      ConfigManager.addAvr(avrCfg);
    }

    await this.host.onConfigSaved();
    return new uc.SetupComplete();
  }
}
