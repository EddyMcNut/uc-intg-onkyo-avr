import * as uc from "@unfoldedcircle/integration-api";
import { EiscpDriver } from "./eiscp.js";
import { DEFAULT_QUEUE_THRESHOLD, OnkyoConfig } from "./configManager.js";

const integrationName = "Onkyo-Integration (sender):";
let lastCommandTime = 0;

// Security: Maximum input lengths
const MAX_LENGTHS = {
  USER_COMMAND: 250,      // input-selector, listening-mode, etc.
  RAW_COMMAND: 20        // raw MVL20, etc.
};

// Security: Valid character patterns
const PATTERNS = {
  USER_COMMAND: /^[a-z0-9\-\s.:=]+$/i,  // Letters, numbers, hyphens, spaces, delimiters
  RAW_COMMAND: /^[A-Z0-9]+$/             // Uppercase letters and numbers only
};

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

    // Check if connected, and trigger reconnection if needed
    // This handles the case where user sends a command after wake-up from standby
    // and the driver reconnection hasn't been triggered yet
    if (!this.eiscp.connected) {
      console.log("%s [%s] Command received while disconnected, triggering reconnection...", integrationName, entity.id);
      try {
        const avrConfig = this.config.avrs?.[0];
        if (avrConfig) {
          await this.eiscp.connect({
            model: avrConfig.model,
            host: avrConfig.ip,
            port: avrConfig.port
          });
          await this.eiscp.waitForConnect(3000);
          console.log("%s [%s] Reconnected on command", integrationName, entity.id);
        }
      } catch (connectErr) {
        console.warn("%s [%s] Failed to reconnect on command: %s", integrationName, entity.id, connectErr);
        // Fall through to retry logic below
      }
    }

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
          
          // Use zone-specific volume command prefix
          let volumePrefix = "MVL"; // main zone
          if (zone === "zone2") {
            volumePrefix = "ZVL";
          } else if (zone === "zone3") {
            volumePrefix = "VL3";
          }
          await this.eiscp.raw(`${volumePrefix}${hexVolume}`);
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
            
            // Security: Validate raw command length
            if (rawCmd.length > MAX_LENGTHS.RAW_COMMAND) {
              console.error("%s [%s] Raw command too long (%d chars), rejecting", integrationName, entity.id, rawCmd.length);
              return uc.StatusCodes.BadRequest;
            }
            
            // Security: Validate raw command characters (alphanumeric only)
            if (!PATTERNS.RAW_COMMAND.test(rawCmd)) {
              console.error("%s [%s] Raw command contains invalid characters, rejecting", integrationName, entity.id);
              return uc.StatusCodes.BadRequest;
            }
            
            console.error("%s [%s] sending raw command: %s", integrationName, entity.id, rawCmd);
            await this.eiscp.raw(rawCmd);
          } else if (typeof params.source === "string") {
            const userCmd = params.source.toLowerCase();
            
            // Security: Validate user command length
            if (userCmd.length > MAX_LENGTHS.USER_COMMAND) {
              console.error("%s [%s] Command too long (%d chars), rejecting", integrationName, entity.id, userCmd.length);
              return uc.StatusCodes.BadRequest;
            }
            
            // Security: Validate user command characters
            if (!PATTERNS.USER_COMMAND.test(userCmd)) {
              console.error("%s [%s] Command contains invalid characters, rejecting", integrationName, entity.id);
              return uc.StatusCodes.BadRequest;
            }
            
            await this.eiscp.command(formatCommand(userCmd));
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
      case uc.MediaPlayerCommands.Info:
        await this.eiscp.command(formatCommand("audio-information query"));
        await this.eiscp.command(formatCommand("video-information query"));
        break;
      default:
        return uc.StatusCodes.NotImplemented;
    }
    return uc.StatusCodes.Ok;
  }
}
