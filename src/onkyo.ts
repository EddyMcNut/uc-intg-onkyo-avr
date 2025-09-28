/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import EiscpDriver from "./eiscp.js";
import { ConfigManager, OnkyoConfig } from "./configManager.js";
import { DEFAULT_QUEUE_THRESHOLD } from "./configManager.js";
import { OnkyoCommandSender } from "./onkyoCommandSender.js";
import { OnkyoCommandReceiver } from "./onkyoCommandReceiver.js";

declare global {
  // eslint-disable-next-line no-var
  var selectedAvr: string;
}

const integrationName = "Onkyo-Integration: ";

export default class OnkyoDriver {
  private driver: uc.IntegrationAPI;
  private commandSender: OnkyoCommandSender;
  private commandReceiver: OnkyoCommandReceiver;
  private config: OnkyoConfig;
  private eiscpInstance: EiscpDriver;

  constructor() {
    this.driver = new uc.IntegrationAPI();
    this.config = ConfigManager.load();
    this.eiscpInstance = new EiscpDriver({
      host: this.config.ip,
      port: this.config.port,
      model: this.config.model,
      send_delay: this.config.queueThreshold
    });
    this.commandSender = new OnkyoCommandSender(this.driver, this.config, this.eiscpInstance);
    this.commandReceiver = new OnkyoCommandReceiver(this.driver, this.config, this.eiscpInstance);
    this.driver.init("driver.json", this.handleDriverSetup.bind(this));
    this.setupEventHandlers();
    this.commandReceiver.setupEiscpListener();
    this.setupDriverEvents();
    console.log("Loaded config at startup:", this.config);

    // Auto-register entity after startup if config is present
    if (this.config && this.config.model && this.config.ip && this.config.port) {
      this.handleConnect();
    } else {
      console.log("Config missing or incomplete, waiting for setup.");
    }

    this.eiscpInstance.on("error", (err: any) => {
      console.error("%s EiscpDriver error:", integrationName, err);
    });
  }

  private async handleDriverSetup(msg: uc.SetupDriver): Promise<uc.SetupAction> {
    const model = (msg as any).setupData?.model;
    const ipAddress = (msg as any).setupData?.ipAddress;
    const port = (msg as any).setupData?.port;
    const queueThreshold = (msg as any).setupData?.queueThreshold;
    const albumArtURL = (msg as any).setupData?.albumArtURL;

    // Only overwrite if provided, else keep existing
    if (typeof model === "string" && model.trim() !== "") {
      this.config.model = model.trim();
    }
    if (typeof ipAddress === "string" && ipAddress.trim() !== "") {
      this.config.ip = ipAddress.trim();
    }

    if (port && port.toString().trim() !== "") {
      const portNum = parseInt(port, 10);
      this.config.port = isNaN(portNum) ? undefined : portNum;
    } else {
      this.config.port = undefined;
    }
    if (queueThreshold && queueThreshold.toString().trim() !== "") {
      const longPressNum = parseInt(queueThreshold, 10);
      this.config.queueThreshold = isNaN(longPressNum) ? DEFAULT_QUEUE_THRESHOLD : longPressNum;
    } else {
      this.config.queueThreshold = DEFAULT_QUEUE_THRESHOLD;
    }
    this.config.albumArtURL = typeof albumArtURL === "string" && albumArtURL.trim() !== "" ? albumArtURL.trim() : "";

    // Save to config file
    ConfigManager.save({
      model: this.config.model,
      ip: this.config.ip,
      port: this.config.port,
      queueThreshold: this.config.queueThreshold,
      albumArtURL: this.config.albumArtURL
    });

    await this.handleConnect();

    return new uc.SetupComplete();
  }

  private setupDriverEvents() {
    this.driver.on(uc.Events.Connect, this.handleConnect.bind(this));
    this.driver.on(uc.Events.ExitStandby, this.handleConnect.bind(this));
  }

  private async handleConnect() {
    let attempts = 0;
    const maxAttempts = 5;
    const retryDelayMs = 2000;

    while (attempts < maxAttempts) {
      try {
        if (!this.eiscpInstance.connected) {
          console.log("%s Attempting to connect to AVR... (attempt %d)", integrationName, attempts + 1);

          const avr =
            this.config.model !== undefined
              ? await this.eiscpInstance.connect({
                  model: this.config.model,
                  host: this.config.ip,
                  port: this.config.port
                })
              : await this.eiscpInstance.connect();

          if (!avr || !avr.model) {
            throw new Error("AVR connection failed or returned null");
          }

          // Update config with discovered model, IP, and port
          this.config.model = avr.model;
          this.config.ip = avr.host;
          this.config.port = avr.port;
          ConfigManager.save({
            model: avr.model,
            ip: avr.host,
            port: avr.port,
            queueThreshold: this.config.queueThreshold,
            albumArtURL: this.config.albumArtURL,
            selectedAvr: `${avr.model} ${avr.host}`
          });

          const selectedAvr = `${avr.model} ${avr.host}`;
          globalThis.selectedAvr = selectedAvr;

          console.log("%s Connected to AVR: model=%s, ip=%s, port=%s", integrationName, avr.model, avr.host, avr.port);

          const mediaPlayerEntity = new uc.MediaPlayer(
            globalThis.selectedAvr,
            { en: globalThis.selectedAvr },
            {
              features: [
                uc.MediaPlayerFeatures.OnOff,
                uc.MediaPlayerFeatures.Toggle,
                uc.MediaPlayerFeatures.PlayPause,
                uc.MediaPlayerFeatures.MuteToggle,
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
                [uc.MediaPlayerAttributes.Volume]: uc.MediaPlayerStates.Unknown,
                [uc.MediaPlayerAttributes.Source]: uc.MediaPlayerStates.Unknown,
                [uc.MediaPlayerAttributes.MediaType]: uc.MediaPlayerStates.Unknown
              },
              deviceClass: uc.MediaPlayerDeviceClasses.Receiver
            }
          );
          mediaPlayerEntity.setCmdHandler(this.sharedCmdHandler.bind(this));
          this.driver.addAvailableEntity(mediaPlayerEntity);
        } else {
          console.log("%s Already connected to AVR, skipping connect()", integrationName);
        }
        await this.driver.setDeviceState(uc.DeviceStates.Connected);
        if (typeof this.driver.getAvailableEntities === "function") {
          const entities = this.driver.getAvailableEntities();
        }
        return;
      } catch (err) {
        attempts++;
        console.error("%s RECOVERY: Failed to connect to AVR (attempt %d):", integrationName, attempts, err);
        if (typeof this.eiscpInstance.disconnect === "function") {
          try {
            await this.eiscpInstance.disconnect();
            console.log("%s AVR connection cleaned up after failure.", integrationName);
          } catch (cleanupErr) {
            console.error("%s Failed to clean up AVR connection:", integrationName, cleanupErr);
          }
        }
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        }
        await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
        return;
      }
    }
  }

  private async setupEventHandlers() {
    this.driver.on(uc.Events.Disconnect, async () => {
      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
    });

    this.driver.on(uc.Events.SubscribeEntities, async (entityIds: string[]) => {
      entityIds.forEach((entityId: string) => {
        console.log(
          `${integrationName} Subscribed entity: ${entityId}, queue threshold set to: ${this.config.queueThreshold}ms`
        );
        // Query AVR state after successful connection
        this.eiscpInstance.command("system-power query");
        this.eiscpInstance.command("input-selector query");
      });
    });

    this.driver.on(uc.Events.UnsubscribeEntities, async (entityIds: string[]) => {
      entityIds.forEach((entityId: string) => {
        console.log(`${integrationName} Unsubscribed entity: ${entityId}`);
      });
    });
  }

  // Use the sender class for command handling
  private async sharedCmdHandler(
    entity: uc.Entity,
    cmdId: string,
    params?: { [key: string]: string | number | boolean }
  ): Promise<uc.StatusCodes> {
    return this.commandSender.sharedCmdHandler(entity, cmdId, params);
  }

  async init() {
    console.log("%s Initializing...", integrationName);
  }
}
