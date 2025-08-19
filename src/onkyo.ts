/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import eiscp from "./eiscp.js";

// Augment globalThis to include selectedAvr
declare global {
  // eslint-disable-next-line no-var
  var selectedAvr: string;
}

const integrationName = "Onkyo-Integration: ";

export default class OnkyoDriver {
  private driver: uc.IntegrationAPI;
  private avrPreset: string = "unknown";

  // Persist setup fields as static properties
  private static lastSetupModel: string | undefined;
  private static lastSetupIp: string | undefined;
  private static lastSetupPort: number | undefined;

  private setupModel: string | undefined;
  private setupIp: string | undefined;
  private setupPort: number | undefined;

  constructor() {
    this.driver = new uc.IntegrationAPI();
    this.driver.init("driver.json", this.handleDriverSetup.bind(this));
    this.setupEventHandlers();
    this.setupEiscpListener();
    this.setupDriverEvents();
  }

  private async handleDriverSetup(msg: uc.SetupDriver): Promise<uc.SetupAction> {
    const model = (msg as any).setupData?.model;
    const ipAddress = (msg as any).setupData?.ipAddress;
    const port = (msg as any).setupData?.port;

    this.setupModel = typeof model === "string" && model.trim() !== "" ? model.trim() : undefined;
    this.setupIp = typeof ipAddress === "string" && ipAddress.trim() !== "" ? ipAddress.trim() : undefined;
    if (port && port.toString().trim() !== "") {
      const portNum = parseInt(port, 10);
      this.setupPort = isNaN(portNum) ? undefined : portNum;
    } else {
      this.setupPort = undefined;
    }

    // Store in static fields for reconnects
    OnkyoDriver.lastSetupModel = this.setupModel;
    OnkyoDriver.lastSetupIp = this.setupIp;
    OnkyoDriver.lastSetupPort = this.setupPort;

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
                uc.MediaPlayerFeatures.MediaTitle
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
        console.log(`${integrationName} Subscribed entity: ${entityId}`);
      });
      eiscp.command("system-power query");
      eiscp.command("audio-muting query");
      eiscp.command("volume query");
      eiscp.command("input-selector query");
      eiscp.command("preset query");
    });

    this.driver.on(uc.Events.UnsubscribeEntities, async (entityIds: string[]) => {
      entityIds.forEach((entityId: string) => {
        console.log(`${integrationName} Unsubscribed entity: ${entityId}`);
      });
    });
  }

  // Send commands to the AVR
  private async sharedCmdHandler(
    entity: uc.Entity,
    cmdId: string,
    params?: {
      [key: string]: string | number | boolean;
    }
  ): Promise<uc.StatusCodes> {
    // Wait for AVR connection before sending commands
    try {
      await eiscp.waitForConnect();
    } catch (err) {
      console.warn("%s Could not send command, AVR not connected: %s", integrationName, err);
      // Retry up to 5 times, sleeping 1 second between attempts
      for (let attempt = 1; attempt <= 5; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          await eiscp.waitForConnect();
          break; // Connected, exit retry loop
        } catch (retryErr) {
          if (attempt === 5) {
            console.warn("%s Could not connect to AVR after 5 attempts: %s", integrationName, retryErr);

            return uc.StatusCodes.Timeout;
          }
        }
      }
    }

    const onkyoEntity = this.driver.getConfiguredEntities().getEntity(globalThis.selectedAvr);
    if (onkyoEntity) {
      console.log("%s Got %s media-player command request: %s", integrationName, entity.id, cmdId, params || "");
      if (entity.id === globalThis.selectedAvr) {
        switch (cmdId) {
          case uc.MediaPlayerCommands.On:
            await eiscp.command("system-power on");
            break;
          case uc.MediaPlayerCommands.Off:
            await eiscp.command("system-power standby");
            break;
          case uc.MediaPlayerCommands.Toggle:
            entity.attributes?.state === uc.MediaPlayerStates.On
              ? await eiscp.command("system-power standby")
              : await eiscp.command("system-power on");
            break;
          case uc.MediaPlayerCommands.PlayPause:
            entity.attributes?.state === uc.MediaPlayerStates.On
              ? await eiscp.command("system-power standby")
              : await eiscp.command("system-power on");
            break;
          case uc.MediaPlayerCommands.MuteToggle:
            await eiscp.command("audio-muting toggle");
            break;
          case uc.MediaPlayerCommands.VolumeUp:
            await eiscp.command("volume level-up-1db-step");
            break;
          case uc.MediaPlayerCommands.VolumeDown:
            await eiscp.command("volume level-down-1db-step");
            break;
          case uc.MediaPlayerCommands.ChannelUp:
            await eiscp.command("preset up");
            break;
          case uc.MediaPlayerCommands.ChannelDown:
            await eiscp.command("preset down");
            break;
          case uc.MediaPlayerCommands.SelectSource:
            await eiscp.command(`${params?.source}`);
            break;
          default:
            return uc.StatusCodes.NotImplemented;
        }
        return uc.StatusCodes.Ok;
      } else {
        return uc.StatusCodes.NotFound;
      }
    }
    return uc.StatusCodes.NotFound;
  }

  // Receive commands from the AVR
  private setupEiscpListener() {
    eiscp.on("error", (err: any) => {
      console.error("%s eiscp error: %s", integrationName, err);
    });
    eiscp.on(
      "data",
      (avrUpdates: {
        command: string;
        argument: string | number;
        zone: string;
        iscpCommand: string;
        host: string;
        port: number;
        model: string;
      }) => {
        const entity = this.driver.getConfiguredEntities().getEntity(globalThis.selectedAvr);
        if (!entity) {
          console.warn("%s Entity not found for: %s", integrationName, globalThis.selectedAvr);
          return;
        }

        switch (avrUpdates.command) {
          case "system-power":
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.State]:
                avrUpdates.argument === "on" ? uc.MediaPlayerStates.On : uc.MediaPlayerStates.Standby
            });
            console.log("%s power set to: %s", integrationName, entity.attributes?.state);
            break;
          case "audio-muting":
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.Muted]: avrUpdates.argument === "on" ? true : false
            });
            console.log("%s audio-muting set to: %s", integrationName, entity.attributes?.muted);
            break;
          case "volume":
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.Volume]: avrUpdates.argument
            });
            console.log("%s volume set to: %s", integrationName, entity.attributes?.volume);
            break;
          case "preset":
            this.avrPreset = avrUpdates.argument.toString();
            console.log("%s preset set to: %s", integrationName, this.avrPreset);
            break;
          case "input-selector":
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.Source]: avrUpdates.argument
            });
            console.log("%s input-selector (source) set to: %s", integrationName, entity.attributes?.source);
            break;
          default:
            // this does not show anything :)
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.MediaTitle]: `${avrUpdates.command} = ${avrUpdates.argument}`
            });
            console.log("%s cheated? %s  %s", integrationName, avrUpdates.command, avrUpdates.argument);
            break;
        }

        this.driver.updateEntityAttributes(globalThis.selectedAvr, {
          [uc.MediaPlayerAttributes.MediaTitle]:
            `state: ${String(entity.attributes?.state).toUpperCase()}, volume: ${entity.attributes?.volume}, source: ${String(entity.attributes?.source).toUpperCase()}, preset: ${this.avrPreset}, muted: ${entity.attributes?.muted}`
        });
      }
    );
  }

  async init() {
    console.log("%s Initializing...", integrationName);
    // this.setupEventHandlers();
  }
}
