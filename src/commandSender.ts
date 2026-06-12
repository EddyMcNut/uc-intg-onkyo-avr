import * as uc from "@unfoldedcircle/integration-api";
import { EiscpDriver } from "./eiscp.js";
import { buildEntityId, DEFAULT_QUEUE_THRESHOLD, MAX_LENGTHS, PATTERNS, OnkyoConfig } from "./configManager.js";
import { avrStateManager } from "./avrState.js";
import { ICommandReceiver } from "./types.js";
import log from "./loggers.js";
import { delay, toHex, ensureEiscpConnected } from "./utils.js";
import { browseMedia, isMediaBrowsingAvailable } from "./mediaBrowser.js";
import { PlayMediaCommandHandler } from "./playMediaCommandHandler.js";

const integrationName = "commandSender:";

export class CommandSender {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private eiscp: EiscpDriver;
  private lastCommandTime: number = 0;
  private commandReceiver: ICommandReceiver | undefined;
  private playMediaCommandHandler: PlayMediaCommandHandler;

  constructor(driver: uc.IntegrationAPI, config: OnkyoConfig, eiscp: EiscpDriver, commandReceiver: ICommandReceiver | undefined) {
    this.driver = driver;
    this.config = config;
    this.eiscp = eiscp;
    this.commandReceiver = commandReceiver;
    this.playMediaCommandHandler = new PlayMediaCommandHandler(this.eiscp, this.commandReceiver);
  }

  public updateConfig(config: OnkyoConfig): void {
    this.config = config;
  }

  async sharedCmdHandler(entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }): Promise<uc.StatusCodes> {
    const entityParts = entity.id.split(" ");
    if (entityParts.length < 3) {
      log.error("%s [%s] Cannot route command: entity id does not contain model, host, and zone", integrationName, entity.id);
      return uc.StatusCodes.BadRequest;
    }

    const zone = entityParts[entityParts.length - 1];
    const host = entityParts[entityParts.length - 2];
    const model = entityParts.slice(0, -2).join(" ");
    const targetAvr = this.config.avrs?.find((avr) => buildEntityId(avr.model, avr.ip, avr.zone) === entity.id) ?? this.config.avrs?.find((avr) => avr.model === model && avr.ip === host) ?? null;

    if (!targetAvr) {
      log.error("%s [%s] Cannot route command: no configured AVR matches model='%s' host='%s' zone='%s'", integrationName, entity.id, model, host, zone);
      return uc.StatusCodes.BadRequest;
    }

    // Check if connected, and trigger reconnection if needed
    // This handles the case where user sends a command after wake-up from standby
    // and the driver reconnection hasn't been triggered yet
    if (!(await ensureEiscpConnected(this.eiscp, { model: targetAvr.model, host: targetAvr.ip, port: targetAvr.port }, entity.id, integrationName))) {
      return uc.StatusCodes.Timeout;
    }

    log.info("%s [%s] media-player command request: %s", integrationName, entity.id, cmdId, params || "");

    // Helper function to format command with zone prefix
    const setZonePrefix = (cmd: string): string => {
      return zone === "main" ? cmd : `${zone}.${cmd}`;
    };

    const now = Date.now();
    // Determine queue threshold: prefer explicit config, then eISCP driver's send_delay, else default
    const queueThreshold = this.config.queueThreshold ?? (typeof this.eiscp.eiscpConfig?.sendDelay === "number" ? this.eiscp.eiscpConfig.sendDelay : DEFAULT_QUEUE_THRESHOLD);

    if (now - this.lastCommandTime > queueThreshold) {
      switch (cmdId) {
        case uc.MediaPlayerCommands.On:
          await this.eiscp.command(setZonePrefix("system-power on"));
          break;
        case uc.MediaPlayerCommands.Off:
          await this.eiscp.command(setZonePrefix("system-power standby"));
          break;
        case uc.MediaPlayerCommands.Toggle:
          entity.attributes?.state === uc.MediaPlayerStates.On ? await this.eiscp.command(setZonePrefix("system-power standby")) : await this.eiscp.command(setZonePrefix("system-power on"));
          break;
        case uc.MediaPlayerCommands.MuteToggle:
          await this.eiscp.command(setZonePrefix("audio-muting toggle"));
          break;
        case uc.MediaPlayerCommands.VolumeUp:
          this.lastCommandTime = now;
          await this.eiscp.raw(zone === "main" ? "MVLUP1" : zone === "zone2" ? "ZVLUP1" : zone === "zone3" ? "VL3UP1" : "VL4UP1");
          break;
        case uc.MediaPlayerCommands.VolumeDown:
          this.lastCommandTime = now;
          await this.eiscp.raw(zone === "main" ? "MVLDOWN1" : zone === "zone2" ? "ZVLDOWN1" : zone === "zone3" ? "VL3DOWN1" : "VL4DOWN1");
          break;
        case uc.MediaPlayerCommands.Volume:
          if (params?.volume !== undefined) {
            const volumeDisplay = String(this.config.volumeDisplay ?? "absolute").toLowerCase() === "relative" ? "relative" : "absolute";
            if (volumeDisplay !== "absolute") {
              log.debug("%s [%s] volume set to relative so slider is ignored.", integrationName, entity.id);
              break;
            }

            // Remote slider: 0-100, AVR display: 0-volumeScale, EISCP protocol: 0-200 or 0-100 depending on model
            const sliderValue = Math.max(0, Math.min(100, Number(params.volume)));
            const volumeScale = this.config.volumeScale || 100;
            const adjustVolumeDispl = this.config.adjustVolumeDispl ?? true; // Default to true for backward compatibility

            // Convert: slider → AVR display scale
            const avrDisplayValue = Math.round((sliderValue * volumeScale) / 100);

            // Convert to EISCP: some models use 0.5 dB steps (×2), others show EISCP value directly
            const eiscpValue = adjustVolumeDispl ? avrDisplayValue * 2 : avrDisplayValue;
            const hexVolume = toHex(eiscpValue, 2);

            // Use zone-specific volume command prefix
            let volumePrefix = "MVL"; // main zone
            if (zone === "zone2") {
              volumePrefix = "ZVL";
            } else if (zone === "zone3") {
              volumePrefix = "VL3";
            } else if (zone === "zone4") {
              volumePrefix = "VL4";
            }
            await this.eiscp.raw(`${volumePrefix}${hexVolume}`);
          }
          break;
        case uc.MediaPlayerCommands.ChannelUp:
          await this.eiscp.command(setZonePrefix("preset up"));
          break;
        case uc.MediaPlayerCommands.ChannelDown:
          await this.eiscp.command(setZonePrefix("preset down"));
          break;
        case uc.MediaPlayerCommands.SelectSource:
          if (params?.source && typeof params.source === "string") {
            const request = params.source.toLowerCase();

            if (!request.startsWith("raw")) {
              const userCmd = params.source.toLowerCase();

              // Security: Validate user command length
              if (userCmd.length > MAX_LENGTHS.USER_COMMAND) {
                log.error("%s [%s] Command too long (%d chars), rejecting", integrationName, entity.id, userCmd.length);
                return uc.StatusCodes.BadRequest;
              }

              // Security: Validate user command characters
              if (!PATTERNS.USER_COMMAND.test(userCmd)) {
                log.error("%s [%s] Command contains invalid characters, rejecting", integrationName, entity.id);
                return uc.StatusCodes.BadRequest;
              }

              // Multi-zone-volume commands should not be zone-prefixed
              if (!request.startsWith("multi-zone")) {
                await this.eiscp.command(setZonePrefix(userCmd));
              } else {
                // if (now - this.lastCommandTime > queueThreshold) {
                await this.eiscp.command(userCmd);
                // }
              }
            } else {
              const rawCmd = (params.source as string).substring(3).trim().toUpperCase();

              // Security: Validate raw command length
              if (rawCmd.length > MAX_LENGTHS.RAW_COMMAND) {
                log.error("%s [%s] Raw command too long (%d chars), rejecting", integrationName, entity.id, rawCmd.length);
                return uc.StatusCodes.BadRequest;
              }

              // Security: Validate raw command characters (alphanumeric only)
              if (!PATTERNS.RAW_COMMAND.test(rawCmd)) {
                log.error("%s [%s] Raw command contains invalid characters, rejecting", integrationName, entity.id);
                return uc.StatusCodes.BadRequest;
              }

              log.info("%s [%s] sending raw command: %s", integrationName, entity.id, rawCmd);
              await this.eiscp.raw(rawCmd);
            }
          }
          break;
        case uc.MediaPlayerCommands.PlayPause:
          await this.eiscp.command(setZonePrefix("network-usb play"));
          break;
        case uc.MediaPlayerCommands.Shuffle:
        case uc.MediaPlayerCommands.Repeat:
          log.debug("%s [%s] ignoring unsupported media-player command '%s' to avoid user-facing errors", integrationName, entity.id, cmdId);
          break;
        case "browse":
          const subSource = avrStateManager.getSubSource(entity.id);
          if (isMediaBrowsingAvailable(entity.id, subSource)) {
            await browseMedia(entity.id, { paging: new uc.Paging(1, 50) } as uc.BrowseOptions);
          } else {
            log.debug("%s [%s] ignoring browse request outside supported NET browsing sources", integrationName, entity.id);
          }
          break;
        case uc.MediaPlayerCommands.PlayMedia: {
          const status = await this.playMediaCommandHandler.handle({
            entityId: entity.id,
            mediaId: typeof params?.media_id === "string" ? params.media_id : undefined,
            mediaType: typeof params?.media_type === "string" ? params.media_type : undefined,
            netMenuDelay: targetAvr.netMenuDelay,
            setZonePrefix
          });

          if (status !== uc.StatusCodes.Ok) {
            return status;
          }
          break;
        }
        case uc.MediaPlayerCommands.Next:
          await this.eiscp.command(setZonePrefix("network-usb trup"));
          break;
        case uc.MediaPlayerCommands.Previous:
          await this.eiscp.command(setZonePrefix("network-usb trdn"));
          break;
        case uc.MediaPlayerCommands.Settings:
          await this.eiscp.command(setZonePrefix("setup menu"));
          break;
        case uc.MediaPlayerCommands.Home:
          await this.eiscp.command(setZonePrefix("setup exit"));
          break;
        case uc.MediaPlayerCommands.CursorEnter:
          await this.eiscp.command(setZonePrefix("setup enter"));
          break;
        case uc.MediaPlayerCommands.CursorUp:
          await this.eiscp.command(setZonePrefix("setup up"));
          break;
        case uc.MediaPlayerCommands.CursorDown:
          await this.eiscp.command(setZonePrefix("setup down"));
          break;
        case uc.MediaPlayerCommands.CursorLeft:
          await this.eiscp.command(setZonePrefix("setup left"));
          break;
        case uc.MediaPlayerCommands.CursorRight:
          await this.eiscp.command(setZonePrefix("setup right"));
          break;
        case uc.MediaPlayerCommands.Info:
          await avrStateManager.refreshAvrState(entity.id, this.eiscp, zone, this.driver, queueThreshold, this.commandReceiver);
          break;
        default:
          return uc.StatusCodes.NotImplemented;
      }
      // return uc.StatusCodes.Ok;
    }
    return uc.StatusCodes.Ok;
  }
}
