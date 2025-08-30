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

let lastCommandTime = 0;

export default class OnkyoDriver {
  private driver: uc.IntegrationAPI;
  private avrPreset: string = "unknown";

  // Persist setup fields as static properties
  private static lastSetupModel: string | undefined;
  private static lastSetupIp: string | undefined;
  private static lastSetupPort: number | undefined;
  private static lastSetupLongPressThreshold: number;

  private setupModel: string | undefined;
  private setupIp: string | undefined;
  private setupPort: number | undefined;
  private setupLongPressThreshold: number = 333;

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
    const longPressThreshold = (msg as any).setupData?.longPressThreshold;

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

    // Store in static fields for reconnects
    OnkyoDriver.lastSetupModel = this.setupModel;
    OnkyoDriver.lastSetupIp = this.setupIp;
    OnkyoDriver.lastSetupPort = this.setupPort;
    OnkyoDriver.lastSetupLongPressThreshold = this.setupLongPressThreshold;

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
                uc.MediaPlayerFeatures.MediaTitle,
                uc.MediaPlayerFeatures.MediaArtist,
                uc.MediaPlayerFeatures.MediaAlbum,
                uc.MediaPlayerFeatures.MediaPosition,
                uc.MediaPlayerFeatures.MediaDuration,
                uc.MediaPlayerFeatures.MediaImageUrl,
                uc.MediaPlayerFeatures.Dpad,
                uc.MediaPlayerFeatures.Settings,
                uc.MediaPlayerFeatures.Home
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
        const now = Date.now();
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
          case uc.MediaPlayerCommands.MuteToggle:
            await eiscp.command("audio-muting toggle");
            break;
          case uc.MediaPlayerCommands.VolumeUp:
            if (now - lastCommandTime > OnkyoDriver.lastSetupLongPressThreshold) {
              lastCommandTime = now;
              await eiscp.command("volume level-up-1db-step");
            }
            break;
          case uc.MediaPlayerCommands.VolumeDown:
            if (now - lastCommandTime > OnkyoDriver.lastSetupLongPressThreshold) {
              lastCommandTime = now;
              await eiscp.command("volume level-down-1db-step");
            }
            break;
          case uc.MediaPlayerCommands.ChannelUp:
            await eiscp.command("preset up");
            break;
          case uc.MediaPlayerCommands.ChannelDown:
            await eiscp.command("preset down");
            break;
          case uc.MediaPlayerCommands.SelectSource:
            if (params?.source) {
              if (typeof params.source === "string" && params.source.toLowerCase().startsWith("raw")) {
                const rawCmd = (params.source as string).substring(3).trim().toUpperCase();
                console.error("%s sending raw command: %s", integrationName, rawCmd);
                await eiscp.raw(rawCmd);
              } else if (typeof params.source === "string") {
                await eiscp.command(`${params.source.toLowerCase()}`);
              }
            }
            break;
          case uc.MediaPlayerCommands.Settings:
            await eiscp.command("setup menu");
            break;
          case uc.MediaPlayerCommands.Home:
            await eiscp.command("setup exit");
            break;
          case uc.MediaPlayerCommands.CursorEnter:
            await eiscp.command("setup enter");
            break;
          case uc.MediaPlayerCommands.CursorUp:
            await eiscp.command("setup up");
            break;
          case uc.MediaPlayerCommands.CursorDown:
            await eiscp.command("setup down");
            break;
          case uc.MediaPlayerCommands.CursorLeft:
            await eiscp.command("setup left");
            break;
          case uc.MediaPlayerCommands.CursorRight:
            await eiscp.command("setup right");
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
    // Store now playing metadata
    const nowPlaying: { station?: string; artist?: string; album?: string; title?: string } = {};

    eiscp.on("error", (err: any) => {
      console.error("%s eiscp error: %s", integrationName, err);
    });
    eiscp.on(
      "data",
      (avrUpdates: {
        command: string;
        argument: string | number | Record<string, string>;
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
        // console.log("%s here...", avrUpdates.command);
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
              [uc.MediaPlayerAttributes.Volume]: avrUpdates.argument.toString()
            });
            console.log("%s volume set to: %s", integrationName, entity.attributes?.volume);
            break;
          case "preset":
            this.avrPreset = avrUpdates.argument.toString();
            console.log("%s preset set to: %s", integrationName, this.avrPreset);
            break;
          case "input-selector":
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.Source]: avrUpdates.argument.toString()
            });
            console.log("%s input-selector (source) set to: %s", integrationName, entity.attributes?.source);
            break;
          case "NTM":
            let [position, duration] = avrUpdates.argument.toString().split("/");
            // Convert duration and position to seconds if in mm:ss or hh:mm:ss format
            function timeToSeconds(timeStr: string): number {
              if (!timeStr) return 0;
              const parts = timeStr.split(":").map(Number);
              if (parts.length === 3) {
                // hh:mm:ss
                return parts[0] * 3600 + parts[1] * 60 + parts[2];
              } else if (parts.length === 2) {
                // mm:ss
                return parts[0] * 60 + parts[1];
              } else if (parts.length === 1) {
                // seconds
                return parts[0];
              }
              return 0;
            }
            duration = timeToSeconds(duration).toString();
            position = timeToSeconds(position).toString();
            this.driver.updateEntityAttributes(globalThis.selectedAvr, {
              [uc.MediaPlayerAttributes.MediaPosition]: position || "0",
              [uc.MediaPlayerAttributes.MediaDuration]: duration || "0"
            });
            break;
          case "metadata":
            // console.log("*****5 %s", avrUpdates.argument);
            if (typeof avrUpdates.argument === "object" && avrUpdates.argument !== null) {
              nowPlaying.title = (avrUpdates.argument as Record<string, string>).NTI || "unknwn";
              nowPlaying.album = (avrUpdates.argument as Record<string, string>).NAL || "unknwn";
              nowPlaying.artist = (avrUpdates.argument as Record<string, string>).NAT || "unknwn";
            } else {
              nowPlaying.title = "aa";
              nowPlaying.album = "bb";
              nowPlaying.artist = "cc";
            }
            break;
          default:
            // todo
            break;
        }

        this.driver.updateEntityAttributes(globalThis.selectedAvr, {
          [uc.MediaPlayerAttributes.MediaArtist]: nowPlaying.artist || "unknown",
          [uc.MediaPlayerAttributes.MediaTitle]: nowPlaying.title || "unknown",
          [uc.MediaPlayerAttributes.MediaAlbum]: nowPlaying.album || "unknown",
          [uc.MediaPlayerAttributes.MediaImageUrl]: "http://192.168.2.103/album_art.cgi" // SETTINGS!
        });
      }
    );
  }

  async init() {
    console.log("%s Initializing...", integrationName);
  }
}
