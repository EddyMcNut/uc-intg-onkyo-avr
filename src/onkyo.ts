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

    // Add manually configured AVR if provided
    if (typeof model === "string" && model.trim() !== "" && typeof ipAddress === "string" && ipAddress.trim() !== "") {
      const portNum = port && port.toString().trim() !== "" ? parseInt(port, 10) : 60128;

      // Create an AVR config for each zone
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
    }

    await this.handleConnect();

    return new uc.SetupComplete();
  }

  private setupDriverEvents() {
    this.driver.on(uc.Events.Connect, this.handleConnect.bind(this));
    this.driver.on(uc.Events.ExitStandby, this.handleConnect.bind(this));
  }

  private createMediaPlayerEntity(avrKey: string, volumeScale: number): uc.MediaPlayer {
    const mediaPlayerEntity = new uc.MediaPlayer(
      avrKey,
      { en: avrKey },
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

  private async handleConnect() {
    // Reload config to get latest AVR list
    this.config = ConfigManager.load();

    // Only run autodiscovery if no AVRs are configured
    if (!this.config.avrs || this.config.avrs.length === 0) {
      console.log("%s No manually configured AVRs found, running autodiscovery...", integrationName);

      // Try to discover auto-discoverable AVRs
      const tempEiscp = new EiscpDriver({ send_delay: DEFAULT_QUEUE_THRESHOLD });
      let discoveredAvrs: any[] = [];
      try {
        discoveredAvrs = await tempEiscp.discover({ timeout: 5 });
        console.log("%s Discovered %d AVR(s) via autodiscovery", integrationName, discoveredAvrs.length);
      } catch (err) {
        console.log("%s Autodiscovery failed or found no AVRs:", integrationName, err);
      }

      // Add discovered AVRs to config if not already present
      for (const discovered of discoveredAvrs) {
        // For autodiscovered AVRs, default to main zone only
        // User can run setup again to add more zones if needed
        const avrConfig: AvrConfig = {
          model: discovered.model,
          ip: discovered.host,
          port: parseInt(discovered.port, 10) || 60128,
          zone: "main",
          queueThreshold: this.lastSetupData.queueThreshold,
          albumArtURL: this.lastSetupData.albumArtURL,
          volumeScale: this.lastSetupData.volumeScale,
          useHalfDbSteps: this.lastSetupData.useHalfDbSteps
        };
        console.log(
          "%s Adding autodiscovered AVR with volumeScale: %d, useHalfDbSteps: %s",
          integrationName,
          avrConfig.volumeScale,
          avrConfig.useHalfDbSteps
        );
        ConfigManager.addAvr(avrConfig);
      }

      // Reload config after adding discovered AVRs
      this.config = ConfigManager.load();
    } else {
      console.log(
        "%s Skipping autodiscovery - using %d manually configured AVR(s)",
        integrationName,
        this.config.avrs.length
      );
    }

    // Connect to all configured AVRs
    if (!this.config.avrs || this.config.avrs.length === 0) {
      console.log("%s No AVRs configured", integrationName);
      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
      return;
    }

    for (const avrConfig of this.config.avrs) {
      const avrKey = `${avrConfig.model} ${avrConfig.ip} ${avrConfig.zone}`;
      const physicalAvrKey = `${avrConfig.model} ${avrConfig.ip}`; // For tracking physical AVR connection

      // If already connected to this specific zone, re-register the entity for remote reconnect scenarios
      if (this.avrInstances.has(avrKey)) {
        console.log("%s [%s] Already connected to AVR zone, re-registering entity", integrationName, avrKey);
        const instance = this.avrInstances.get(avrKey)!;

        // Re-create and re-add the entity (in case remote rebooted)
        const mediaPlayerEntity = this.createMediaPlayerEntity(avrKey, instance.config.volumeScale ?? 100);
        this.driver.addAvailableEntity(mediaPlayerEntity);
        continue;
      }

      try {
        console.log(
          "%s [%s] Connecting to AVR zone %s at %s:%d",
          integrationName,
          avrConfig.model,
          avrConfig.zone,
          avrConfig.ip,
          avrConfig.port
        );

        // Check if we already have a physical connection to this AVR (for another zone)
        let eiscpInstance: EiscpDriver;
        const existingPhysicalConnection = Array.from(this.avrInstances.values()).find(
          (inst) => inst.config.ip === avrConfig.ip && inst.config.port === avrConfig.port
        );

        if (existingPhysicalConnection) {
          // Reuse existing connection for different zone
          console.log(
            "%s [%s] Reusing existing connection for zone %s",
            integrationName,
            physicalAvrKey,
            avrConfig.zone
          );
          eiscpInstance = existingPhysicalConnection.eiscp;
        } else {
          // Create new EiscpDriver instance for this AVR
          eiscpInstance = new EiscpDriver({
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

          console.log(
            "%s [%s] Connected to AVR: model=%s, ip=%s, port=%s",
            integrationName,
            physicalAvrKey,
            result.model,
            result.host,
            result.port
          );
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
        this.avrInstances.set(avrKey, {
          config: avrConfig,
          eiscp: eiscpInstance,
          commandSender,
          commandReceiver
        });

        console.log("%s [%s] Zone entity configured for zone: %s", integrationName, avrKey, avrConfig.zone);

        // Create media player entity for this AVR zone
        const mediaPlayerEntity = this.createMediaPlayerEntity(avrKey, avrConfig.volumeScale ?? 100);
        this.driver.addAvailableEntity(mediaPlayerEntity);

        // Setup error handler (only once per physical connection)
        if (!existingPhysicalConnection) {
          eiscpInstance.on("error", (err: any) => {
            console.error("%s [%s] EiscpDriver error:", integrationName, avrKey, err);
          });
        }
      } catch (err) {
        console.error("%s [%s] Failed to connect to AVR zone:", integrationName, avrKey, err);
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
      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
    });

    this.driver.on(uc.Events.SubscribeEntities, async (entityIds: string[]) => {
      entityIds.forEach((entityId: string) => {
        // Query AVR state after successful connection
        const instance = this.avrInstances.get(entityId);
        if (instance) {
          const queueThreshold = instance.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD;
          const zone = instance.config.zone;
          console.log(
            `${integrationName} [${entityId}] Subscribed entity for zone ${zone}, queue threshold set to: ${queueThreshold}ms`
          );

          // Format commands with zone prefix if not main
          const formatCommand = (cmd: string): string => {
            return zone === "main" ? cmd : `${zone}.${cmd}`;
          };

          instance.eiscp.command(formatCommand("system-power query"));
          instance.eiscp.command(formatCommand("input-selector query"));
          instance.eiscp.command(formatCommand("volume query"));
          instance.eiscp.command(formatCommand("audio-muting query"));
        }
      });
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
