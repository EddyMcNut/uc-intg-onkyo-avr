/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import { ConfigManager, parseBoolean, LogLevel } from "./configManager.js";
import log from "./loggers.js";
import { ManualConfigParser, type ManualConfigInput } from "./manualConfigParser.js";
import { SetupFormBuilder } from "./setupFormBuilder.js";
import { BackupRestoreManager } from "./backupRestoreManager.js";
import { ConfigPersistenceManager } from "./configPersistenceManager.js";

const _integrationName = "setupHandler:";

type SetupHost = {
  driver: uc.IntegrationAPI;
  getConfigDirPath: () => string | undefined;
  onConfigSaved: () => Promise<void>;
  onConfigCleared: () => Promise<void>;
  log: typeof log;
};

export default class SetupHandler {
  private host: SetupHost;
  private configParser: ManualConfigParser;
  private formBuilder: SetupFormBuilder;
  private backupRestoreManager: BackupRestoreManager;
  private persistenceManager: ConfigPersistenceManager;

  constructor(host: SetupHost) {
    this.host = host;
    this.configParser = new ManualConfigParser();
    this.formBuilder = new SetupFormBuilder();
    this.backupRestoreManager = new BackupRestoreManager();
    this.persistenceManager = new ConfigPersistenceManager(host.onConfigSaved);
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
      return this.formBuilder.buildReconfigureForm();
    }

    return undefined;
  }

  private async handleDriverSetupInitial(): Promise<uc.SetupAction | undefined> {
    return this.formBuilder.buildInitialSetupForm();
  }

  private async handleUserDataResponse(msg: uc.UserDataResponse): Promise<uc.SetupAction | undefined> {
    const input = (msg as uc.UserDataResponse).inputValues || {};
    const action = String(input.action ?? input.choice ?? "").toLowerCase();
    const restoreModeSelected = parseBoolean(input.restore_from_backup, false);
    const restoreRequested = action === "restore" || restoreModeSelected;
    const restoreData = typeof input.restore_data === "string" && input.restore_data.trim() ? input.restore_data : input.backup_data;

    if (restoreRequested) {
      if (!restoreData) {
        return this.formBuilder.buildRestoreForm();
      }
      return this.handleRestorePayload(restoreData);
    }

    const hasManualFields = this.hasManualConfigFields(input);

    if (!action && hasManualFields) {
      try {
        return await this.handleManualConfiguration(input as ManualConfigInput);
      } catch (_err) {
        return new uc.SetupError("OTHER");
      }
    }

    if (!action && Object.prototype.hasOwnProperty.call(input, "restore_from_backup")) {
      return this.requestManualConfiguration();
    }

    if (!action) {
      return this.formBuilder.buildReconfigureForm();
    }

    if (action === "backup") {
      const provided = typeof input.backup_data === "string" ? String(input.backup_data).trim() : "";
      if (provided && provided !== "[]") return new uc.SetupComplete();
      return this.handleBackupPayload(provided || undefined);
    }

    if (action === "delete_config") {
      if (!input.confirm_delete_config) {
        return this.formBuilder.buildDeleteConfirmForm();
      }
      return this.handleDeleteConfigPayload(true, false);
    }

    if (action === "configure") {
      const hasFields = this.hasManualConfigFields(input);
      if (!hasFields) {
        return this.requestManualConfiguration();
      }

      try {
        return await this.handleManualConfiguration(input as ManualConfigInput);
      } catch (_err) {
        return new uc.SetupError("OTHER");
      }
    }

    return undefined;
  }

  private hasManualConfigFields(input: Record<string, unknown>): boolean {
    return !!(
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
      input.tuneinMenuStyle ||
      input.entityNameStyle ||
      input.logLevel
    );
  }

  private requestManualConfiguration(): uc.RequestUserInput {
    const cfg = ConfigManager.load();
    const currentAvr = cfg.avrs && cfg.avrs.length > 0 ? cfg.avrs[0] : undefined;
    const parsedConfig = this.configParser.parse(
      {
        model: currentAvr?.model ?? "",
        ipAddress: currentAvr?.ip ?? "",
        port: currentAvr?.port,
        queueThreshold: currentAvr?.queueThreshold,
        albumArtURL: currentAvr?.albumArtURL,
        listeningModeOptions: Array.isArray(currentAvr?.listeningModeOptions) ? currentAvr.listeningModeOptions.join("; ") : currentAvr?.listeningModeOptions === null ? "none" : "",
        inputSelectorOptions: Array.isArray(currentAvr?.inputSelectorOptions) ? currentAvr.inputSelectorOptions.join("; ") : currentAvr?.inputSelectorOptions === null ? "none" : "",
        volumeScale: currentAvr?.volumeScale,
        volumeDisplay: currentAvr?.volumeDisplay,
        adjustVolumeDispl: currentAvr?.adjustVolumeDispl,
        entityNameStyle: currentAvr?.entityNameStyle,
        zoneCount: currentAvr && cfg.avrs ? cfg.avrs.filter((a) => a.model === currentAvr.model && a.ip === currentAvr.ip).length : 1,
        createSensors: currentAvr?.createSensors,
        netMenuDelay: currentAvr?.netMenuDelay,
        tuneinPresetPosition: currentAvr?.tuneinPresetPosition,
        tuneinMenuStyle: currentAvr?.tuneinMenuStyle,
        logLevel: cfg.logLevel ?? "warn"
      },
      (cfg.logLevel ?? "warn") as LogLevel
    );

    return this.formBuilder.buildManualConfigForm(parsedConfig);
  }

  private async handleBackupPayload(backup_data?: string): Promise<uc.SetupAction> {
    const provided = typeof backup_data === "string" ? backup_data.trim() : "";
    if (provided && provided !== "[]") return new uc.SetupComplete();

    const backupString = await this.backupRestoreManager.buildBackupString(this.host.getConfigDirPath);
    return this.formBuilder.buildBackupForm(backupString);
  }

  private async handleRestorePayload(rawData?: string): Promise<uc.SetupAction> {
    if (!rawData) {
      return this.formBuilder.buildRestoreForm();
    }

    try {
      const validation = this.backupRestoreManager.validateAndNormalizeRestorePayload(rawData);

      if (!validation.isValid) {
        return this.formBuilder.buildRestoreValidationErrorForm(validation.errors, rawData);
      }

      await this.persistenceManager.restoreConfiguration(validation.normalized!);
      return new uc.SetupComplete();
    } catch (_err) {
      return new uc.SetupError("OTHER");
    }
  }

  private async handleDeleteConfigPayload(confirm?: boolean, _reconfigureMode: boolean = false): Promise<uc.SetupAction> {
    if (!confirm) {
      return this.formBuilder.buildDeleteConfirmForm();
    }

    try {
      await this.host.onConfigCleared();
      return new uc.SetupComplete();
    } catch (_err) {
      return new uc.SetupError("OTHER");
    }
  }

  private async handleManualConfiguration(input: ManualConfigInput): Promise<uc.SetupAction> {
    const cfg = this.configParser.parse(input, ConfigManager.get().logLevel ?? "warn");

    // Auto-discovery: user left both model and IP blank
    if (cfg.modelName === "" && cfg.ipVal === "") {
      const discovered = await this.persistenceManager.performAutoDiscovery();
      if (!discovered.success) {
        return this.formBuilder.buildAutoDiscoveryFailedForm();
      }

      await this.persistenceManager.saveDiscoveredAvr(
        {
          model: discovered.model!,
          host: discovered.host!,
          port: discovered.port!
        },
        cfg
      );
      return new uc.SetupComplete();
    }

    // Manual input: validate and save
    const result = await this.persistenceManager.saveManualConfiguration(cfg);
    if (!result.success) {
      const parsedWithErrors = { ...cfg, errorMessage: `Errors:\n- ${result.errors.join("\n- ")}` };
      return this.formBuilder.buildManualConfigForm(parsedWithErrors);
    }

    return new uc.SetupComplete();
  }
}
