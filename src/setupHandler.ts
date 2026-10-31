/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import { ConfigManager, parseBoolean, LogLevel } from "./configManager.js";
import log from "./loggers.js";
import { ManualConfigParser, type ManualConfigInput } from "./manualConfigParser.js";
import { SetupFormBuilder } from "./setupFormBuilder.js";
import { BackupRestoreManager } from "./backupRestoreManager.js";
import { ConfigPersistenceManager } from "./configPersistenceManager.js";
import type { AvrInput } from "./inputSourceStore.js";
import { DISCOVERED_INPUT_SOURCE, DISCOVER_INPUT_SOURCE } from "./inputSourcePreferences.js";
import { IDLE_SETUP_PAGE, type SetupFlowPage } from "./setupFlowState.js";

const logSource = "setupHandler:";

type SetupHost = {
  driver: uc.IntegrationAPI;
  getConfigDirPath: () => string | undefined;
  onConfigSaved: () => Promise<void>;
  onConfigCleared: () => Promise<void>;
  log: typeof log;
  queryInputSources?: (config: { model: string; ip: string; port: number }) => Promise<{ inputs: AvrInput[]; available: boolean; model?: string; ip?: string; port?: number }>;
};

export default class SetupHandler {
  private host: SetupHost;
  private configParser: ManualConfigParser;
  private formBuilder: SetupFormBuilder;
  private backupRestoreManager: BackupRestoreManager;
  private persistenceManager: ConfigPersistenceManager;
  private setupPage: SetupFlowPage = IDLE_SETUP_PAGE;
  private pendingManualConfig: ManualConfigInput = {};
  private inputSourcePageCount = 0;
  private listeningModePageCount = 0;
  private inputSourcesOnlyConfiguration = false;
  private integrationOnlyConfiguration = false;
  private initialConfiguration = false;
  private selectedPhysicalAvr: string | undefined;

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

    // The confirmation form only submits confirm_delete_config; it does not repeat
    // the original choice field.
    if (parseBoolean(setupData.confirm_delete_config, false)) {
      return this.handleDeleteConfigPayload(true, true);
    }

    if (setupData && Object.prototype.hasOwnProperty.call(setupData, "choice")) {
      const selected = String(setupData.choice ?? "").toLowerCase();

      if (selected === "restore") return this.handleRestorePayload(setupData.restore_data ?? setupData.backup_data);
      if (selected === "backup") return this.handleBackupPayload(setupData.backup_data);
      if (selected === "delete_config") return this.handleDeleteConfigPayload(parseBoolean(setupData.confirm_delete_config, false), true);
      if (selected === "configure") return this.requestIntegrationConfiguration();
      if (selected === "configure_input_sources") return this.requestInputSourceConfiguration();
      if (selected === "configure_listening_modes") return this.requestListeningModeConfiguration();
    }

    if (!setupData || !Object.prototype.hasOwnProperty.call(setupData, "choice")) {
      return this.formBuilder.buildReconfigureForm();
    }

    return undefined;
  }

  private async handleDriverSetupInitial(): Promise<uc.SetupAction | undefined> {
    this.initialConfiguration = true;
    return this.formBuilder.buildInitialSetupForm();
  }

  private async handleUserDataResponse(msg: uc.UserDataResponse): Promise<uc.SetupAction | undefined> {
    const input = (msg as uc.UserDataResponse).inputValues || {};
    const action = String(input.action ?? input.choice ?? "").toLowerCase();
    const restoreModeSelected = parseBoolean(input.restore_from_backup, false);
    const hasRestoreData = typeof input.restore_data === "string" && input.restore_data.trim();
    const restoreData = hasRestoreData ? input.restore_data : input.backup_data;
    const restoreRequested = action === "restore" || restoreModeSelected || !!hasRestoreData;

    if (this.setupPage.kind === "selectAvr") {
      const selected = typeof input.selectedAvr === "string" ? input.selectedAvr : "";
      const configured = new Set((ConfigManager.get().avrs ?? []).map((avr) => `${avr.model} ${avr.ip}`));
      if (configured.has(selected)) {
        this.selectedPhysicalAvr = selected;
        if (this.setupPage.target === "listeningModes") return this.startListeningModeConfiguration(selected);
        return this.startInputSourceConfiguration(selected);
      }
      return this.formBuilder.buildAvrSelectionForm(this.setupPage.target, this.getPhysicalAvrChoices());
    }

    if (restoreRequested) {
      if (!restoreData) {
        return this.formBuilder.buildRestoreForm();
      }
      return this.handleRestorePayload(restoreData);
    }

    if (this.setupPage.kind !== "idle" && this.hasManualConfigFields(input)) {
      this.pendingManualConfig = { ...this.pendingManualConfig, ...input };
      if (Object.prototype.hasOwnProperty.call(input, "volumeScale") && this.pendingManualConfig.volumeScale !== undefined) {
        const previous = ConfigManager.load().avrs?.[0]?.volumeScale;
        if (previous !== undefined && String(input.volumeScale) !== String(previous)) this.pendingManualConfig.volumeScaleDiscovered = false;
      }
      const parsed = this.configParser.parse(this.pendingManualConfig, ConfigManager.get().logLevel ?? "warn");
      if (this.setupPage.kind === "manual" && this.setupPage.page === 1) {
        const discovery = this.host.queryInputSources
          ? await this.host.queryInputSources({
              model: String(this.pendingManualConfig.model ?? ""),
              ip: String(this.pendingManualConfig.ipAddress ?? ""),
              port: Number(this.pendingManualConfig.port ?? 60128)
            })
          : { inputs: [], available: false };
        if (discovery.model && discovery.ip) {
          this.pendingManualConfig = { ...this.pendingManualConfig, model: discovery.model, ipAddress: discovery.ip, port: discovery.port ?? 60128 };
        }
        this.pendingManualConfig = this.applyInputSourceDiscovery(this.pendingManualConfig, discovery.inputs, discovery.available);
        const refreshed = this.configParser.parse(this.pendingManualConfig, ConfigManager.get().logLevel ?? "warn");
        this.setupPage = { kind: "manual", page: 2 };
        return this.formBuilder.buildManualConfigPage2(refreshed);
      }
      if (this.setupPage.kind === "manual" && this.setupPage.page === 2) {
        this.setupPage = { kind: "manual", page: 3 };
        return this.formBuilder.buildManualConfigPage3(parsed);
      }

      if (this.setupPage.kind === "manual" && this.setupPage.page === 3) {
        if (this.integrationOnlyConfiguration || this.initialConfiguration) {
          return this.completePendingConfiguration("integration-only");
        }
        this.inputSourcePageCount = this.formBuilder.getInputSourcePageCount(parsed);
        this.listeningModePageCount = this.formBuilder.getListeningModePageCount();
        this.setupPage = this.inputSourcePageCount > 0 ? { kind: "inputSources", page: 1, total: this.inputSourcePageCount } : { kind: "listeningModes", page: 1, total: this.listeningModePageCount };
        return this.inputSourcePageCount > 0 ? this.formBuilder.buildInputSourcePage(parsed, 1, this.inputSourcePageCount) : this.formBuilder.buildListeningModePage(parsed, 1);
      }

      if (this.setupPage.kind === "inputSources") {
        if (this.setupPage.page < this.setupPage.total) {
          this.setupPage = { ...this.setupPage, page: this.setupPage.page + 1 };
          return this.formBuilder.buildInputSourcePage(parsed, this.setupPage.page, this.setupPage.total);
        }
        if (this.inputSourcesOnlyConfiguration) {
          return this.completePendingConfiguration("input-source");
        }
        this.setupPage = { kind: "listeningModes", page: 1, total: this.listeningModePageCount };
        return this.formBuilder.buildListeningModePage(parsed, 1);
      }

      if (this.setupPage.kind === "listeningModes") {
        if (this.setupPage.page < this.setupPage.total) {
          this.setupPage = { ...this.setupPage, page: this.setupPage.page + 1 };
          return this.formBuilder.buildListeningModePage(parsed, this.setupPage.page);
        }
      }

      return this.completePendingConfiguration("full");
    }

    const hasManualFields = this.hasManualConfigFields(input);

    if (!action && hasManualFields) {
      try {
        return await this.handleManualConfiguration(input as ManualConfigInput);
      } catch (err) {
        log.error("%s Failed to save configuration:", logSource, err);
        return new uc.SetupError("OTHER");
      }
    }

    if (!action && Object.prototype.hasOwnProperty.call(input, "restore_from_backup")) {
      return this.requestManualConfiguration();
    }

    if (!action) {
      const providedBackup = typeof input.backup_data === "string" ? String(input.backup_data).trim() : "";
      if (providedBackup && providedBackup !== "[]") return new uc.SetupComplete();
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
      return this.requestIntegrationConfiguration();
    }

    if (action === "configure_input_sources") {
      return this.requestInputSourceConfiguration();
    }

    if (action === "configure_listening_modes") {
      return this.requestListeningModeConfiguration();
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
      Object.keys(input).some((key) => key.startsWith("lmd_")) ||
      input.createDiracSelectEntity ||
      input.volumeScale ||
      input.useAvrReportedInputs !== undefined ||
      input.idInputSources !== undefined ||
      Object.keys(input).some((key) => key.startsWith("ids_")) ||
      input.volumeDisplay ||
      input.adjustVolumeDispl ||
      input.zoneCount ||
      input.createSensors ||
      input.createTunerPresets ||
      input.createRemoteEntity ||
      input.netMenuDelay ||
      input.tuneinPresetPosition ||
      input.tuneinMenuStyle ||
      input.inputSourceLayout ||
      input.networkInputMarker ||
      input.entityNameStyle ||
      input.logLevel
    );
  }

  private async completePendingConfiguration(context: string): Promise<uc.SetupAction> {
    this.setupPage = IDLE_SETUP_PAGE;
    this.integrationOnlyConfiguration = false;
    this.inputSourcesOnlyConfiguration = false;
    this.initialConfiguration = false;
    const completeConfig = this.pendingManualConfig;
    this.pendingManualConfig = {};
    try {
      return await this.handleManualConfiguration(completeConfig);
    } catch (err) {
      log.error("%s Failed to save %s configuration:", logSource, context, err);
      return new uc.SetupError("OTHER");
    }
  }

  private requestManualConfiguration(physicalAvrId?: string): uc.RequestUserInput {
    this.setupPage = { kind: "manual", page: 1 };
    this.inputSourcesOnlyConfiguration = false;
    this.integrationOnlyConfiguration = false;
    this.pendingManualConfig = {};
    const cfg = ConfigManager.load();
    const currentAvr = physicalAvrId
      ? cfg.avrs?.find((avr) => `${avr.model} ${avr.ip}` === physicalAvrId)
      : cfg.avrs && cfg.avrs.length > 0
        ? cfg.avrs[0]
        : undefined;
    this.selectedPhysicalAvr = currentAvr ? `${currentAvr.model} ${currentAvr.ip}` : physicalAvrId;
    const parsedConfig = this.configParser.parse(
      {
        model: currentAvr?.model ?? "",
        ipAddress: currentAvr?.ip ?? "",
        port: currentAvr?.port,
        queueThreshold: currentAvr?.queueThreshold,
        albumArtURL: currentAvr?.albumArtURL,
        listeningModePreferences: Object.fromEntries(Object.entries(currentAvr?.listeningModes ?? {}).map(([code, mode]) => [code, mode.setting])),
        listeningModeNames: Object.fromEntries(
          Object.entries(currentAvr?.listeningModes ?? {}).map(([code, mode]) => {
            const names = [...new Set((mode.contexts?.length ? mode.contexts.map((context) => context.name) : [mode.name]).filter(Boolean))];
            return [code, names.join(" / ")];
          })
        ),
        idInputSources: currentAvr?.idInputSources,
        volumeScale: currentAvr?.volumeScale,
        volumeScaleDiscovered: currentAvr?.volumeScaleDiscovered,
        useAvrReportedInputs: currentAvr?.useAvrReportedInputs,
        volumeDisplay: currentAvr?.volumeDisplay,
        adjustVolumeDispl: currentAvr?.adjustVolumeDispl,
        entityNameStyle: currentAvr?.entityNameStyle,
        zoneCount: currentAvr && cfg.avrs ? cfg.avrs.filter((a) => a.model === currentAvr.model && a.ip === currentAvr.ip).length : 1,
        createSensors: currentAvr?.createSensors,
        createTunerPresets: currentAvr?.createTunerPresets,
        createRemoteEntity: currentAvr?.createRemoteEntity,
        createDiracSelectEntity: currentAvr?.createDiracSelectEntity,
        netMenuDelay: currentAvr?.netMenuDelay,
        tuneinPresetPosition: currentAvr?.tuneinPresetPosition,
        tuneinMenuStyle: currentAvr?.tuneinMenuStyle,
        inputSourceLayout: currentAvr?.inputSourceLayout,
        networkInputMarker: currentAvr?.networkInputMarker,
        logLevel: cfg.logLevel ?? "warn"
      },
      (cfg.logLevel ?? "warn") as LogLevel
    );

    // Keep settings that are not shown on a later page, such as tuner presets.
    this.pendingManualConfig = {
      model: parsedConfig.modelName,
      ipAddress: parsedConfig.ipVal,
      port: parsedConfig.portNum,
      queueThreshold: parsedConfig.queueThresholdValue,
      albumArtURL: parsedConfig.albumArtURLValue,
      listeningModePreferences: parsedConfig.listeningModePreferences,
      listeningModeNames: parsedConfig.listeningModeNames,
      idInputSources: parsedConfig.idInputSources,
      volumeScale: parsedConfig.volumeScaleValue,
      volumeScaleDiscovered: parsedConfig.volumeScaleDiscoveredValue,
      useAvrReportedInputs: parsedConfig.useAvrReportedInputsValue,
      inputSources: parsedConfig.inputSources,
      inputSourceDiscoveryAvailable: parsedConfig.inputSourceDiscoveryAvailable,
      volumeDisplay: parsedConfig.volumeDisplayValue,
      adjustVolumeDispl: parsedConfig.adjustVolumeDisplValue,
      entityNameStyle: parsedConfig.entityNameStyleValue,
      zoneCount: parsedConfig.zoneCountValue,
      createSensors: parsedConfig.createSensorsValue,
      createTunerPresets: parsedConfig.createTunerPresetsValue,
      createRemoteEntity: parsedConfig.createRemoteEntityValue,
      createDiracSelectEntity: parsedConfig.createDiracSelectEntityValue,
      netMenuDelay: parsedConfig.netMenuDelayValue,
      tuneinPresetPosition: parsedConfig.tuneinPresetPositionValue,
      tuneinMenuStyle: parsedConfig.tuneinMenuStyleValue,
      inputSourceLayout: parsedConfig.inputSourceLayoutValue,
      networkInputMarker: parsedConfig.networkInputMarkerValue,
      logLevel: parsedConfig.logLevelValue
    };

    return this.formBuilder.buildManualConfigForm(parsedConfig);
  }

  private requestListeningModeConfiguration(): uc.RequestUserInput {
    const avrs = this.getPhysicalAvrChoices();
    if (avrs.length > 1) {
      this.setupPage = { kind: "selectAvr", target: "listeningModes" };
      return this.formBuilder.buildAvrSelectionForm("listeningModes", avrs);
    }
    return this.startListeningModeConfiguration(avrs[0]?.id);
  }

  private startListeningModeConfiguration(physicalAvrId?: string): uc.RequestUserInput {
    // Reuse the normal loader to populate pendingManualConfig with every existing setting, then
    // start directly at the first listening-mode page so other configuration is preserved.
    this.requestManualConfiguration(physicalAvrId);
    const parsed = this.configParser.parse(this.pendingManualConfig, ConfigManager.get().logLevel ?? "warn");
    // Page 4 is the first listening-mode page; mark it as already displayed so the next
    // response advances to page 5 instead of showing page 4 again.
    this.inputSourcePageCount = 0;
    this.listeningModePageCount = this.formBuilder.getListeningModePageCount();
    this.inputSourcesOnlyConfiguration = false;
    this.integrationOnlyConfiguration = false;
    this.setupPage = { kind: "listeningModes", page: 1, total: this.listeningModePageCount };
    return this.formBuilder.buildManualConfigPage4(parsed);
  }

  private async requestInputSourceConfiguration(): Promise<uc.RequestUserInput> {
    const avrs = this.getPhysicalAvrChoices();
    if (avrs.length > 1) {
      this.setupPage = { kind: "selectAvr", target: "inputSources" };
      return this.formBuilder.buildAvrSelectionForm("inputSources", avrs);
    }
    return this.startInputSourceConfiguration(avrs[0]?.id);
  }

  private async startInputSourceConfiguration(physicalAvrId?: string): Promise<uc.RequestUserInput> {
    this.requestManualConfiguration(physicalAvrId);
    const discovery = this.host.queryInputSources
      ? await this.host.queryInputSources({
          model: String(this.pendingManualConfig.model ?? ""),
          ip: String(this.pendingManualConfig.ipAddress ?? ""),
          port: Number(this.pendingManualConfig.port ?? 60128)
        })
      : { inputs: [], available: false };
    this.pendingManualConfig = this.applyInputSourceDiscovery(this.pendingManualConfig, discovery.inputs, discovery.available);
    const parsed = this.configParser.parse(this.pendingManualConfig, ConfigManager.get().logLevel ?? "warn");
    this.inputSourcePageCount = this.formBuilder.getInputSourcePageCount(parsed);
    this.listeningModePageCount = this.formBuilder.getListeningModePageCount();
    this.inputSourcesOnlyConfiguration = true;
    this.integrationOnlyConfiguration = false;
    this.setupPage = { kind: "inputSources", page: 1, total: this.inputSourcePageCount };
    return this.formBuilder.buildInputSourcePage(parsed, 1, this.inputSourcePageCount);
  }

  private getPhysicalAvrChoices(): Array<{ id: string; label: string }> {
    const choices = new Map<string, { id: string; label: string }>();
    for (const avr of ConfigManager.get().avrs ?? []) {
      const id = `${avr.model} ${avr.ip}`;
      if (!choices.has(id)) choices.set(id, { id, label: `${avr.model} — ${avr.ip}` });
    }
    return [...choices.values()];
  }

  private applyInputSourceDiscovery(config: ManualConfigInput, inputs: AvrInput[], available: boolean): ManualConfigInput {
    if (!available || inputs.length === 0) return { ...config, inputSources: inputs, inputSourceDiscoveryAvailable: available };
    const reportedIds = new Set(inputs.map((input) => input.id.toUpperCase()));
    const idInputSources = { ...((config.idInputSources as Record<string, { name: string; setting: string }> | undefined) ?? {}) };
    for (const id of reportedIds) {
      const entry = idInputSources[id];
      if (entry?.setting === DISCOVER_INPUT_SOURCE) {
        idInputSources[id] = { ...entry, setting: DISCOVERED_INPUT_SOURCE };
      }
    }
    return { ...config, idInputSources, inputSources: inputs, inputSourceDiscoveryAvailable: available };
  }

  private requestIntegrationConfiguration(): uc.RequestUserInput {
    const form = this.requestManualConfiguration();
    this.integrationOnlyConfiguration = true;
    return form;
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
    } catch (err) {
      log.error("%s Failed to restore configuration:", logSource, err);
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
    } catch (err) {
      log.error("%s Failed to clear configuration:", logSource, err);
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
