import * as uc from "@unfoldedcircle/integration-api";
import { EiscpDriver } from "./eiscp.js";
import { OnkyoConfig } from "./configManager.js";
import { DEFAULT_LONG_PRESS_THRESHOLD } from "./configManager.js";

const integrationName = "Onkyo-Integration: ";
let lastCommandTime = 0;

export class OnkyoCommandSender {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private eiscp: EiscpDriver;

  constructor(driver: uc.IntegrationAPI, config: OnkyoConfig, eiscp: EiscpDriver) {
    this.driver = driver;
    this.config = config;
    this.eiscp = eiscp;
  }

  async sharedCmdHandler(
    entity: uc.Entity,
    cmdId: string,
    params?: { [key: string]: string | number | boolean }
  ): Promise<uc.StatusCodes> {
    try {
      await this.eiscp.waitForConnect();
    } catch (err) {
      console.warn("%s Could not send command, AVR not connected: %s", integrationName, err);
      for (let attempt = 1; attempt <= 5; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          await this.eiscp.waitForConnect();
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
      console.log("%s %s media-player command request: %s", integrationName, entity.id, cmdId, params || "");
      if (entity.id === globalThis.selectedAvr) {
        const now = Date.now();
        switch (cmdId) {
          case "on":
            await this.eiscp.command("system-power on");
            break;
          case "off":
            await this.eiscp.command("system-power standby");
            break;
          case "toggle":
            entity.attributes?.state === uc.MediaPlayerStates.On
              ? await this.eiscp.command("system-power standby")
              : await this.eiscp.command("system-power on");
            break;
          case "mutetoggle":
            await this.eiscp.command("audio-muting toggle");
            break;
          case "volumeup":
            if (now - lastCommandTime > (this.config.longPressThreshold ?? DEFAULT_LONG_PRESS_THRESHOLD)) {
              lastCommandTime = now;
              await this.eiscp.command("volume level-up-1db-step");
            }
            break;
          case "volumedown":
            if (now - lastCommandTime > (this.config.longPressThreshold ?? DEFAULT_LONG_PRESS_THRESHOLD)) {
              lastCommandTime = now;
              await this.eiscp.command("volume level-down-1db-step");
            }
            break;
          case "channelup":
            await this.eiscp.command("preset up");
            break;
          case "channeldown":
            await this.eiscp.command("preset down");
            break;
          case "selectsource":
            if (params?.source) {
              if (typeof params.source === "string" && params.source.toLowerCase().startsWith("raw")) {
                const rawCmd = (params.source as string).substring(3).trim().toUpperCase();
                console.error("%s sending raw command: %s", integrationName, rawCmd);
                await this.eiscp.raw(rawCmd);
              } else if (typeof params.source === "string") {
                await this.eiscp.command(`${params.source.toLowerCase()}`);
              }
            }
            break;
          case "playpause":
            await this.eiscp.command("network-usb play");
            break;
          case "next":
            await this.eiscp.command("network-usb trup");
            break;
          case "previous":
            await this.eiscp.command("network-usb trdn");
            break;
          case "settings":
            await this.eiscp.command("setup menu");
            break;
          case "home":
            await this.eiscp.command("setup exit");
            break;
          case "cursorenter":
            await this.eiscp.command("setup enter");
            break;
          case "cursorup":
            await this.eiscp.command("setup up");
            break;
          case "cursordown":
            await this.eiscp.command("setup down");
            break;
          case "cursorleft":
            await this.eiscp.command("setup left");
            break;
          case "cursorright":
            await this.eiscp.command("setup right");
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
