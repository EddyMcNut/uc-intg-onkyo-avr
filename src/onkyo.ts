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
    const model = (msg as any).setupData?.model;
    const ipAddress = (msg as any).setupData?.ipAddress;
    const port = (msg as any).setupData?.port;
    const queueThreshold = (msg as any).setupData?.queueThreshold;
    const albumArtURL = (msg as any).setupData?.albumArtURL;

    // Parse settings for this AVR
    const queueThresholdValue =
      queueThreshold && queueThreshold.toString().trim() !== ""
        ? parseInt(queueThreshold, 10)
        : DEFAULT_QUEUE_THRESHOLD;
    const albumArtURLValue =
      typeof albumArtURL === "string" && albumArtURL.trim() !== "" ? albumArtURL.trim() : "album_art.cgi";

    // Add manually configured AVR if provided
    if (typeof model === "string" && model.trim() !== "" && typeof ipAddress === "string" && ipAddress.trim() !== "") {
      const portNum = port && port.toString().trim() !== "" ? parseInt(port, 10) : 60128;
      const avrConfig: AvrConfig = {
        model: model.trim(),
        ip: ipAddress.trim(),
        port: isNaN(portNum) ? 60128 : portNum,
        queueThreshold: isNaN(queueThresholdValue) ? DEFAULT_QUEUE_THRESHOLD : queueThresholdValue,
        albumArtURL: albumArtURLValue
      };
      ConfigManager.addAvr(avrConfig);
    }

    await this.handleConnect();

    return new uc.SetupComplete();
  }

  private setupDriverEvents() {
    this.driver.on(uc.Events.Connect, this.handleConnect.bind(this));
    this.driver.on(uc.Events.ExitStandby, this.handleConnect.bind(this));
  }

  private async handleConnect() {
    // Reload config to get latest AVR list
    this.config = ConfigManager.load();

    // First, try to discover auto-discoverable AVRs
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
      const avrConfig: AvrConfig = {
        model: discovered.model,
        ip: discovered.host,
        port: parseInt(discovered.port, 10) || 60128,
        queueThreshold: DEFAULT_QUEUE_THRESHOLD,
        albumArtURL: "album_art.cgi"
      };
      ConfigManager.addAvr(avrConfig);
    }

    // Reload config after adding discovered AVRs
    this.config = ConfigManager.load();

    // Connect to all configured AVRs
    if (!this.config.avrs || this.config.avrs.length === 0) {
      console.log("%s No AVRs configured", integrationName);
      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
      return;
    }

    for (const avrConfig of this.config.avrs) {
      const avrKey = `${avrConfig.model} ${avrConfig.ip}`;

      // If already connected, re-register the entity for remote reconnect scenarios
      if (this.avrInstances.has(avrKey)) {
        console.log("%s [%s] Already connected to AVR, re-registering entity", integrationName, avrKey);
        const instance = this.avrInstances.get(avrKey)!;

        // Re-create and re-add the entity (in case remote rebooted)
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
            deviceClass: uc.MediaPlayerDeviceClasses.Receiver
            // options: {
            //   volume_steps: 100
            // }
          }
        );
        mediaPlayerEntity.setCmdHandler(this.sharedCmdHandler.bind(this));
        this.driver.addAvailableEntity(mediaPlayerEntity);
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

        console.log(
          "%s [%s] Connected to AVR: model=%s, ip=%s, port=%s",
          integrationName,
          avrKey,
          result.model,
          result.host,
          result.port
        );

        // Create media player entity for this AVR
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
              volume_steps: 100
            }
          }
        );
        mediaPlayerEntity.setCmdHandler(this.sharedCmdHandler.bind(this));
        this.driver.addAvailableEntity(mediaPlayerEntity);

        // Setup error handler
        eiscpInstance.on("error", (err: any) => {
          console.error("%s [%s] EiscpDriver error:", integrationName, avrKey, err);
        });
      } catch (err) {
        console.error("%s [%s] Failed to connect to AVR:", integrationName, avrKey, err);
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
          console.log(
            `${integrationName} [${entityId}] Subscribed entity, queue threshold set to: ${queueThreshold}ms`
          );
          instance.eiscp.command("system-power query");
          instance.eiscp.command("input-selector query");
          instance.eiscp.command("volume query");
          instance.eiscp.command("audio-muting query");
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
