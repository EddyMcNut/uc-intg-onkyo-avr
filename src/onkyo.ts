/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import EiscpDriver from "./eiscp.js";
import { ConfigManager, OnkyoConfig, AvrConfig } from "./configManager.js";
import { DEFAULT_QUEUE_THRESHOLD } from "./configManager.js";
import { OnkyoCommandSender } from "./onkyoCommandSender.js";
import { OnkyoCommandReceiver } from "./onkyoCommandReceiver.js";

const integrationName = "Onkyo-Integration: ";

interface AvrInstance {
  config: AvrConfig;
  eiscp: EiscpDriver;
  commandSender: OnkyoCommandSender;
  commandReceiver: OnkyoCommandReceiver;
  reconnectTimer?: NodeJS.Timeout;
}

export default class OnkyoDriver {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private avrInstances: Map<string, AvrInstance> = new Map();
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

    // Auto-register entities after startup if config has AVRs
    if (this.config.avrs && this.config.avrs.length > 0) {
      this.handleConnect();
    } else {
      console.log("Config missing or incomplete, waiting for setup.");
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
    const queueThresholdValue =
      queueThreshold && queueThreshold.toString().trim() !== ""
        ? parseInt(queueThreshold, 10)
        : DEFAULT_QUEUE_THRESHOLD;
    const albumArtURLValue =
      typeof albumArtURL === "string" && albumArtURL.trim() !== "" ? albumArtURL.trim() : "album_art.cgi";

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

    console.log(
      "%s Setup data parsed - volumeScale: %d, useHalfDbSteps: %s",
      integrationName,
      volumeScaleValue,
      useHalfDbStepsValue
    );

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
    const hasManualConfig = typeof model === "string" && model.trim() !== "" && 
                           typeof ipAddress === "string" && ipAddress.trim() !== "";

    try {
      if (hasManualConfig) {
        // Add manually configured AVR
        const portNum = port && port.toString().trim() !== "" ? parseInt(port, 10) : 60128;
              const zones = ["main"];
      if (zoneCountValue >= 2) zones.push("zone2");
      if (zoneCountValue >= 3) zones.push("zone3");

      for (const zone of zones) {
        const avrConfig: AvrConfig = {
          model: model.trim(),
          ip: ipAddress.trim(),
          port: isNaN(portNum) ? 60128 : portNum,
          zone: zone,
          queueThreshold: queueThresholdValue,
          albumArtURL: albumArtURLValue,
          volumeScale: volumeScaleValue,
          useHalfDbSteps: useHalfDbStepsValue
        };
        console.log(
          "%s Adding AVR config for zone %s with volumeScale: %d, useHalfDbSteps: %s",
          integrationName,
          zone,
          avrConfig.volumeScale,
          avrConfig.useHalfDbSteps
        );
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
        console.log(
          "%s Adding AVR config for zone %s with volumeScale: %d, useHalfDbSteps: %s",
          integrationName,
          zone,
          avrConfig.volumeScale,
          avrConfig.useHalfDbSteps
        );
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

    await this.handleConnect();

    return new uc.SetupComplete();
  }

  private setupDriverEvents() {
    this.driver.on(uc.Events.Connect, this.handleConnect.bind(this));
    this.driver.on(uc.Events.ExitStandby, this.handleConnect.bind(this));
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

    console.log(`${integrationName} [${avrEntry}] Querying AVR state (${context})...`);
    try {
      await eiscp.command("system-power query");
      await eiscp.command("input-selector query");
      await eiscp.command("volume query");
      await eiscp.command("audio-muting query");
    } catch (queryErr) {
      console.warn(`${integrationName} [${avrEntry}] Failed to query AVR state (${context}):`, queryErr);
    }
  }

  // private scheduleReconnect(avrEntry: string, instance: AvrInstance): void {
  //   // Clear any existing timer
  //   if (instance.reconnectTimer) {
  //     clearTimeout(instance.reconnectTimer);
  //   }

  //   console.log(`${integrationName} [${avrEntry}] Scheduling reconnection attempt in 30 seconds...`);
    
  //   instance.reconnectTimer = setTimeout(async () => {
  //     console.log(`${integrationName} [${avrEntry}] Attempting scheduled reconnection...`);
      
  //     if (instance.eiscp.connected) {
  //       console.log(`${integrationName} [${avrEntry}] Already reconnected, canceling scheduled attempt`);
  //       instance.reconnectTimer = undefined;
  //       return;
  //     }

  //     // Try reconnecting with progressive timeout (3 attempts: 3s, 5s, 8s)
  //     const timeouts = [3000, 5000, 8000];
  //     let reconnected = false;
      
  //     for (let attempt = 0; attempt < timeouts.length; attempt++) {
  //       try {
  //         console.log(
  //           "%s [%s] Scheduled reconnection attempt %d/%d (timeout: %dms)...",
  //           integrationName,
  //           avrEntry,
  //           attempt + 1,
  //           timeouts.length,
  //           timeouts[attempt]
  //         );
          
  //         await instance.eiscp.connect({
  //           model: instance.config.model,
  //           host: instance.config.ip,
  //           port: instance.config.port
  //         });
          
  //         await instance.eiscp.waitForConnect(timeouts[attempt]);
          
  //         console.log("%s [%s] Successfully reconnected to AVR via scheduled attempt", integrationName, avrEntry);
  //         reconnected = true;
          
  //         // Query state after successful reconnection
  //         await this.queryAvrState(avrEntry, instance.eiscp, "after scheduled reconnection");
  //         break;
  //       } catch (reconnectErr) {
  //         console.warn(
  //           "%s [%s] Scheduled reconnection attempt %d/%d failed: %s",
  //           integrationName,
  //           avrEntry,
  //           attempt + 1,
  //           timeouts.length,
  //           reconnectErr
  //         );
          
  //         // If this was the last attempt, schedule another retry
  //         if (attempt === timeouts.length - 1) {
  //           console.log("%s [%s] All scheduled reconnection attempts failed, will retry again in 30 seconds", integrationName, avrEntry);
  //           this.scheduleReconnect(avrEntry, instance);
  //         }
  //       }
  //     }
      
  //     if (reconnected) {
  //       instance.reconnectTimer = undefined;
  //     }
  //   }, 30000); // 30 seconds
  // }

  private async handleConnect() {
    // Reload config to get latest AVR list
    this.config = ConfigManager.load();

    // Connect to all configured AVRs
    if (!this.config.avrs || this.config.avrs.length === 0) {
      console.log("%s No AVRs configured", integrationName);
      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
      return;
    }

    // Collect entities to register after all connections are established
    const entitiesToRegister: uc.MediaPlayer[] = [];

    for (const avrConfig of this.config.avrs) {
      const physicalAVR = `${avrConfig.model} ${avrConfig.ip}`;
      const avrEntry = `${avrConfig.model} ${avrConfig.ip} ${avrConfig.zone}`;

      // If already connected, re-register the entity for remote reconnect scenarios
      if (this.avrInstances.has(avrEntry)) {
        console.log("%s [%s] Known instance, preparing for re-registration", integrationName, avrEntry);
        const instance = this.avrInstances.get(avrEntry)!;

        // Check if eiscp connection is actually still alive, if not, reconnect
        if (!instance.eiscp.connected) {
          console.log("%s [%s] TCP connection lost, reconnecting to AVR...", integrationName, avrEntry);
          
          // Try reconnecting with progressive timeout (3 attempts: 3s, 5s, 8s)
          const timeouts = [3000, 5000, 8000];
          let reconnected = false;
          
          for (let attempt = 0; attempt < timeouts.length; attempt++) {
            try {
              console.log(
                "%s [%s] Reconnection attempt %d/%d (timeout: %dms)...",
                integrationName,
                avrEntry,
                attempt + 1,
                timeouts.length,
                timeouts[attempt]
              );
              
              // Start connection attempt
              await instance.eiscp.connect({
                model: instance.config.model,
                host: instance.config.ip,
                port: instance.config.port
              });
              
              // Wait for the actual TCP connection to establish
              // connect() returns immediately but the socket connects asynchronously
              await instance.eiscp.waitForConnect(timeouts[attempt]);
              
              console.log("%s [%s] Successfully reconnected to AVR", integrationName, physicalAVR);
              reconnected = true;
              break;
            } catch (reconnectErr) {
              console.warn(
                "%s [%s] Reconnection attempt %d/%d failed: %s",
                integrationName,
                physicalAVR,
                attempt + 1,
                timeouts.length,
                reconnectErr
              );
              
              // // If this was the last attempt, log error
              // if (attempt === timeouts.length - 1) {
              //   console.error("%s [%s] Failed to reconnect to AVR after %d attempts", integrationName, physicalAVR, timeouts.length);
              //   // Schedule a retry in 30 seconds
              //   this.scheduleReconnect(physicalAVR, instance);
              // }
            }
          }
          
          // Clear any existing reconnect timer if we successfully reconnected
          if (reconnected && instance.reconnectTimer) {
            clearTimeout(instance.reconnectTimer);
            instance.reconnectTimer = undefined;
          }
        }

        // Re-create entity and add to registration list
        const mediaPlayerEntity = this.createMediaPlayerEntity(avrEntry, instance.config.volumeScale ?? 100);
        entitiesToRegister.push(mediaPlayerEntity);
        continue;
      }

      try {
        console.log(
          "%s [%s] Connecting to AVR at %s:%d",
          integrationName,
          avrConfig.model,
          avrConfig.ip,
          avrConfig.port
        );

        // Create EiscpDriver instance for this AVR
        const eiscpInstance = new EiscpDriver({
          host: avrConfig.ip,
          port: avrConfig.port,
          model: avrConfig.model,
          send_delay: avrConfig.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD
        });

        // Connect to the AVR
        const result = await eiscpInstance.connect({
          model: avrConfig.model,
          host: avrConfig.ip,
          port: avrConfig.port
        });

        if (!result || !result.model) {
          throw new Error("AVR connection failed or returned null");
        }

        // Create per-AVR config for command handlers (including backward compatibility fields)
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

        // Create command sender and receiver for this AVR
        const commandSender = new OnkyoCommandSender(this.driver, avrSpecificConfig, eiscpInstance);
        const commandReceiver = new OnkyoCommandReceiver(this.driver, avrSpecificConfig, eiscpInstance);
        commandReceiver.setupEiscpListener();

        // Store instance
        this.avrInstances.set(physicalAVR, {
          config: avrConfig,
          eiscp: eiscpInstance,
          commandSender,
          commandReceiver
        });

        console.log(
          "%s [%s] Connected to AVR: %s",
          integrationName,
          avrEntry
        );

        // Create media player entity for this AVR and add to registration list
        const mediaPlayerEntity = this.createMediaPlayerEntity(avrEntry, avrConfig.volumeScale ?? 100);
        entitiesToRegister.push(mediaPlayerEntity);

        // Setup error handler
        eiscpInstance.on("error", (err: any) => {
          console.error("%s [%s] EiscpDriver error:", integrationName, avrEntry, err);
        });
      } catch (err) {
        console.error("%s [%s] Failed to connect to AVR:", integrationName, avrEntry, err);
      }
    }

    // Register all entities at once after all AVRs are connected
    console.log("%s Registering %d AVR entity(ies)", integrationName, entitiesToRegister.length);
    for (const entity of entitiesToRegister) {
      this.driver.addAvailableEntity(entity);
    }

    // Query state for all connected AVRs after entity registration
    for (const [avrEntry, instance] of this.avrInstances) {
      await this.queryAvrState(avrEntry, instance.eiscp, "after entity registration");
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
      for (const [avrEntry, instance] of this.avrInstances) {
        if (instance.reconnectTimer) {
          console.log(`${integrationName} [${avrEntry}] Clearing reconnect timer due to integration disconnect`);
          clearTimeout(instance.reconnectTimer);
          instance.reconnectTimer = undefined;
        }
      }
      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
    });

    this.driver.on(uc.Events.SubscribeEntities, async (entityIds: string[]) => {
      for (const entityId of entityIds) {
        // Query AVR state after successful connection
        const instance = this.avrInstances.get(entityId);
        if (instance) {
          const queueThreshold = instance.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;
          console.log(
            `${integrationName} [${entityId}] Subscribed entity, queue threshold set to: ${queueThreshold}ms`
          );
          await this.queryAvrState(entityId, instance.eiscp, "on subscribe");
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
  private async sharedCmdHandler(
    entity: uc.Entity,
    cmdId: string,
    params?: { [key: string]: string | number | boolean }
  ): Promise<uc.StatusCodes> {
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
