/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import eiscp from "./eiscp.js";
import { OnkyoCommandSender } from "./onkyoCommandSender.js";
import { OnkyoCommandReceiver } from "./onkyoCommandReceiver.js";

// Augment globalThis to include selectedAvr
declare global {
  // eslint-disable-next-line no-var
  var selectedAvr: string;
}

const integrationName = "Onkyo-Integration: ";

export default class OnkyoDriver {
  private driver: uc.IntegrationAPI;
  private commandSender: OnkyoCommandSender;
  private commandReceiver: OnkyoCommandReceiver;

  // Persist setup fields as static properties
  private static lastSetupModel: string | undefined;
  static lastSetupIp: string | undefined;
  private static lastSetupPort: number | undefined;
  static lastSetupLongPressThreshold: number;
  static lastSetupAlbumArtURL: string = "na";

  private setupModel: string | undefined;
  private setupIp: string | undefined;
  private setupPort: number | undefined;
  private setupLongPressThreshold: number = 333;
  private setupAlbumArtURL: string = "na";

  constructor() {
    this.driver = new uc.IntegrationAPI();
    this.commandSender = new OnkyoCommandSender(this.driver);
    this.commandReceiver = new OnkyoCommandReceiver(this.driver);
    this.driver.init("driver.json", this.handleDriverSetup.bind(this));
    this.setupEventHandlers();
    this.commandReceiver.setupEiscpListener();
    this.setupDriverEvents();
  }

  private async handleDriverSetup(msg: uc.SetupDriver): Promise<uc.SetupAction> {
    const model = (msg as any).setupData?.model;
    const ipAddress = (msg as any).setupData?.ipAddress;
    const port = (msg as any).setupData?.port;
    const longPressThreshold = (msg as any).setupData?.longPressThreshold;
    const albumArtURL = (msg as any).setupData?.albumArtURL;

    this.setupModel = typeof model === "string" && model.trim() !== "" ? model.trim() : undefined;
    this.setupIp = typeof ipAddress === "string" && ipAddress.trim() !== "" ? ipAddress.trim() : undefined;
    if (port && port.toString().trim() !== "") {
      const portNum = parseInt(port, 10);
      this.setupPort = isNaN(portNum) ? undefined : portNum;
    } else {
      this.setupPort = undefined;
    }
    if (longPressThreshold && longPressThreshold.toString().trim() !== "") {
      const longPressNum = parseInt(longPressThreshold, 10);
      this.setupLongPressThreshold = isNaN(longPressNum) ? 333 : longPressNum;
    } else {
      this.setupLongPressThreshold = 333;
    }
    this.setupAlbumArtURL = typeof albumArtURL === "string" && albumArtURL.trim() !== "" ? albumArtURL.trim() : "";

    // Store in static fields for reconnects
    OnkyoDriver.lastSetupModel = this.setupModel;
    OnkyoDriver.lastSetupIp = this.setupIp;
    OnkyoDriver.lastSetupPort = this.setupPort;
    OnkyoDriver.lastSetupLongPressThreshold = this.setupLongPressThreshold;
    OnkyoDriver.lastSetupAlbumArtURL = this.setupAlbumArtURL;

    // Re-trigger connection after setup
    await this.handleConnect();

    return new uc.SetupComplete();
  }

  private setupDriverEvents() {
    this.driver.on(uc.Events.Connect, this.handleConnect.bind(this));
  }

  private async handleConnect() {
    let attempts = 0;
    const maxAttempts = 5;
    const retryDelayMs = 2000;

    while (attempts < maxAttempts) {
      try {
        if (!eiscp.connected) {
          console.log("%s Attempting to connect to AVR... (attempt %d)", integrationName, attempts + 1);

          console.log(
            "%s Connecting with model: %s, ip: %s, port: %s",
            integrationName,
            OnkyoDriver.lastSetupModel,
            OnkyoDriver.lastSetupIp,
            OnkyoDriver.lastSetupPort
          );

          const avr =
            OnkyoDriver.lastSetupModel !== undefined
              ? await eiscp.connect({
                  model: OnkyoDriver.lastSetupModel,
                  host: OnkyoDriver.lastSetupIp,
                  port: OnkyoDriver.lastSetupPort
                })
              : await eiscp.connect();

          if (!avr || !avr.model) {
            throw new Error("AVR connection failed or returned null");
          }

          // Update lastSetupIp with discovered IP
          OnkyoDriver.lastSetupIp = avr.host;

          const selectedAvr = `${avr.model} ${avr.host}`;
          globalThis.selectedAvr = selectedAvr;
          console.log("%s RECOVERY: Connected to AVR: %s (%s:%s)", integrationName, avr.model, avr.host, avr.port);

          // Create and register entity after connection
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
                uc.MediaPlayerFeatures.PlayPause,
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
        return;
      } catch (err) {
        attempts++;
        console.error("%s RECOVERY: Failed to connect to AVR (attempt %d):", integrationName, attempts, err);
        if (typeof eiscp.disconnect === "function") {
          try {
            await eiscp.disconnect();
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
          `${integrationName} Subscribed entity: ${entityId}, long-press threshold set to: ${OnkyoDriver.lastSetupLongPressThreshold}ms`
        );
      });
      eiscp.command("system-power query");
      eiscp.command("audio-muting query");
      eiscp.command("volume query");
      eiscp.command("input-selector query");
      eiscp.command("preset query");
      eiscp.raw("DSNQSTN");
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
