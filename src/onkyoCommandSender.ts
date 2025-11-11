import * as uc from "@unfoldedcircle/integration-api";
import { EiscpDriver } from "./eiscp.js";
import { DEFAULT_QUEUE_THRESHOLD, OnkyoConfig } from "./configManager.js";

const integrationName = "Onkyo-Integration (sender):";
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

  async sharedCmdHandler(entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }): Promise<uc.StatusCodes> {
    const zone = this.config.avrs?.[0]?.zone || "main";

    try {
      await this.eiscp.waitForConnect();
    } catch (err) {
      console.warn("%s [%s] Could not send command, AVR not connected: %s", integrationName, entity.id, err);
      for (let attempt = 1; attempt <= 5; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          await this.eiscp.waitForConnect();
          break;
        } catch (retryErr) {
          if (attempt === 5) {
            console.warn("%s [%s] Could not connect to AVR after 5 attempts: %s", integrationName, entity.id, retryErr);
            return uc.StatusCodes.Timeout;
          }
        }
      }
    }

    console.log("%s [%s] media-player command request: %s", integrationName, entity.id, cmdId, params || "");

    // Helper function to format command with zone prefix
    const formatCommand = (cmd: string): string => {
      return zone === "main" ? cmd : `${zone}.${cmd}`;
    };

    const now = Date.now();
    switch (cmdId) {
      case uc.MediaPlayerCommands.On:
        await this.eiscp.command(formatCommand("system-power on"));
        break;
      case uc.MediaPlayerCommands.Off:
        await this.eiscp.command(formatCommand("system-power standby"));
        break;
      case uc.MediaPlayerCommands.Toggle:
        entity.attributes?.state === uc.MediaPlayerStates.On ? await this.eiscp.command(formatCommand("system-power standby")) : await this.eiscp.command(formatCommand("system-power on"));
        break;
      case uc.MediaPlayerCommands.MuteToggle:
        await this.eiscp.command(formatCommand("audio-muting toggle"));
        break;
      case uc.MediaPlayerCommands.VolumeUp:
        if (now - lastCommandTime > (this.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD)) {
          lastCommandTime = now;
          await this.eiscp.command(formatCommand("volume level-up-1db-step"));
        }
        break;
      case uc.MediaPlayerCommands.VolumeDown:
        if (now - lastCommandTime > (this.config.queueThreshold ?? DEFAULT_QUEUE_THRESHOLD)) {
          lastCommandTime = now;
          await this.eiscp.command(formatCommand("volume level-down-1db-step"));
        }
        break;
      case uc.MediaPlayerCommands.Volume:
        if (params?.volume !== undefined) {
          // Remote slider: 0-100, AVR display: 0-volumeScale, EISCP protocol: 0-200 or 0-100 depending on model
          const sliderValue = Math.max(0, Math.min(100, Number(params.volume)));
          const volumeScale = this.config.volumeScale || 100;
          const useHalfDbSteps = this.config.useHalfDbSteps ?? true; // Default to true for backward compatibility

          // Convert: slider → AVR display scale
          const avrDisplayValue = Math.round((sliderValue * volumeScale) / 100);

          // Convert to EISCP: some models use 0.5 dB steps (×2), others show EISCP value directly
          const eiscpValue = useHalfDbSteps ? avrDisplayValue * 2 : avrDisplayValue;
          const hexVolume = eiscpValue.toString(16).toUpperCase().padStart(2, "0");
          await this.eiscp.raw(`MVL${hexVolume}`);
        }
        break;
      case uc.MediaPlayerCommands.ChannelUp:
        await this.eiscp.command(formatCommand("preset up"));
        break;
      case uc.MediaPlayerCommands.ChannelDown:
        await this.eiscp.command(formatCommand("preset down"));
        break;
      case uc.MediaPlayerCommands.SelectSource:
        if (params?.source) {
          if (typeof params.source === "string" && params.source.toLowerCase().startsWith("raw")) {
            const rawCmd = (params.source as string).substring(3).trim().toUpperCase();
            console.error("%s [%s] sending raw command: %s", integrationName, entity.id, rawCmd);
            await this.eiscp.raw(rawCmd);
          } else if (typeof params.source === "string") {
            await this.eiscp.command(formatCommand(`${params.source.toLowerCase()}`));
          }
        }
        break;
      case uc.MediaPlayerCommands.PlayPause:
        await this.eiscp.command(formatCommand("network-usb play"));
        break;
      case uc.MediaPlayerCommands.Next:
        await this.eiscp.command(formatCommand("network-usb trup"));
        break;
      case uc.MediaPlayerCommands.Previous:
        await this.eiscp.command(formatCommand("network-usb trdn"));
        break;
      case uc.MediaPlayerCommands.Settings:
        await this.eiscp.command(formatCommand("setup menu"));
        break;
      case uc.MediaPlayerCommands.Home:
        await this.eiscp.command(formatCommand("setup exit"));
        break;
      case uc.MediaPlayerCommands.CursorEnter:
        await this.eiscp.command(formatCommand("setup enter"));
        break;
      case uc.MediaPlayerCommands.CursorUp:
        await this.eiscp.command(formatCommand("setup up"));
        break;
      case uc.MediaPlayerCommands.CursorDown:
        await this.eiscp.command(formatCommand("setup down"));
        break;
      case uc.MediaPlayerCommands.CursorLeft:
        await this.eiscp.command(formatCommand("setup left"));
        break;
      case uc.MediaPlayerCommands.CursorRight:
        await this.eiscp.command(formatCommand("setup right"));
        break;
      default:
        return uc.StatusCodes.NotImplemented;
    }
    return uc.StatusCodes.Ok;
  }
}
