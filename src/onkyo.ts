/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import EiscpDriver from "./eiscp.js";
import { ConfigManager, setConfigDir, OnkyoConfig, AvrConfig, AvrZone, AVR_DEFAULTS, MAX_LENGTHS, PATTERNS, buildEntityId, buildPhysicalAvrId } from "./configManager.js";
import { DEFAULT_QUEUE_THRESHOLD } from "./configManager.js";
import { OnkyoCommandSender } from "./onkyoCommandSender.js";
import { OnkyoCommandReceiver } from "./onkyoCommandReceiver.js";
import { ReconnectionManager } from "./reconnectionManager.js";
import { Select, SelectStates, SelectAttributes, SelectCommands } from "./selectEntity.js";
import { eiscpCommands } from "./eiscp-commands.js";
import { eiscpMappings } from "./eiscp-mappings.js";
import { getCompatibleListeningModes } from "./listeningModeFilters.js";
import { avrStateManager } from "./state.js";
import log from "./loggers.js";

const integrationName = "driver:";

/** Parse a boolean value from string, boolean, or undefined */
function parseBoolean(value: unknown, defaultValue: boolean): boolean {
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

/** Parse an integer with validation and default */
function parseIntWithDefault(value: unknown, defaultValue: number, validator?: (n: number) => boolean): number {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const parsed = parseInt(String(value), 10);
  if (isNaN(parsed)) {
    return defaultValue;
  }
  if (validator && !validator(parsed)) {
    return defaultValue;
  }
  return parsed;
}

// Security: Helper function to validate IP addresses
function validateIpAddress(ip: string, fieldName: string): string | null {
  const trimmedIp = ip.trim();
  
  if (trimmedIp.length > MAX_LENGTHS.IP_ADDRESS) {
    log.error(`${integrationName} ${fieldName} too long`);
    return null;
  }
  
  if (!PATTERNS.IP_ADDRESS.test(trimmedIp)) {
    log.error(`${integrationName} Invalid ${fieldName} format`);
    return null;
  }
  
  // Validate IP octets are in valid range
  const octets = trimmedIp.split('.').map(Number);
  if (!octets.every((octet: number) => octet >= 0 && octet <= 255)) {
    log.error(`${integrationName} ${fieldName} octets out of range`);
    return null;
  }
  
  return trimmedIp;
}

interface PhysicalAvrConnection {
  eiscp: EiscpDriver;
  commandReceiver: OnkyoCommandReceiver;
}

interface AvrInstance {
  config: AvrConfig;
  commandSender: OnkyoCommandSender;
}

/** Setup data received from the Remote (raw input with union types) */
interface SetupData {
  model?: string;
  ipAddress?: string;
  port?: string | number;
  queueThreshold?: string | number;
  albumArtURL?: string;
  volumeScale?: string | number;
  adjustVolumeDispl?: string | boolean;
  zoneCount?: string | number;
  createSensors?: string | boolean;
  netMenuDelay?: string | number;
}

/** Parsed setup data with concrete types (after validation/conversion) */
interface ParsedSetupData {
  queueThreshold: number;
  albumArtURL: string;
  volumeScale: number;
  adjustVolumeDispl: boolean;
  createSensors: boolean;
  netMenuDelay: number;
}

export default class OnkyoDriver {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private physicalConnections: Map<string, PhysicalAvrConnection> = new Map(); // One connection per physical AVR
  private avrInstances: Map<string, AvrInstance> = new Map(); // One instance per zone
  private remoteInStandby: boolean = false; // Track Remote standby state
  private reconnectionManager: ReconnectionManager = new ReconnectionManager();
  private driverVersion: string = "unknown";
  private lastSetupData: ParsedSetupData = {
    queueThreshold: AVR_DEFAULTS.queueThreshold,
    albumArtURL: AVR_DEFAULTS.albumArtURL,
    volumeScale: AVR_DEFAULTS.volumeScale,
    adjustVolumeDispl: true,
    createSensors: AVR_DEFAULTS.createSensors,
    netMenuDelay: AVR_DEFAULTS.netMenuDelay
  };

  constructor() {
    this.driver = new uc.IntegrationAPI();
    // Initialize driver first so we can determine the correct config directory
    this.driver.init("driver.json", this.handleDriverSetup.bind(this));

    // Read driver version early so it's available when creating command receivers
    try {
      const fs = require('fs');
      const path = require('path');
      const driverJsonPath = path.resolve(process.cwd(), 'driver.json');
      const driverJsonRaw = fs.readFileSync(driverJsonPath, 'utf-8');
      const driverJson = JSON.parse(driverJsonRaw);
      this.driverVersion = driverJson.version || "unknown";
    } catch (err) {
      log.warn("%s Could not read driver version in constructor:", integrationName, err);
    }

    // Ensure ConfigManager uses the Integration API config dir so the Integration
    // Manager can back up and restore the same files
    try {
      const configDir = this.driver.getConfigDirPath();
      setConfigDir(configDir);
    } catch (err) {
      log.warn("%s Could not determine driver config directory, falling back to environment or CWD", integrationName);
    }

    // Now load config from the correct path and continue setup
    this.config = ConfigManager.load();
    this.setupDriverEvents();
    this.setupEventHandlers();
    log.info("Loaded config at startup:", this.config);

    // Register entities from config at startup (like Python integrations do)
    // This ensures entities survive reboots - they're registered before Connect event
    if (this.config.avrs && this.config.avrs.length > 0) {
      this.registerAvailableEntities();
    }
  }

  private async handleDriverSetup(msg: uc.SetupDriver): Promise<uc.SetupAction> {
    log.info("%s ===== SETUP HANDLER CALLED =====", integrationName);
    log.info("%s Setup message:", integrationName, JSON.stringify(msg, null, 2));

    // ----- Support Integration Manager backup/restore flow -----
    // Flow summary (how uc-intg-manager interacts):
    // 1) manager calls start_setup(reconfigure=true)
    // 2) manager calls get_setup() and expects a dropdown choice (id 'choice') to be present
    // 3) manager sends send_setup_input with { choice: <id>, action: 'backup', backup_data: '[]' }
    // 4) driver should respond with a page containing a textarea 'backup_data' with the backup JSON
    // For restore the manager will send action: 'restore' with backup_data containing the JSON to apply.

    if (msg instanceof uc.DriverSetupRequest && msg.reconfigure) {
      const setupData = (msg as uc.DriverSetupRequest).setupData ?? {};

      // If caller just started reconfigure and no choice selected, present backup/restore options
      if (!setupData || !Object.prototype.hasOwnProperty.call(setupData, "choice")) {
        // Provide a dropdown with default choice set to 'backup' so manager can pick it
        return new uc.RequestUserInput("Backup & Restore", [
          {
            id: "choice",
            label: { en: "Action" },
            field: {
              dropdown: {
                value: "backup",
                items: [
                  { id: "backup", label: { en: "Backup configuration" } },
                  { id: "restore", label: { en: "Restore configuration" } },
                  { id: "configure", label: { en: "Run regular setup" } }
                ]
              }
            }
          }
        ]);
      }
    }

    // If the UI submitted input values (e.g., manager sent action=backup/restore), handle them
    if (msg instanceof uc.UserDataResponse) {
      const input = (msg as uc.UserDataResponse).inputValues || {};
      const action = String(input.action ?? "").toLowerCase();

      if (action === "backup") {
        // Ensure latest config loaded from disk (useful if another module wrote the config file)
        try {
          ConfigManager.load();
        } catch (err) {
          log.warn(`${integrationName} Failed to reload config before backup:`, err);
        }

        // Build backup data - include current config and some metadata
        // Read driver.json safely (works in ESM runtime)
        let driverId = "unknown";
        let driverVersion = "unknown";
        try {
          const fs = await import('fs');
          const path = await import('path');
          const driverJsonPath = path.resolve(process.cwd(), 'driver.json');
          const driverJsonRaw = fs.readFileSync(driverJsonPath, 'utf-8');
          const driverJson = JSON.parse(driverJsonRaw);
          driverId = driverJson.driver_id || driverId;
          driverVersion = driverJson.version || driverVersion;
        } catch (err) {
          log.warn(`${integrationName} Could not read driver.json metadata for backup:`, err);
        }

        // Try to read the config directly from the driver's config path to avoid
        // any module-instance discrepancies (tests import modules in different
        // ways which can result in duplicate module instances with separate
        // static state). Fall back to ConfigManager.get() if file not present.
        let configData: any = {};
        try {
          const fs2 = await import('fs');
          const path2 = await import('path');
          const cfgPath = path2.resolve(this.driver.getConfigDirPath ? this.driver.getConfigDirPath() : process.cwd(), 'config.json');
          if (fs2.existsSync(cfgPath)) {
            const rawCfg = fs2.readFileSync(cfgPath, 'utf-8');
            configData = JSON.parse(rawCfg);
          } else {
            log.info('%s Config file not present at %s, falling back to ConfigManager.get()', integrationName, cfgPath);
            configData = ConfigManager.get();
          }
        } catch (err) {
          log.warn(`${integrationName} Failed to read config file for backup, falling back to in-memory ConfigManager:`, err);
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
        const backupString = JSON.stringify(backupPayload, null, 2);

        // Return a page containing the backup data in a textarea field (manager will extract it)
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

      if (action === "restore") {
        const raw = String(input.backup_data ?? "").trim();
        if (!raw) {
          log.warn("%s No backup_data provided for restore", integrationName);
          return new uc.SetupError("OTHER");
        }
        try {
          const parsed = JSON.parse(raw);
          // Expect either full payload {config: {...}} or bare config object
          const newConfig = parsed && parsed.config ? parsed.config : parsed;
          // Validate basic shape before applying
          if (!newConfig || (!Array.isArray((newConfig as any).avrs) && !newConfig.model && !newConfig.avrs)) {
            log.warn("%s Provided restore data does not look like a valid config", integrationName);
            return new uc.SetupError("OTHER");
          }

          // Apply and persist config
          ConfigManager.save(newConfig as Partial<OnkyoConfig>);

          // Reload runtime config and (re)register entities
          this.config = ConfigManager.load();
          this.registerAvailableEntities();

          // Optionally trigger connect to reflect new config immediately
          await this.handleConnect();

          return new uc.SetupComplete();
        } catch (err) {
          log.error("%s Failed to parse or apply restore data:", integrationName, err);
          return new uc.SetupError("OTHER");
        }
      }

      // If choice was 'configure', fall through to normal setup below (user wants to re-run setup)
      if (String(input.choice ?? "").toLowerCase() === "configure") {
        // Let the normal setup handling below proceed using any provided setup fields
      } else {
        // If no recognized action, fall back to showing the current setup page (continue to normal handler)
      }
    }

    // Normal setup path follows... (parse settings if provided)
    const setupData = (msg as unknown as { setupData?: SetupData }).setupData ?? {};
    const {
      model,
      ipAddress,
      port,
      queueThreshold,
      albumArtURL,
      volumeScale,
      adjustVolumeDispl,
      zoneCount,
      createSensors,
      netMenuDelay
    } = setupData;

    log.info(
      "%s Setup data received - volumeScale raw value: '%s' (type: %s), adjustVolumeDispl: '%s' (type: %s), zoneCount: '%s'",
      integrationName,
      volumeScale,
      typeof volumeScale,
      adjustVolumeDispl,
      typeof adjustVolumeDispl,
      zoneCount
    );

    // Parse settings using helper functions
    const queueThresholdValue = parseIntWithDefault(queueThreshold, AVR_DEFAULTS.queueThreshold);
    const albumArtURLValue = typeof albumArtURL === "string" && albumArtURL.trim() !== "" ? albumArtURL.trim() : AVR_DEFAULTS.albumArtURL;
    const volumeScaleValue = parseIntWithDefault(volumeScale, AVR_DEFAULTS.volumeScale, (n) => [80, 100].includes(n));
    const adjustVolumeDisplValue = parseBoolean(adjustVolumeDispl, true);
    const createSensorsValue = parseBoolean(createSensors, AVR_DEFAULTS.createSensors);
    const netMenuDelayValue = parseIntWithDefault(netMenuDelay, AVR_DEFAULTS.netMenuDelay);

    log.info("%s Setup data parsed - volumeScale: %d, adjustVolumeDispl: %s, createSensors: %s, netMenuDelay: %d", integrationName, volumeScaleValue, adjustVolumeDisplValue, createSensorsValue, netMenuDelayValue);

    // Parse zoneCount
    const zoneCountValue = parseIntWithDefault(zoneCount, 1, (n) => n >= 1 && n <= 3);
    log.info("%s Zone count: %d", integrationName, zoneCountValue);

    // Store setup data for use when adding autodiscovered AVRs
    this.lastSetupData = {
      queueThreshold: queueThresholdValue,
      albumArtURL: albumArtURLValue,
      volumeScale: volumeScaleValue,
      adjustVolumeDispl: adjustVolumeDisplValue,
      createSensors: createSensorsValue,
      netMenuDelay: netMenuDelayValue
    };
    log.info("%s Stored setup data for autodiscovery:", integrationName, this.lastSetupData);

    // Check if manual configuration was provided
    const hasManualConfig = typeof model === "string" && model.trim() !== "" && typeof ipAddress === "string" && ipAddress.trim() !== "";

    try {
      if (hasManualConfig) {
        // Security: Validate model name
        const modelName = model.trim();
        if (modelName.length > MAX_LENGTHS.MODEL_NAME) {
          log.error("%s Model name too long (%d chars), max %d", integrationName, modelName.length, MAX_LENGTHS.MODEL_NAME);
          return new uc.SetupError("OTHER");
        }
        if (!PATTERNS.MODEL_NAME.test(modelName)) {
          log.error("%s Model name contains invalid characters", integrationName);
          return new uc.SetupError("OTHER");
        }
        
        // Security: Validate IP address
        const ip = validateIpAddress(ipAddress, "IP address");
        if (!ip) {
          return new uc.SetupError("OTHER");
        }
        
        // Security: Validate port
        const portNum = parseIntWithDefault(port, AVR_DEFAULTS.port, (n) => n >= 1 && n <= 65535);
        if (portNum < 1 || portNum > 65535) {
          log.error("%s Invalid port number: %d", integrationName, portNum);
          return new uc.SetupError("OTHER");
        }
        
        // Security: Validate album art URL
        if (albumArtURLValue.length > MAX_LENGTHS.ALBUM_ART_URL) {
          log.error("%s Album art URL too long (%d chars), max %d", integrationName, albumArtURLValue.length, MAX_LENGTHS.ALBUM_ART_URL);
          return new uc.SetupError("OTHER");
        }
        if (!PATTERNS.ALBUM_ART_URL.test(albumArtURLValue)) {
          log.error("%s Album art URL contains invalid characters", integrationName);
          return new uc.SetupError("OTHER");
        }
        
        // Add manually configured AVR
        const zones: AvrZone[] = ["main"];
        if (zoneCountValue >= 2) zones.push("zone2");
        if (zoneCountValue >= 3) zones.push("zone3");

        for (const zone of zones) {
          const avrConfig: AvrConfig = {
            model: modelName,
            ip: ip,
            port: portNum,
            zone: zone,
            queueThreshold: queueThresholdValue,
            albumArtURL: albumArtURLValue,
            volumeScale: volumeScaleValue,
            adjustVolumeDispl: adjustVolumeDisplValue,
            createSensors: createSensorsValue,
            netMenuDelay: netMenuDelayValue
          };
          log.info("%s Adding AVR config for zone %s with volumeScale: %d, adjustVolumeDispl: %s, createSensors: %s, netMenuDelay: %d", integrationName, zone, avrConfig.volumeScale, avrConfig.adjustVolumeDispl, avrConfig.createSensors, avrConfig.netMenuDelay);
          ConfigManager.addAvr(avrConfig);
        }
      } else {
        // No manual config - run autodiscovery
        log.info("%s No manual AVR config provided, running autodiscovery during setup", integrationName);
        const tempEiscp = new EiscpDriver({ send_delay: DEFAULT_QUEUE_THRESHOLD });
        try {
          const discoveredAvrs = await tempEiscp.discover({ timeout: 5 });
          log.info("%s Discovered %d AVR(s) via autodiscovery", integrationName, discoveredAvrs.length);
          if (discoveredAvrs.length === 0) {
            log.error("%s No AVRs discovered during setup", integrationName);
            return new uc.SetupError("NOT_FOUND");
          }

          const zones: AvrZone[] = ["main"];
          if (zoneCountValue >= 2) zones.push("zone2");
          if (zoneCountValue >= 3) zones.push("zone3");

          // Add discovered AVRs to config
          for (const discovered of discoveredAvrs) {
            for (const zone of zones) {
              const avrConfig: AvrConfig = {
                model: discovered.model,
                ip: discovered.host,
                port: parseInt(discovered.port, 10) || AVR_DEFAULTS.port,
                zone: zone,
                queueThreshold: queueThresholdValue,
                albumArtURL: albumArtURLValue,
                volumeScale: volumeScaleValue,
                adjustVolumeDispl: adjustVolumeDisplValue,
                createSensors: createSensorsValue,
                netMenuDelay: netMenuDelayValue
              };
              log.info("%s Adding AVR config for zone %s with volumeScale: %d, adjustVolumeDispl: %s, createSensors: %s, netMenuDelay: %d", integrationName, zone, avrConfig.volumeScale, avrConfig.adjustVolumeDispl, avrConfig.createSensors, avrConfig.netMenuDelay);
              ConfigManager.addAvr(avrConfig);
            }
          }
        } catch (err) {
          log.error("%s Autodiscovery failed:", integrationName, err);
          return new uc.SetupError("NOT_FOUND");
        }
      }
    } catch (err) {
      log.error("%s Failed to save configuration:", integrationName, err);
      return new uc.SetupError("OTHER");
    }

    // Reload config and register entities (entities must be available before connect)
    this.config = ConfigManager.load();
    this.registerAvailableEntities();

    // Now connect to the AVRs
    await this.handleConnect();

    return new uc.SetupComplete();
  }

  private registerAvailableEntities(): void {
    log.info("%s Registering available entities from config", integrationName);
    for (const avrConfig of this.config.avrs!) {
      const avrEntry = buildEntityId(avrConfig.model, avrConfig.ip, avrConfig.zone);
      const mediaPlayerEntity = this.createMediaPlayerEntity(avrEntry, avrConfig.volumeScale ?? 100);
      this.driver.addAvailableEntity(mediaPlayerEntity);
      log.info("%s [%s] Media player entity registered as available", integrationName, avrEntry);
      
      // Register sensor entities only if createSensors is enabled (defaults to true for backward compatibility)
      if (avrConfig.createSensors !== false) {
        const sensorEntities = this.createSensorEntities(avrEntry);
        for (const sensor of sensorEntities) {
          this.driver.addAvailableEntity(sensor);
          log.info("%s [%s] Sensor entity registered: %s", integrationName, avrEntry, sensor.id);
        }
      } else {
        log.info("%s [%s] Sensor entities disabled by user preference", integrationName, avrEntry);
      }
      
      // Register Listening Mode select entity
      const listeningModeEntity = this.createListeningModeSelectEntity(avrEntry);
      this.driver.addAvailableEntity(listeningModeEntity);
      log.info("%s [%s] Listening Mode select entity registered", integrationName, avrEntry);
    }
  }

  private setupDriverEvents() {
    this.driver.on(uc.Events.Connect, async () => {
      log.info(`${integrationName} ===== CONNECT EVENT RECEIVED =====`);
      // Log current version from driver.json
      try {
        const fs = await import('fs');
        const path = await import('path');
        const driverJsonPath = path.resolve(process.cwd(), 'driver.json');
        const driverJsonRaw = fs.readFileSync(driverJsonPath, 'utf-8');
        const driverJson = JSON.parse(driverJsonRaw);
        this.driverVersion = driverJson.version || "unknown";
        log.info(`${integrationName} Driver version: ${this.driverVersion}`);
      } catch (err) {
        log.warn(`${integrationName} Could not read driver version from driver.json:`, err);
      }
      await this.handleConnect();
    });
    this.driver.on(uc.Events.EnterStandby, async () => {
      log.info(`${integrationName} ===== ENTER STANDBY EVENT RECEIVED =====`);
      this.remoteInStandby = true;
      log.info(`${integrationName} Remote entering standby, disconnecting AVR(s) to save battery...`);
      
      // Clear all reconnect timers
      this.reconnectionManager.cancelAllScheduledReconnections();
      
      // Disconnect all physical AVRs
      for (const [physicalAVR, connection] of this.physicalConnections) {
        if (connection.eiscp.connected) {
          try {
            log.info(`${integrationName} [${physicalAVR}] Disconnecting AVR for standby`);
            connection.eiscp.disconnect();
          } catch (err) {
            log.warn(`${integrationName} [${physicalAVR}] Error disconnecting AVR:`, err);
          }
        }
      }
      
      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
    });
    this.driver.on(uc.Events.ExitStandby, async () => {
      log.info (`${integrationName} ===== EXIT STANDBY EVENT RECEIVED =====`);
      this.remoteInStandby = false;
      await this.handleConnect();
    });
  }

  private createMediaPlayerEntity(avrEntry: string, volumeScale: number): uc.MediaPlayer {
    const mediaPlayerEntity = new uc.MediaPlayer(
      avrEntry,
      { en: avrEntry },
      {
        features: [
          uc.MediaPlayerFeatures.OnOff,
          uc.MediaPlayerFeatures.Toggle,
          uc.MediaPlayerFeatures.PlayPause,
          uc.MediaPlayerFeatures.MuteToggle,
          uc.MediaPlayerFeatures.Volume,
          uc.MediaPlayerFeatures.VolumeUpDown,
          uc.MediaPlayerFeatures.ChannelSwitcher,
          uc.MediaPlayerFeatures.SelectSource,
          uc.MediaPlayerFeatures.MediaTitle,
          uc.MediaPlayerFeatures.MediaArtist,
          uc.MediaPlayerFeatures.MediaAlbum,
          uc.MediaPlayerFeatures.MediaPosition,
          uc.MediaPlayerFeatures.MediaDuration,
          uc.MediaPlayerFeatures.MediaImageUrl,
          uc.MediaPlayerFeatures.Dpad,
          uc.MediaPlayerFeatures.Settings,
          uc.MediaPlayerFeatures.Home,
          uc.MediaPlayerFeatures.Next,
          uc.MediaPlayerFeatures.Previous,
          uc.MediaPlayerFeatures.Info
        ],
        attributes: {
          [uc.MediaPlayerAttributes.State]: uc.MediaPlayerStates.Unknown,
          [uc.MediaPlayerAttributes.Muted]: uc.MediaPlayerStates.Unknown,
          [uc.MediaPlayerAttributes.Volume]: 0,
          [uc.MediaPlayerAttributes.Source]: uc.MediaPlayerStates.Unknown,
          [uc.MediaPlayerAttributes.MediaType]: uc.MediaPlayerStates.Unknown
        },
        deviceClass: uc.MediaPlayerDeviceClasses.Receiver,
        options: {
          volume_steps: volumeScale
        }
      }
    );
    mediaPlayerEntity.setCmdHandler(this.sharedCmdHandler.bind(this));
    return mediaPlayerEntity;
  }

  private createSensorEntities(avrEntry: string): uc.Sensor[] {
    const sensors: uc.Sensor[] = [];

    const volumeSensor = new uc.Sensor(
      `${avrEntry}_volume_sensor`,
      { en: `${avrEntry} Volume` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: 0,
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {
          [uc.SensorOptions.Decimals]: 1,
          [uc.SensorOptions.MinValue]: 0,
          [uc.SensorOptions.MaxValue]: 200
        }
      }
    );
    sensors.push(volumeSensor);

    const audioInputSensor = new uc.Sensor(
      `${avrEntry}_audio_input_sensor`,
      { en: `${avrEntry} Audio Input` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: "",
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {}
      }
    );
    sensors.push(audioInputSensor);

    const audioOutputSensor = new uc.Sensor(
      `${avrEntry}_audio_output_sensor`,
      { en: `${avrEntry} Audio Output` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: "",
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {}
      }
    );
    sensors.push(audioOutputSensor);

    const sourceSensor = new uc.Sensor(
      `${avrEntry}_source_sensor`,
      { en: `${avrEntry} Source` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: "",
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {}
      }
    );
    sensors.push(sourceSensor);

    const videoInputSensor = new uc.Sensor(
      `${avrEntry}_video_input_sensor`,
      { en: `${avrEntry} Video Input` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: "",
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {}
      }
    );
    sensors.push(videoInputSensor);

    const videoOutputSensor = new uc.Sensor(
      `${avrEntry}_video_output_sensor`,
      { en: `${avrEntry} Video Output` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: "",
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {}
      }
    );
    sensors.push(videoOutputSensor);

    const outputDisplaySensor = new uc.Sensor(
      `${avrEntry}_output_display_sensor`,
      { en: `${avrEntry} Output Display` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: "",
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {}
      }
    );
    sensors.push(outputDisplaySensor);

    const frontPanelDisplaySensor = new uc.Sensor(
      `${avrEntry}_front_panel_display_sensor`,
      { en: `${avrEntry} Front Panel Display` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: "",
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {}
      }
    );
    sensors.push(frontPanelDisplaySensor);

    const muteSensor = new uc.Sensor(
      `${avrEntry}_mute_sensor`,
      { en: `${avrEntry} Mute` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: "",
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {}
      }
    );
    sensors.push(muteSensor);

    return sensors;
  }

  private getListeningModeOptions(audioFormat?: string): string[] {
    // Extract listening mode names from eiscpMappings, excluding control commands
    const lmdMappings = eiscpMappings.value_mappings.LMD;
    const excludeKeys = ["up", "down", "movie", "music", "game", "query"];
    
    const allModes = Object.keys(lmdMappings).filter(key => !excludeKeys.includes(key));
    
    // Filter by audio format if provided
    const compatibleModes = getCompatibleListeningModes(audioFormat);
    if (compatibleModes) {
      return allModes.filter(mode => compatibleModes.includes(mode)).sort();
    }
    
    return allModes.sort();
  }

  /**
   * Create Listening Mode select entity
   */
  private createListeningModeSelectEntity(avrEntry: string): Select {
    const options = this.getListeningModeOptions();
    
    const selectEntity = new Select(
      `${avrEntry}_listening_mode`,
      { en: `${avrEntry} Listening Mode` },
      {
        attributes: {
          state: SelectStates.On,
          current_option: "nee",
          options: options
        }
      }
    );
    
    selectEntity.setCmdHandler(this.handleListeningModeCmd.bind(this));
    return selectEntity;
  }

  /**
   * Handle Listening Mode select entity commands
   */
  private async handleListeningModeCmd(
    entity: uc.Entity,
    cmdId: string,
    params?: { [key: string]: string | number | boolean }
  ): Promise<uc.StatusCodes> {
    log.info("%s [%s] Listening Mode command: %s", integrationName, entity.id, cmdId, params);
    
    // Extract avrEntry from entity ID (format: "model_ip_zone_listening_mode")
    const avrEntry = entity.id.replace("_listening_mode", "");
    const instance = this.avrInstances.get(avrEntry);
    
    if (!instance) {
      log.error("%s [%s] No AVR instance found", integrationName, entity.id);
      return uc.StatusCodes.NotFound;
    }

    const physicalAVR = buildPhysicalAvrId(instance.config.model, instance.config.ip);
    const physicalConnection = this.physicalConnections.get(physicalAVR);
    
    if (!physicalConnection) {
      log.error("%s [%s] No physical connection found", integrationName, entity.id);
      return uc.StatusCodes.ServiceUnavailable;
    }

    // Check if connected, and trigger reconnection if needed (same logic as media player commands)
    if (!physicalConnection.eiscp.connected) {
      log.info("%s [%s] Command received while disconnected, triggering reconnection...", integrationName, entity.id);
      try {
        await physicalConnection.eiscp.connect({
          model: instance.config.model,
          host: instance.config.ip,
          port: instance.config.port
        });
        await physicalConnection.eiscp.waitForConnect(3000);
        log.info("%s [%s] Reconnected on command", integrationName, entity.id);
      } catch (connectErr) {
        log.warn("%s [%s] Failed to reconnect on command: %s", integrationName, entity.id, connectErr);
        // Fall through to retry logic below
      }
    }

    // Wait for connection with retries (same logic as media player commands)
    try {
      await physicalConnection.eiscp.waitForConnect();
    } catch (err) {
      log.warn("%s [%s] Could not send command, AVR not connected: %s", integrationName, entity.id, err);
      for (let attempt = 1; attempt <= 5; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          await physicalConnection.eiscp.waitForConnect();
          break;
        } catch (retryErr) {
          if (attempt === 5) {
            log.warn("%s [%s] Could not connect to AVR after 5 attempts: %s", integrationName, entity.id, retryErr);
            return uc.StatusCodes.Timeout;
          }
        }
      }
    }

    try {
      // Get current audio format for filtering
      const audioFormat = avrStateManager.getAudioFormat(avrEntry);
      const options = this.getListeningModeOptions(audioFormat !== "unknown" ? audioFormat : undefined);
      const currentAttrs = entity.attributes || {};
      const currentOption = currentAttrs[SelectAttributes.CurrentOption] as string || "";
      const queueThreshold = instance?.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;

      let newOption: string | undefined;

      switch (cmdId) {
        case SelectCommands.SelectOption:
          newOption = params?.option as string;
          break;
          
        case SelectCommands.SelectFirst:
          newOption = options[0];
          break;
          
        case SelectCommands.SelectLast:
          newOption = options[options.length - 1];
          break;
          
        case SelectCommands.SelectNext: {
          const currentIndex = options.indexOf(currentOption);
          if (currentIndex >= 0 && currentIndex < options.length - 1) {
            newOption = options[currentIndex + 1];
          } else if (params?.cycle === true) {
            newOption = options[0]; // Wrap to first
          }
          break;
        }
          
        case SelectCommands.SelectPrevious: {
          const currentIndex = options.indexOf(currentOption);
          if (currentIndex > 0) {
            newOption = options[currentIndex - 1];
          } else if (params?.cycle === true) {
            newOption = options[options.length - 1]; // Wrap to last
          }
          break;
        }
          
        default:
          log.warn("%s [%s] Unknown command: %s", integrationName, entity.id, cmdId);
          return uc.StatusCodes.BadRequest;
      }

      if (!newOption) {
        log.warn("%s [%s] No option selected", integrationName, entity.id);
        return uc.StatusCodes.BadRequest;
      }

      // Send the listening mode command to the AVR
      log.info("%s [%s] Setting listening mode to: %s", integrationName, entity.id, newOption);
      
      await physicalConnection.eiscp.command({zone: instance.config.zone, command: "listening-mode", args: newOption});

      // Update entity attributes
      this.driver.updateEntityAttributes(entity.id, {
        [SelectAttributes.CurrentOption]: newOption
      });

      return uc.StatusCodes.Ok;
    } catch (err) {
      log.error("%s [%s] Failed to set listening mode:", integrationName, entity.id, err);
      return uc.StatusCodes.ServerError;
    }
  }

  private async queryAvrState(avrEntry: string, eiscp: EiscpDriver, context: string): Promise<void> {
    if (!eiscp.connected) {
      log.warn(`${integrationName} [${avrEntry}] Cannot query AVR state (${context}), not connected`);
      return;
    }

    // Extract zone from avrEntry (format: "model ip zone")
    const instance = this.avrInstances.get(avrEntry);
    const zone = instance?.config.zone || "main";
    const queueThreshold = instance?.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;

    log.info(`${integrationName} [${avrEntry}] Querying AVR state for zone ${zone} (${context})...`);
    try {
      await eiscp.command({ zone, command: "system-power", args: "query" });
      await new Promise((resolve) => setTimeout(resolve, queueThreshold));
      await eiscp.command({ zone, command: "input-selector", args: "query" });
      await new Promise((resolve) => setTimeout(resolve, queueThreshold));
      await eiscp.command({ zone, command: "volume", args: "query" });
      await new Promise((resolve) => setTimeout(resolve, queueThreshold));
      await eiscp.command({ zone, command: "audio-muting", args: "query" });
      await new Promise((resolve) => setTimeout(resolve, queueThreshold));
      await eiscp.command({ zone, command: "listening-mode", args: "query" });
      await new Promise((resolve) => setTimeout(resolve, queueThreshold * 3));
      await eiscp.command({ zone, command: "fp-display", args: "query" });
    } catch (queryErr) {
      log.warn(`${integrationName} [${avrEntry}] Failed to query AVR state (${context}):`, queryErr);
    }
  }

  /** Query state for all zones of a physical AVR */
  private async queryAllZonesState(physicalAVR: string, eiscp: EiscpDriver, context: string): Promise<void> {
    let firstZone = true;
    for (const [avrEntry, instance] of this.avrInstances) {
      const entryPhysicalAVR = buildPhysicalAvrId(instance.config.model, instance.config.ip);
      if (entryPhysicalAVR === physicalAVR) {
        // For non-initial queries, only query zones that are powered on
        // Initial queries (after connection) will query all zones to get power state
        const isInitialQuery = context.includes("after reconnection") || context.includes("after connection");
        if (!isInitialQuery && !avrStateManager.isEntityOn(avrEntry)) {
          log.debug("%s [%s] Skipping query for zone in standby (%s)", integrationName, avrEntry, context);
          continue;
        }

        const queueThreshold = instance.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;
        // Wait between zones (except first) to give AVR time to process
        if (!firstZone) {
          await new Promise((resolve) => setTimeout(resolve, queueThreshold));
        }
        firstZone = false;
        await this.queryAvrState(avrEntry, eiscp, context);
      }
    }
  }

  private scheduleReconnect(physicalAVR: string, physicalConnection: PhysicalAvrConnection, avrConfig: AvrConfig): void {
    this.reconnectionManager.scheduleReconnection(
      physicalAVR,
      physicalConnection.eiscp,
      { model: avrConfig.model, host: avrConfig.ip, port: avrConfig.port },
      () => this.remoteInStandby || physicalConnection.eiscp.connected,
      async (avr) => this.queryAllZonesState(avr, physicalConnection.eiscp, "after scheduled reconnection")
    );
  }

  /** Create OnkyoConfig for a specific AVR zone */
  private createAvrSpecificConfig(avrConfig: AvrConfig): OnkyoConfig {
    return {
      avrs: [avrConfig],
      queueThreshold: avrConfig.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD,
      albumArtURL: avrConfig.albumArtURL ?? AVR_DEFAULTS.albumArtURL,
      volumeScale: avrConfig.volumeScale ?? AVR_DEFAULTS.volumeScale,
      adjustVolumeDispl: avrConfig.adjustVolumeDispl ?? true,
      // Backward compatibility fields for existing code
      model: avrConfig.model,
      ip: avrConfig.ip,
      port: avrConfig.port
    };
  }

  private async handleConnect() {
    // Reload config to get latest AVR list
    this.config = ConfigManager.load();

    // Connect to all configured AVRs
    if (!this.config.avrs || this.config.avrs.length === 0) {
      log.info("%s No AVRs configured", integrationName);
      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
      return;
    }

    // STEP 1: Create physical connections (one per unique IP)
    const uniqueAvrs = new Map<string, AvrConfig>();
    for (const avrConfig of this.config.avrs) {
      const physicalAVR = buildPhysicalAvrId(avrConfig.model, avrConfig.ip);
      if (!uniqueAvrs.has(physicalAVR)) {
        uniqueAvrs.set(physicalAVR, avrConfig);
      }
    }

    // Track which AVRs have already been queried (to avoid duplicate queries)
    const alreadyQueriedAvrs = new Set<string>();

    for (const [physicalAVR, avrConfig] of uniqueAvrs) {
      // Check if we already have a physical connection to this AVR
      let physicalConnection = this.physicalConnections.get(physicalAVR);

      if (!physicalConnection) {
        // Need to create a new physical connection
        log.info("%s [%s] Connecting to AVR at %s:%d", integrationName, avrConfig.model, avrConfig.ip, avrConfig.port);

        // Create EiscpDriver instance for this physical AVR (shared by all zones)
        const eiscpInstance = new EiscpDriver({
          host: avrConfig.ip,
          port: avrConfig.port,
          model: avrConfig.model,
          send_delay: avrConfig.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD,
          netMenuDelay: avrConfig.netMenuDelay ?? AVR_DEFAULTS.netMenuDelay
        });

        // Create per-AVR config for command receiver (shared by all zones)
        const avrSpecificConfig = this.createAvrSpecificConfig(avrConfig);

        // Create command receiver for this physical AVR (shared by all zones)
        const commandReceiver = new OnkyoCommandReceiver(this.driver, avrSpecificConfig, eiscpInstance, this.driverVersion);
        commandReceiver.setupEiscpListener();

        // ALWAYS store physical connection object (even if connection fails)
        // Zone instances need this object to reference the shared eiscp
        physicalConnection = {
          eiscp: eiscpInstance,
          commandReceiver
        };
        this.physicalConnections.set(physicalAVR, physicalConnection);

        // Setup error and close handlers
        eiscpInstance.on("error", (err: Error) => {
          log.error("%s [%s] EiscpDriver error:", integrationName, physicalAVR, err);
        });

        eiscpInstance.on("close", () => {
          log.warn("%s [%s] Connection to AVR lost", integrationName, physicalAVR);
        });

        // Now try to connect (but don't block zone instance creation if this fails)
        try {
          // Connect to the AVR
          const result = await eiscpInstance.connect({
            model: avrConfig.model,
            host: avrConfig.ip,
            port: avrConfig.port
          });

          if (!result || !result.model) {
            throw new Error("AVR connection failed or returned null");
          }

          // Wait for connection to fully establish
          await eiscpInstance.waitForConnect(3000);

          log.info("%s [%s] Connected to AVR", integrationName, physicalAVR);
        } catch (err) {
          log.error("%s [%s] Failed to connect to AVR:", integrationName, physicalAVR, err);
          log.info("%s [%s] Zone instances will be created but unavailable until connection succeeds", integrationName, physicalAVR);
          // Connection failed, but physicalConnection object exists so zone instances can be created
          // scheduleReconnect will retry the connection
          this.scheduleReconnect(physicalAVR, physicalConnection, avrConfig);
        }
      } else if (!physicalConnection.eiscp.connected) {
        // Physical connection exists but is disconnected, try to reconnect
        log.info("%s [%s] TCP connection lost, reconnecting to AVR...", integrationName, physicalAVR);

        const result = await this.reconnectionManager.attemptReconnection(
          physicalAVR,
          physicalConnection.eiscp,
          { model: avrConfig.model, host: avrConfig.ip, port: avrConfig.port },
          "Reconnection"
        );

        if (result.success) {
          // Cancel any scheduled reconnection since we're now connected
          this.reconnectionManager.cancelScheduledReconnection(physicalAVR);
          
          // Query state for all zones after successful reconnection
          await this.queryAllZonesState(physicalAVR, physicalConnection.eiscp, "after reconnection in handleConnect");
          alreadyQueriedAvrs.add(physicalAVR);
        }
      }
    }

    // STEP 2: Create zone instances for all zones
    // NOTE: We need physical connections created first (even if they failed to connect)
    // because zone instances reference the shared eiscp from physical connection
    for (const avrConfig of this.config.avrs) {
      const physicalAVR = buildPhysicalAvrId(avrConfig.model, avrConfig.ip);
      const avrEntry = buildEntityId(avrConfig.model, avrConfig.ip, avrConfig.zone);
      
      // Skip if zone instance already exists
      if (this.avrInstances.has(avrEntry)) {
        log.info("%s [%s] Zone instance already exists", integrationName, avrEntry);
        continue;
      }

      // Get the physical connection (it should exist from Phase 1, even if connection failed)
      const physicalConnection = this.physicalConnections.get(physicalAVR);
      
      if (!physicalConnection) {
        // This shouldn't happen since Phase 1 creates physicalConnection objects even on failure
        // But if it does, we can't create zone instance without the shared eiscp
        log.warn("%s [%s] Cannot create zone instance - no physical connection object exists", integrationName, avrEntry);
        continue;
      }

      // Create per-zone config for command sender
      const avrSpecificConfig = this.createAvrSpecificConfig(avrConfig);

      // Create command sender for this zone (uses shared eiscp from physical connection)
      const commandSender = new OnkyoCommandSender(this.driver, avrSpecificConfig, physicalConnection.eiscp);

      // Store zone instance (references shared eiscp)
      this.avrInstances.set(avrEntry, {
        config: avrConfig,
        commandSender
      });

      log.info("%s [%s] Zone instance created%s", integrationName, avrEntry, 
        physicalConnection.eiscp.connected ? " (connected)" : " (will connect when AVR available)");

      if (physicalConnection?.eiscp.connected) {
        log.info("%s [%s] Zone connected and available", integrationName, avrEntry);
      }
    }

    // Query state for all connected AVRs (skip those already queried during reconnection)
    const queriedPhysicalAvrs = new Set<string>();
    for (const [avrEntry, instance] of this.avrInstances) {
      const physicalAVR = buildPhysicalAvrId(instance.config.model, instance.config.ip);
      
      // Skip if this AVR was already queried during reconnection in Step 1
      if (alreadyQueriedAvrs.has(physicalAVR)) {
        continue;
      }
      
      const physicalConnection = this.physicalConnections.get(physicalAVR);
      if (physicalConnection) {
        const queueThreshold = instance.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;
        // If we already queried a zone for this physical AVR, wait before next zone
        if (queriedPhysicalAvrs.has(physicalAVR)) {
          await new Promise((resolve) => setTimeout(resolve, queueThreshold));
        }
        queriedPhysicalAvrs.add(physicalAVR);
        await this.queryAvrState(avrEntry, physicalConnection.eiscp, "after connection");
      }
    }

    if (this.avrInstances.size > 0) {
      await this.driver.setDeviceState(uc.DeviceStates.Connected);
    } else {
      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
    }
  }

  private async setupEventHandlers() {
    this.driver.on(uc.Events.Disconnect, async () => {
      // Clean up all reconnect timers when integration disconnects
      this.reconnectionManager.cancelAllScheduledReconnections();
      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
    });

    this.driver.on(uc.Events.SubscribeEntities, async (entityIds: string[]) => {
      log.info("%s Entities subscribed: %s", integrationName, entityIds.join(", "));

      // Clear standby flag when entities are subscribed
      this.remoteInStandby = false;

      // Query state for all subscribed entities that are connected
      for (const entityId of entityIds) {
        await this.handleEntitySubscription(entityId);
      }
    });

    this.driver.on(uc.Events.UnsubscribeEntities, async (entityIds: string[]) => {
      for (const entityId of entityIds) {
        log.info("%s [%s] Unsubscribed entity", integrationName, entityId);
      }
    });
  }

  /** Handle subscription for a single entity - attempts connection if needed */
  private async handleEntitySubscription(entityId: string): Promise<void> {
    const instance = this.avrInstances.get(entityId);
    if (!instance) {
      log.info("%s [%s] Subscribed entity has no instance yet, waiting for Connect event", integrationName, entityId);
      return;
    }

    const physicalAVR = buildPhysicalAvrId(instance.config.model, instance.config.ip);
    const physicalConnection = this.physicalConnections.get(physicalAVR);

    if (!physicalConnection) {
      log.info("%s [%s] Subscribed entity has no connection yet, waiting for Connect event", integrationName, entityId);
      return;
    }

    // Already connected - just query state
    if (physicalConnection.eiscp.connected) {
      const queueThreshold = instance.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;
      log.info("%s [%s] Subscribed entity connected, querying state (threshold: %dms)", integrationName, entityId, queueThreshold);
      await this.queryAvrState(entityId, physicalConnection.eiscp, "on subscribe");
      return;
    }

    // Connection exists but not connected - try to reconnect
    log.info("%s [%s] Subscribed entity not connected, attempting reconnection...", integrationName, entityId);
    try {
      await physicalConnection.eiscp.connect({
        model: instance.config.model,
        host: instance.config.ip,
        port: instance.config.port
      });
      await physicalConnection.eiscp.waitForConnect(3000);
      log.info("%s [%s] Reconnected on subscription", integrationName, physicalAVR);

      // Query state after reconnection
      await this.queryAvrState(entityId, physicalConnection.eiscp, "after subscription reconnection");
    } catch (err) {
      log.warn("%s [%s] Failed to reconnect on subscription: %s", integrationName, physicalAVR, err);
      // Schedule reconnection attempt
      this.scheduleReconnect(physicalAVR, physicalConnection, instance.config);
    }
  }

  // Use the sender class for command handling
  private async sharedCmdHandler(entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }): Promise<uc.StatusCodes> {
    // Get the AVR instance for this entity
    const instance = this.avrInstances.get(entity.id);
    if (!instance) {
      log.error("%s [%s] No AVR instance found for entity", integrationName, entity.id);
      return uc.StatusCodes.NotFound;
    }
    return instance.commandSender.sharedCmdHandler(entity, cmdId, params);
  }

  async init() {
    log.info("%s Initializing...", integrationName);
  }
}
