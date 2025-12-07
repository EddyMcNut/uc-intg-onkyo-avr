/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import EiscpDriver from "./eiscp.js";
import { ConfigManager, OnkyoConfig, AvrConfig } from "./configManager.js";
import { DEFAULT_QUEUE_THRESHOLD } from "./configManager.js";
import { OnkyoCommandSender } from "./onkyoCommandSender.js";
import { OnkyoCommandReceiver } from "./onkyoCommandReceiver.js";
import { EntityMigration } from "./entityMigration.js";

const integrationName = "Onkyo-Integration: ";

// Security: Maximum input lengths for setup fields
const MAX_LENGTHS = {
  MODEL_NAME: 50,
  IP_ADDRESS: 15,
  ALBUM_ART_URL: 250,
  PIN_CODE: 4
};

// Security: Validation patterns
const PATTERNS = {
  IP_ADDRESS: /^(\d{1,3}\.){3}\d{1,3}$/,
  MODEL_NAME: /^[a-zA-Z0-9\-_ ]+$/,
  ALBUM_ART_URL: /^[a-zA-Z0-9._\-/]+$/,
  PIN_CODE: /^\d{4}$/
};

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
  reconnectTimer?: NodeJS.Timeout;
}

interface AvrInstance {
  config: AvrConfig;
  commandSender: OnkyoCommandSender;
}

export default class OnkyoDriver {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private physicalConnections: Map<string, PhysicalAvrConnection> = new Map(); // One connection per physical AVR
  private avrInstances: Map<string, AvrInstance> = new Map(); // One instance per zone
  private remoteInStandby: boolean = false; // Track Remote standby state
  private lastSetupData: {
    queueThreshold: number;
    albumArtURL: string;
    volumeScale: number;
    useHalfDbSteps: boolean;
  } = {
    queueThreshold: DEFAULT_QUEUE_THRESHOLD,
    albumArtURL: "album_art.cgi",
    volumeScale: 100,
    useHalfDbSteps: true
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

    const model = (msg as any).setupData?.model;
    const ipAddress = (msg as any).setupData?.ipAddress;
    const port = (msg as any).setupData?.port;
    const queueThreshold = (msg as any).setupData?.queueThreshold;
    const albumArtURL = (msg as any).setupData?.albumArtURL;
    const volumeScale = (msg as any).setupData?.volumeScale;
    const useHalfDbSteps = (msg as any).setupData?.useHalfDbSteps;
    const zoneCount = (msg as any).setupData?.zoneCount;
    const remotePinCode = (msg as any).setupData?.remotePinCode;

    console.log(
      "%s Setup data received - volumeScale raw value: '%s' (type: %s), useHalfDbSteps: '%s' (type: %s), zoneCount: '%s'",
      integrationName,
      volumeScale,
      typeof volumeScale,
      useHalfDbSteps,
      typeof useHalfDbSteps,
      zoneCount
    );

    // Parse settings for this AVR
    const queueThresholdValue = queueThreshold && queueThreshold.toString().trim() !== "" ? parseInt(queueThreshold, 10) : DEFAULT_QUEUE_THRESHOLD;
    const albumArtURLValue = typeof albumArtURL === "string" && albumArtURL.trim() !== "" ? albumArtURL.trim() : "album_art.cgi";

    // Parse volumeScale - handle both string and number types
    let volumeScaleValue = 100; // Default
    if (volumeScale !== undefined && volumeScale !== null && volumeScale !== "") {
      const parsed = parseInt(volumeScale.toString(), 10);
      volumeScaleValue = !isNaN(parsed) && [80, 100].includes(parsed) ? parsed : 100;
    }

    // Parse useHalfDbSteps - handle both string and boolean types
    let useHalfDbStepsValue = true; // Default to true for backward compatibility
    if (useHalfDbSteps !== undefined && useHalfDbSteps !== null && useHalfDbSteps !== "") {
      if (typeof useHalfDbSteps === "boolean") {
        useHalfDbStepsValue = useHalfDbSteps;
      } else if (typeof useHalfDbSteps === "string") {
        useHalfDbStepsValue = useHalfDbSteps.toLowerCase() === "true";
      }
    }

    console.log("%s Setup data parsed - volumeScale: %d, useHalfDbSteps: %s", integrationName, volumeScaleValue, useHalfDbStepsValue);

    // Parse zoneCount
    const zoneCountValue = zoneCount && !isNaN(parseInt(zoneCount, 10)) ? parseInt(zoneCount, 10) : 1;
    console.log("%s Zone count: %d", integrationName, zoneCountValue);

    // Store setup data for use when adding autodiscovered AVRs
    this.lastSetupData = {
      queueThreshold: queueThresholdValue,
      albumArtURL: albumArtURLValue,
      volumeScale: volumeScaleValue,
      useHalfDbSteps: useHalfDbStepsValue
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
        const portNum = port && port.toString().trim() !== "" ? parseInt(port, 10) : 60128;
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
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
        const zones = ["main"];
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
            useHalfDbSteps: useHalfDbStepsValue
          };
          console.log("%s Adding AVR config for zone %s with volumeScale: %d, useHalfDbSteps: %s", integrationName, zone, avrConfig.volumeScale, avrConfig.useHalfDbSteps);
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

          const zones = ["main"];
          if (zoneCountValue >= 2) zones.push("zone2");
          if (zoneCountValue >= 3) zones.push("zone3");

          // Add discovered AVRs to config
          for (const discovered of discoveredAvrs) {
            for (const zone of zones) {
              const avrConfig: AvrConfig = {
                model: discovered.model,
                ip: discovered.host,
                port: parseInt(discovered.port, 10) || 60128,
                zone: zone,
                queueThreshold: queueThresholdValue,
                albumArtURL: albumArtURLValue,
                volumeScale: volumeScaleValue,
                useHalfDbSteps: useHalfDbStepsValue
              };
              console.log("%s Adding AVR config for zone %s with volumeScale: %d, useHalfDbSteps: %s", integrationName, zone, avrConfig.volumeScale, avrConfig.useHalfDbSteps);
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

    
    // Perform entity migration ONLY if:
    // 1. Remote PIN provided (user wants migration)
    // 2. At least one AVR entity is configured (entities exist to migrate)
    // This ensures user has already configured entities (first setup)
    // and is now reconfiguring with migration parameters (second setup)
    if (remotePinCode) {      
      // Security: Validate PIN code (must be exactly 4 digits)
      const pinTrimmed = remotePinCode.trim();
      if (!PATTERNS.PIN_CODE.test(pinTrimmed)) {
        console.error("%s Invalid PIN code format (must be exactly 4 digits)", integrationName);
        return new uc.SetupError("OTHER");
      }
      const configuredEntities = this.driver.getConfiguredEntities();
      const entities = configuredEntities ? configuredEntities.getEntities() : [];
      const hasConfiguredEntities = entities && entities.length > 0;
      if (hasConfiguredEntities) {
        console.log("%s Remote PIN provided, %d entities configured, attempting migration...", integrationName, entities.length);
        await this.performEntityMigration(pinTrimmed);
      } else {
        console.log("%s Remote PIN provided, but no entities configured yet", integrationName);
        console.log("%s Please configure entities first, then reconfigure integration with Remote PIN for migration", integrationName);
      }
    } else {
      console.log("%s No Remote PIN provided, skipping entity migration", integrationName);
    }

    // Now connect to the AVRs
    await this.handleConnect();

    return new uc.SetupComplete();
  }

  private registerAvailableEntities(): void {
    console.log("%s Registering available entities from config", integrationName);
    for (const avrConfig of this.config.avrs!) {
      const avrEntry = `${avrConfig.model} ${avrConfig.ip} ${avrConfig.zone}`;
      const mediaPlayerEntity = this.createMediaPlayerEntity(avrEntry, avrConfig.volumeScale ?? 100);
      this.driver.addAvailableEntity(mediaPlayerEntity);
      console.log("%s [%s] Entity registered as available", integrationName, avrEntry);
    }
  }

  private async performEntityMigration(remotePinCode: string): Promise<void> {
    console.log("%s Starting entity migration process...", integrationName);
    
    // EntityMigration with Remote PIN for authentication
    const migration = new EntityMigration(
      this.driver,
      this.config,
      remotePinCode
    );

    migration.logMigrationStatus();

    if (migration.needsMigration()) {
      console.log("%s Migration needed, performing entity replacement in activities...", integrationName);
      await migration.migrate();
    } else {
      console.log("%s No migration needed - no old entity mappings found", integrationName);
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
      for (const [physicalAVR, connection] of this.physicalConnections) {
        if (connection.reconnectTimer) {
          console.log(`${integrationName} [${physicalAVR}] Clearing reconnect timer due to standby`);
          clearTimeout(connection.reconnectTimer);
          connection.reconnectTimer = undefined;
        }
      }
      
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
          uc.MediaPlayerFeatures.Previous
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
      await new Promise((resolve) => setTimeout(resolve, queueThreshold));
    } catch (queryErr) {
      console.warn(`${integrationName} [${avrEntry}] Failed to query AVR state (${context}):`, queryErr);
    }
  }

  private scheduleReconnect(physicalAVR: string, physicalConnection: PhysicalAvrConnection, avrConfig: AvrConfig): void {
    // Clear any existing timer
    if (physicalConnection.reconnectTimer) {
      clearTimeout(physicalConnection.reconnectTimer);
    }

    console.log(`${integrationName} [${physicalAVR}] Scheduling reconnection attempt in 30 seconds...`);

    physicalConnection.reconnectTimer = setTimeout(async () => {
      console.log(`${integrationName} [${physicalAVR}] Attempting scheduled reconnection...`);

      // Don't reconnect if remote is in standby
      if (this.remoteInStandby) {
        console.log(`${integrationName} [${physicalAVR}] Remote in standby, canceling scheduled reconnection`);
        physicalConnection.reconnectTimer = undefined;
        return;
      }

      if (physicalConnection.eiscp.connected) {
        console.log(`${integrationName} [${physicalAVR}] Already reconnected, canceling scheduled attempt`);
        physicalConnection.reconnectTimer = undefined;
        return;
      }

      // Try reconnecting with progressive timeout (3 attempts: 3s, 5s, 8s)
      const timeouts = [3000, 5000, 8000];
      let reconnected = false;

      for (let attempt = 0; attempt < timeouts.length; attempt++) {
        try {
          console.log(
            "%s [%s] Scheduled reconnection attempt %d/%d (timeout: %dms)...",
            integrationName,
            physicalAVR,
            attempt + 1,
            timeouts.length,
            timeouts[attempt]
          );

          await physicalConnection.eiscp.connect({
            model: avrConfig.model,
            host: avrConfig.ip,
            port: avrConfig.port
          });

          await physicalConnection.eiscp.waitForConnect(timeouts[attempt]);

          console.log("%s [%s] Successfully reconnected to AVR via scheduled attempt", integrationName, physicalAVR);
          reconnected = true;

          // Query state for all zones of this AVR after successful reconnection
          let firstZone = true;
          for (const [avrEntry, instance] of this.avrInstances) {
            const entryPhysicalAVR = `${instance.config.model} ${instance.config.ip}`;
            if (entryPhysicalAVR === physicalAVR) {
              const queueThreshold = instance.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;
              // Wait between zones (except first) to give AVR time to process
              if (!firstZone) {
                await new Promise((resolve) => setTimeout(resolve, queueThreshold));
              }
              firstZone = false;
              await this.queryAvrState(avrEntry, physicalConnection.eiscp, "after scheduled reconnection");
            }
          }
          break;
        } catch (reconnectErr) {
          console.warn(
            "%s [%s] Scheduled reconnection attempt %d/%d failed: %s",
            integrationName,
            physicalAVR,
            attempt + 1,
            timeouts.length,
            reconnectErr
          );

          // If this was the last attempt, schedule another retry
          if (attempt === timeouts.length - 1) {
            console.log("%s [%s] All scheduled reconnection attempts failed, will retry again in 30 seconds", integrationName, physicalAVR);
            this.scheduleReconnect(physicalAVR, physicalConnection, avrConfig);
          }
        }
      }

      if (reconnected) {
        physicalConnection.reconnectTimer = undefined;
      }
    }, 30000); // 30 seconds
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
      const physicalAVR = `${avrConfig.model} ${avrConfig.ip}`;
      if (!uniqueAvrs.has(physicalAVR)) {
        uniqueAvrs.set(physicalAVR, avrConfig);
      }
    }

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
          send_delay: avrConfig.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD
        });

        // Create per-AVR config for command receiver (shared by all zones)
        const avrSpecificConfig: OnkyoConfig = {
          avrs: [avrConfig],
          queueThreshold: avrConfig.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD,
          albumArtURL: avrConfig.albumArtURL ?? "album_art.cgi",
          volumeScale: avrConfig.volumeScale ?? 100,
          useHalfDbSteps: avrConfig.useHalfDbSteps ?? true,
          // Backward compatibility fields for existing code
          model: avrConfig.model,
          ip: avrConfig.ip,
          port: avrConfig.port
        };

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
        eiscpInstance.on("error", (err: any) => {
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

        // Try reconnecting with progressive timeout (3 attempts: 3s, 5s, 8s)
        const timeouts = [3000, 5000, 8000];
        let reconnected = false;

        for (let attempt = 0; attempt < timeouts.length; attempt++) {
          try {
            console.log("%s [%s] Reconnection attempt %d/%d (timeout: %dms)...", integrationName, physicalAVR, attempt + 1, timeouts.length, timeouts[attempt]);

            // Start connection attempt
            await physicalConnection.eiscp.connect({
              model: avrConfig.model,
              host: avrConfig.ip,
              port: avrConfig.port
            });

            // Wait for the actual TCP connection to establish
            await physicalConnection.eiscp.waitForConnect(timeouts[attempt]);

            console.log("%s [%s] Successfully reconnected to AVR", integrationName, physicalAVR);
            reconnected = true;
            
            // Query state for all zones after successful reconnection
            let firstZone = true;
            for (const [avrEntry, instance] of this.avrInstances) {
              const entryPhysicalAVR = `${instance.config.model} ${instance.config.ip}`;
              if (entryPhysicalAVR === physicalAVR) {
                const queueThreshold = instance.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;
                // Wait between zones (except first) to give AVR time to process
                if (!firstZone) {
                  await new Promise((resolve) => setTimeout(resolve, queueThreshold));
                }
                firstZone = false;
                await this.queryAvrState(avrEntry, physicalConnection.eiscp, "after reconnection in handleConnect");
              }
            }
            break;
          } catch (reconnectErr) {
            console.warn("%s [%s] Reconnection attempt %d/%d failed: %s", integrationName, physicalAVR, attempt + 1, timeouts.length, reconnectErr);
          }
        }

        // Clear any existing reconnect timer if we successfully reconnected
        if (reconnected && physicalConnection.reconnectTimer) {
          clearTimeout(physicalConnection.reconnectTimer);
          physicalConnection.reconnectTimer = undefined;
        }

        if (!reconnected) {
          console.error("%s [%s] Failed to reconnect after all attempts", integrationName, physicalAVR);
        }
      }
    }

    // STEP 2: Create zone instances for all zones
    // NOTE: We need physical connections created first (even if they failed to connect)
    // because zone instances reference the shared eiscp from physical connection
    for (const avrConfig of this.config.avrs) {
      const physicalAVR = `${avrConfig.model} ${avrConfig.ip}`;
      const avrEntry = `${avrConfig.model} ${avrConfig.ip} ${avrConfig.zone}`;
      
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
      const avrSpecificConfig: OnkyoConfig = {
        avrs: [avrConfig],
        queueThreshold: avrConfig.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD,
        albumArtURL: avrConfig.albumArtURL ?? "album_art.cgi",
        volumeScale: avrConfig.volumeScale ?? 100,
        useHalfDbSteps: avrConfig.useHalfDbSteps ?? true,
        // Backward compatibility fields for existing code
        model: avrConfig.model,
        ip: avrConfig.ip,
        port: avrConfig.port
      };

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

    // Query state for all connected AVRs
    const queriedPhysicalAvrs = new Set<string>();
    for (const [avrEntry, instance] of this.avrInstances) {
      const physicalAVR = `${instance.config.model} ${instance.config.ip}`;
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
      for (const [physicalAVR, connection] of this.physicalConnections) {
        if (connection.reconnectTimer) {
          console.log(`${integrationName} [${physicalAVR}] Clearing reconnect timer due to integration disconnect`);
          clearTimeout(connection.reconnectTimer);
          connection.reconnectTimer = undefined;
        }
      }
      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
    });

    this.driver.on(uc.Events.SubscribeEntities, async (entityIds: string[]) => {
      console.log(`${integrationName} Entities subscribed: ${entityIds.join(', ')}`);
      
      // Clear standby flag when entities are subscribed
      this.remoteInStandby = false;
      
      // Query state for all subscribed entities that are connected
      for (const entityId of entityIds) {
        const instance = this.avrInstances.get(entityId);
        if (instance) {
          const physicalAVR = `${instance.config.model} ${instance.config.ip}`;
          const physicalConnection = this.physicalConnections.get(physicalAVR);
          if (physicalConnection?.eiscp.connected) {
            const queueThreshold = instance.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;
            console.log(`${integrationName} [${entityId}] Subscribed entity connected, querying state (threshold: ${queueThreshold}ms)`);
            await this.queryAvrState(entityId, physicalConnection.eiscp, "on subscribe");
          } else if (physicalConnection) {
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
              const queueThreshold = instance.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;
              await this.queryAvrState(entityId, physicalConnection.eiscp, "after subscription reconnection");
            } catch (err) {
              console.warn(`${integrationName} [${physicalAVR}] Failed to reconnect on subscription:`, err);
              // Schedule reconnection attempt
              this.scheduleReconnect(physicalAVR, physicalConnection, instance.config);
            }
          } else {
            console.log(`${integrationName} [${entityId}] Subscribed entity has no connection yet, waiting for Connect event`);
          }
        } else {
          console.log(`${integrationName} [${entityId}] Subscribed entity has no instance yet, waiting for Connect event`);
        }
      }
    });

    this.driver.on(uc.Events.UnsubscribeEntities, async (entityIds: string[]) => {
      entityIds.forEach((entityId: string) => {
        console.log(`${integrationName} [${entityId}] Unsubscribed entity`);
      });
    });
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
