import * as uc from "@unfoldedcircle/integration-api";
import eiscp from "./eiscp.js";
import OnkyoDriver from "./onkyo.js";

const integrationName = "Onkyo-Integration: ";
let lastCommandTime = 0;

export class OnkyoCommandSender {
  private driver: uc.IntegrationAPI;

  constructor(driver: uc.IntegrationAPI) {
    this.driver = driver;
  }

  async sharedCmdHandler(
    entity: uc.Entity,
    cmdId: string,
    params?: { [key: string]: string | number | boolean }
  ): Promise<uc.StatusCodes> {
    try {
      await eiscp.waitForConnect();
    } catch (err) {
      console.warn("%s Could not send command, AVR not connected: %s", integrationName, err);
      for (let attempt = 1; attempt <= 5; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          await eiscp.waitForConnect();
          break;
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
          case uc.MediaPlayerCommands.PlayPause:
            await eiscp.command("network-usb play");
            break;
          case uc.MediaPlayerCommands.Next:
            await eiscp.command("network-usb trup");
            break;
          case uc.MediaPlayerCommands.Previous:
            await eiscp.command("network-usb trdn");
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
}
