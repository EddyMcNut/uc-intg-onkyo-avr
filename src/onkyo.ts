/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import EiscpDriver from "./eiscp.js";
import { ConfigManager, OnkyoConfig, AvrConfig, AvrZone, AVR_DEFAULTS, MAX_LENGTHS, PATTERNS, buildEntityId, buildPhysicalAvrId } from "./configManager.js";
import { DEFAULT_QUEUE_THRESHOLD } from "./configManager.js";
import { OnkyoCommandSender } from "./onkyoCommandSender.js";
import { OnkyoCommandReceiver } from "./onkyoCommandReceiver.js";
import { ReconnectionManager } from "./reconnectionManager.js";

const integrationName = "Onkyo-Integration: ";

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
    console.error(`${integrationName}${fieldName} too long`);
    return null;
  }
  
  if (!PATTERNS.IP_ADDRESS.test(trimmedIp)) {
    console.error(`${integrationName}Invalid ${fieldName} format`);
    return null;
  }
  
  // Validate IP octets are in valid range
  const octets = trimmedIp.split('.').map(Number);
  if (!octets.every((octet: number) => octet >= 0 && octet <= 255)) {
    console.error(`${integrationName}${fieldName} octets out of range`);
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
    this.config = ConfigManager.load();
    this.driver.init("driver.json", this.handleDriverSetup.bind(this));
    this.setupDriverEvents();
    this.setupEventHandlers();
    console.log("Loaded config at startup:", this.config);

    // Register entities from config at startup (like Python integrations do)
    // This ensures entities survive reboots - they're registered before Connect event
    if (this.config.avrs && this.config.avrs.length > 0) {
      this.registerAvailableEntities();
    }
  }

  private async handleDriverSetup(msg: uc.SetupDriver): Promise<uc.SetupAction> {
    console.log("%s ===== SETUP HANDLER CALLED =====", integrationName);
    console.log("%s Setup message:", integrationName, JSON.stringify(msg, null, 2));

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

    console.log(
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

    console.log("%s Setup data parsed - volumeScale: %d, adjustVolumeDispl: %s, createSensors: %s, netMenuDelay: %d", integrationName, volumeScaleValue, adjustVolumeDisplValue, createSensorsValue, netMenuDelayValue);

    // Parse zoneCount
    const zoneCountValue = parseIntWithDefault(zoneCount, 1, (n) => n >= 1 && n <= 3);
    console.log("%s Zone count: %d", integrationName, zoneCountValue);

    // Store setup data for use when adding autodiscovered AVRs
    this.lastSetupData = {
      queueThreshold: queueThresholdValue,
      albumArtURL: albumArtURLValue,
      volumeScale: volumeScaleValue,
      adjustVolumeDispl: adjustVolumeDisplValue,
      createSensors: createSensorsValue,
      netMenuDelay: netMenuDelayValue
    };
    console.log("%s Stored setup data for autodiscovery:", integrationName, this.lastSetupData);

    // Check if manual configuration was provided
    const hasManualConfig = typeof model === "string" && model.trim() !== "" && typeof ipAddress === "string" && ipAddress.trim() !== "";

    try {
      if (hasManualConfig) {
        // Security: Validate model name
        const modelName = model.trim();
        if (modelName.length > MAX_LENGTHS.MODEL_NAME) {
          console.error("%s Model name too long (%d chars), max %d", integrationName, modelName.length, MAX_LENGTHS.MODEL_NAME);
          return new uc.SetupError("OTHER");
        }
        if (!PATTERNS.MODEL_NAME.test(modelName)) {
          console.error("%s Model name contains invalid characters", integrationName);
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
          console.error("%s Invalid port number: %d", integrationName, portNum);
          return new uc.SetupError("OTHER");
        }
        
        // Security: Validate album art URL
        if (albumArtURLValue.length > MAX_LENGTHS.ALBUM_ART_URL) {
          console.error("%s Album art URL too long (%d chars), max %d", integrationName, albumArtURLValue.length, MAX_LENGTHS.ALBUM_ART_URL);
          return new uc.SetupError("OTHER");
        }
        if (!PATTERNS.ALBUM_ART_URL.test(albumArtURLValue)) {
          console.error("%s Album art URL contains invalid characters", integrationName);
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
          console.log("%s Adding AVR config for zone %s with volumeScale: %d, adjustVolumeDispl: %s, createSensors: %s, netMenuDelay: %d", integrationName, zone, avrConfig.volumeScale, avrConfig.adjustVolumeDispl, avrConfig.createSensors, avrConfig.netMenuDelay);
          ConfigManager.addAvr(avrConfig);
        }
      } else {
        // No manual config - run autodiscovery
        console.log("%s No manual AVR config provided, running autodiscovery during setup", integrationName);
        const tempEiscp = new EiscpDriver({ send_delay: DEFAULT_QUEUE_THRESHOLD });
        try {
          const discoveredAvrs = await tempEiscp.discover({ timeout: 5 });
          console.log("%s Discovered %d AVR(s) via autodiscovery", integrationName, discoveredAvrs.length);

          if (discoveredAvrs.length === 0) {
            console.error("%s No AVRs discovered during setup", integrationName);
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
              console.log("%s Adding AVR config for zone %s with volumeScale: %d, adjustVolumeDispl: %s, createSensors: %s, netMenuDelay: %d", integrationName, zone, avrConfig.volumeScale, avrConfig.adjustVolumeDispl, avrConfig.createSensors, avrConfig.netMenuDelay);
              ConfigManager.addAvr(avrConfig);
            }
          }
        } catch (err) {
          console.error("%s Autodiscovery failed:", integrationName, err);
          return new uc.SetupError("NOT_FOUND");
        }
      }
    } catch (err) {
      console.error("%s Failed to save configuration:", integrationName, err);
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
    console.log("%s Registering available entities from config", integrationName);
    for (const avrConfig of this.config.avrs!) {
      const avrEntry = buildEntityId(avrConfig.model, avrConfig.ip, avrConfig.zone);
      const mediaPlayerEntity = this.createMediaPlayerEntity(avrEntry, avrConfig.volumeScale ?? 100);
      this.driver.addAvailableEntity(mediaPlayerEntity);
      console.log("%s [%s] Media player entity registered as available", integrationName, avrEntry);
      
      // Register sensor entities only if createSensors is enabled (defaults to true for backward compatibility)
      if (avrConfig.createSensors !== false) {
        const sensorEntities = this.createSensorEntities(avrEntry);
        for (const sensor of sensorEntities) {
          this.driver.addAvailableEntity(sensor);
          console.log("%s [%s] Sensor entity registered: %s", integrationName, avrEntry, sensor.id);
        }
      } else {
        console.log("%s [%s] Sensor entities disabled by user preference", integrationName, avrEntry);
      }
    }
  }

  private setupDriverEvents() {
    this.driver.on(uc.Events.Connect, async () => {
      console.log(`${integrationName} ===== CONNECT EVENT RECEIVED =====`);
      await this.handleConnect();
    });
    this.driver.on(uc.Events.EnterStandby, async () => {
      console.log(`${integrationName} ===== ENTER STANDBY EVENT RECEIVED =====`);
      this.remoteInStandby = true;
      console.log(`${integrationName} Remote entering standby, disconnecting AVR(s) to save battery...`);
      
      // Clear all reconnect timers
      this.reconnectionManager.cancelAllScheduledReconnections();
      
      // Disconnect all physical AVRs
      for (const [physicalAVR, connection] of this.physicalConnections) {
        if (connection.eiscp.connected) {
          try {
            console.log(`${integrationName} [${physicalAVR}] Disconnecting AVR for standby`);
            connection.eiscp.disconnect();
          } catch (err) {
            console.warn(`${integrationName} [${physicalAVR}] Error disconnecting AVR:`, err);
          }
        }
      }
      
      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
    });
    this.driver.on(uc.Events.ExitStandby, async () => {
      console.log(`${integrationName} ===== EXIT STANDBY EVENT RECEIVED =====`);
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

  private async queryAvrState(avrEntry: string, eiscp: EiscpDriver, context: string): Promise<void> {
    if (!eiscp.connected) {
      console.warn(`${integrationName} [${avrEntry}] Cannot query AVR state (${context}), not connected`);
      return;
    }

    // Extract zone from avrEntry (format: "model ip zone")
    const instance = this.avrInstances.get(avrEntry);
    const zone = instance?.config.zone || "main";
    const queueThreshold = instance?.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;

    console.log(`${integrationName} [${avrEntry}] Querying AVR state for zone ${zone} (${context})...`);
    try {
      await eiscp.command({ zone, command: "system-power", args: "query" });
      await new Promise((resolve) => setTimeout(resolve, queueThreshold));
      await eiscp.command({ zone, command: "input-selector", args: "query" });
      await new Promise((resolve) => setTimeout(resolve, queueThreshold));
      await eiscp.command({ zone, command: "volume", args: "query" });
      await new Promise((resolve) => setTimeout(resolve, queueThreshold));
      await eiscp.command({ zone, command: "audio-muting", args: "query" });
      await new Promise((resolve) => setTimeout(resolve, queueThreshold * 3));
      await eiscp.command({ zone, command: "fp-display", args: "query" });
    } catch (queryErr) {
      console.warn(`${integrationName} [${avrEntry}] Failed to query AVR state (${context}):`, queryErr);
    }
  }

  /** Query state for all zones of a physical AVR */
  private async queryAllZonesState(physicalAVR: string, eiscp: EiscpDriver, context: string): Promise<void> {
    let firstZone = true;
    for (const [avrEntry, instance] of this.avrInstances) {
      const entryPhysicalAVR = buildPhysicalAvrId(instance.config.model, instance.config.ip);
      if (entryPhysicalAVR === physicalAVR) {
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
      console.log("%s No AVRs configured", integrationName);
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
        console.log("%s [%s] Connecting to AVR at %s:%d", integrationName, avrConfig.model, avrConfig.ip, avrConfig.port);

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
        const commandReceiver = new OnkyoCommandReceiver(this.driver, avrSpecificConfig, eiscpInstance);
        commandReceiver.setupEiscpListener();

        // ALWAYS store physical connection object (even if connection fails)
        // Zone instances need this object to reference the shared eiscp
        physicalConnection = {
          eiscp: eiscpInstance,
          commandReceiver
        };
        this.physicalConnections.set(physicalAVR, physicalConnection);

        // Setup error handler
        eiscpInstance.on("error", (err: Error) => {
          console.error("%s [%s] EiscpDriver error:", integrationName, physicalAVR, err);
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

          console.log("%s [%s] Connected to AVR", integrationName, physicalAVR);
        } catch (err) {
          console.error("%s [%s] Failed to connect to AVR:", integrationName, physicalAVR, err);
          console.log("%s [%s] Zone instances will be created but unavailable until connection succeeds", integrationName, physicalAVR);
          // Connection failed, but physicalConnection object exists so zone instances can be created
          // scheduleReconnect will retry the connection
          this.scheduleReconnect(physicalAVR, physicalConnection, avrConfig);
        }
      } else if (!physicalConnection.eiscp.connected) {
        // Physical connection exists but is disconnected, try to reconnect
        console.log("%s [%s] TCP connection lost, reconnecting to AVR...", integrationName, physicalAVR);

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
        console.log("%s [%s] Zone instance already exists", integrationName, avrEntry);
        continue;
      }

      // Get the physical connection (it should exist from Phase 1, even if connection failed)
      const physicalConnection = this.physicalConnections.get(physicalAVR);
      
      if (!physicalConnection) {
        // This shouldn't happen since Phase 1 creates physicalConnection objects even on failure
        // But if it does, we can't create zone instance without the shared eiscp
        console.warn("%s [%s] Cannot create zone instance - no physical connection object exists", integrationName, avrEntry);
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

      console.log("%s [%s] Zone instance created%s", integrationName, avrEntry, 
        physicalConnection.eiscp.connected ? " (connected)" : " (will connect when AVR available)");

      if (physicalConnection?.eiscp.connected) {
        console.log("%s [%s] Zone connected and available", integrationName, avrEntry);
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
      console.log(`${integrationName} Entities subscribed: ${entityIds.join(", ")}`);

      // Clear standby flag when entities are subscribed
      this.remoteInStandby = false;

      // Query state for all subscribed entities that are connected
      for (const entityId of entityIds) {
        await this.handleEntitySubscription(entityId);
      }
    });

    this.driver.on(uc.Events.UnsubscribeEntities, async (entityIds: string[]) => {
      for (const entityId of entityIds) {
        console.log(`${integrationName} [${entityId}] Unsubscribed entity`);
      }
    });
  }

  /** Handle subscription for a single entity - attempts connection if needed */
  private async handleEntitySubscription(entityId: string): Promise<void> {
    const instance = this.avrInstances.get(entityId);
    if (!instance) {
      console.log(`${integrationName} [${entityId}] Subscribed entity has no instance yet, waiting for Connect event`);
      return;
    }

    const physicalAVR = buildPhysicalAvrId(instance.config.model, instance.config.ip);
    const physicalConnection = this.physicalConnections.get(physicalAVR);

    if (!physicalConnection) {
      console.log(`${integrationName} [${entityId}] Subscribed entity has no connection yet, waiting for Connect event`);
      return;
    }

    // Already connected - just query state
    if (physicalConnection.eiscp.connected) {
      const queueThreshold = instance.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;
      console.log(`${integrationName} [${entityId}] Subscribed entity connected, querying state (threshold: ${queueThreshold}ms)`);
      await this.queryAvrState(entityId, physicalConnection.eiscp, "on subscribe");
      return;
    }

    // Connection exists but not connected - try to reconnect
    console.log(`${integrationName} [${entityId}] Subscribed entity not connected, attempting reconnection...`);
    try {
      await physicalConnection.eiscp.connect({
        model: instance.config.model,
        host: instance.config.ip,
        port: instance.config.port
      });
      await physicalConnection.eiscp.waitForConnect(3000);
      console.log(`${integrationName} [${physicalAVR}] Reconnected on subscription`);

      // Query state after reconnection
      await this.queryAvrState(entityId, physicalConnection.eiscp, "after subscription reconnection");
    } catch (err) {
      console.warn(`${integrationName} [${physicalAVR}] Failed to reconnect on subscription:`, err);
      // Schedule reconnection attempt
      this.scheduleReconnect(physicalAVR, physicalConnection, instance.config);
    }
  }

  // Use the sender class for command handling
  private async sharedCmdHandler(entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }): Promise<uc.StatusCodes> {
    // Get the AVR instance for this entity
    const instance = this.avrInstances.get(entity.id);
    if (!instance) {
      console.error("%s [%s] No AVR instance found for entity", integrationName, entity.id);
      return uc.StatusCodes.NotFound;
    }
    return instance.commandSender.sharedCmdHandler(entity, cmdId, params);
  }

  async init() {
    console.log("%s Initializing...", integrationName);
  }
}
