import * as uc from "@unfoldedcircle/integration-api";
import { EiscpDriver } from "./eiscp.js";
import { buildEntityId, DEFAULT_QUEUE_THRESHOLD, MAX_LENGTHS, PATTERNS, OnkyoConfig } from "./configManager.js";
import { avrStateManager } from "./avrState.js";
import log from "./loggers.js";
import { delay } from "./utils.js";
import { browseTuneInMedia, isMediaBrowsingAvailable, resolveTuneInPreset } from "./mediaBrowser.js";

const integrationName = "commandSender:";

export class CommandSender {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private eiscp: EiscpDriver;
  private lastCommandTime: number = 0;
  private commandReceiver: any; // CommandReceiver type to avoid circular dependency

  constructor(driver: uc.IntegrationAPI, config: OnkyoConfig, eiscp: EiscpDriver, commandReceiver: any) {
    this.driver = driver;
    this.config = config;
    this.eiscp = eiscp;
    this.commandReceiver = commandReceiver;
  }

  private async preserveMainAroundZoneSubsource(model: string, host: string, zone: string, action: () => Promise<void>): Promise<void> {
    if (zone === "main") { // first simple check, as most commands will be for main zone then no need to do any extra processing
      await action();
      return;
    }else{
      const targetEntityId = buildEntityId(model, host, zone);
      const mainEntityId = buildEntityId(model, host, "main");
      const targetSubSource = avrStateManager.getSubSource(targetEntityId);
      const mainSubSource = avrStateManager.getSubSource(mainEntityId);

      if (targetSubSource === mainSubSource) { // no need to switch main source to a different subsource to cater for a request of zones 2/3
        log.info("%s [%s] ***************** no need to switch main subsource for zone '%s'.", integrationName, targetEntityId, zone);
        log.info("%s [%s] ***************** targetEntityId=%s mainEntityId=%s", integrationName, targetEntityId, targetEntityId, mainEntityId);
        log.info("%s [%s] ***************** targetSubSource=%s mainSubSource=%s", integrationName, targetEntityId, targetSubSource, mainSubSource);
        await action();
        return;
      }

      // we are here because of a command coming from zone2/3 which needs to switch subsource (of NET) for the main zone
      const mainSourceBefore = avrStateManager.getSource(mainEntityId);
      const mainPowerBefore = avrStateManager.getPowerState(mainEntityId);
      const mainVolumeBefore = avrStateManager.getVolume(mainEntityId);

      log.info("%s [%s] ***************** need to switch main subsource because of a command for zone '%s'.", integrationName, targetEntityId, zone);
      await this.eiscp.command(`main input-selector net`); // main switch to new subsource or is NET good enough?
      await delay(DEFAULT_QUEUE_THRESHOLD);
      await this.eiscp.command(`main volume 0`);
      await delay(DEFAULT_QUEUE_THRESHOLD);
      await action();

      if (mainPowerBefore === "on") {
        await delay(DEFAULT_QUEUE_THRESHOLD);
        await this.eiscp.command(`main input-selector ${mainSourceBefore}`);
        await delay(DEFAULT_QUEUE_THRESHOLD);
        await this.eiscp.command(`main volume ${mainVolumeBefore}`);
        log.info("%s [%s ***************** main zone restored to %s and volume level %s after NET subsource change for %s.", integrationName, targetEntityId,mainSourceBefore, mainVolumeBefore, zone);
      }else{
        await delay(DEFAULT_QUEUE_THRESHOLD*3);
        this.eiscp.command(`main system-power standby`);
        log.info("%s [%s] ***************** main zone restored to %s after NET subsource change for %s.", integrationName, targetEntityId, mainPowerBefore, zone);
      }
    }
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
    const targetAvr = this.config.avrs?.find((avr) => buildEntityId(avr.model, avr.ip, avr.zone) === entity.id)
      ?? this.config.avrs?.find((avr) => avr.model === model && avr.ip === host)
      ?? null;

    if (!targetAvr) {
      log.error("%s [%s] Cannot route command: no configured AVR matches model='%s' host='%s' zone='%s'", integrationName, entity.id, model, host, zone);
      return uc.StatusCodes.BadRequest;
    }

    // Check if connected, and trigger reconnection if needed
    // This handles the case where user sends a command after wake-up from standby
    // and the driver reconnection hasn't been triggered yet
    if (!this.eiscp.connected) {
      log.info("%s [%s] Command received while disconnected, triggering reconnection...", integrationName, entity.id);
      try {
        const avrConfig = targetAvr;
        if (avrConfig) {
          await this.eiscp.connect({
            model: avrConfig.model,
            host: avrConfig.ip,
            port: avrConfig.port
          });
          await this.eiscp.waitForConnect(3000);
          log.info("%s [%s] Reconnected on command", integrationName, entity.id);
        }
      } catch (connectErr) {
        log.warn("%s [%s] Failed to reconnect on command: %s", integrationName, entity.id, connectErr);
        // Fall through to retry logic below
      }
    }

    try {
      await this.eiscp.waitForConnect();
    } catch (err) {
      log.warn("%s [%s] Could not send command, AVR not connected: %s", integrationName, entity.id, err);
      for (let attempt = 1; attempt <= 5; attempt++) {
        await delay(1000);
        try {
          await this.eiscp.waitForConnect();
          break;
        } catch (retryErr) {
          if (attempt === 5) {
            log.warn("%s [%s] Could not connect to AVR after 5 attempts: %s", integrationName, entity.id, retryErr);
            return uc.StatusCodes.Timeout;
          }
        }
      }
    }

    log.info("%s [%s] media-player command request: %s", integrationName, entity.id, cmdId, params || "");

    // Helper function to format command with zone prefix
    const setZonePrefix = (cmd: string): string => {
      return zone === "main" ? cmd : `${zone}.${cmd}`;
    };

    const now = Date.now();
    // Determine queue threshold: prefer explicit config, then eISCP driver's send_delay, else default
    const queueThreshold = this.config.queueThreshold ?? (typeof this.eiscp["config"]?.send_delay === "number" ? this.eiscp["config"].send_delay : DEFAULT_QUEUE_THRESHOLD);

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
          // if (now - this.lastCommandTime > queueThreshold) {
            this.lastCommandTime = now;
            await this.eiscp.command(setZonePrefix("volume level-up-1db-step"));
          // }
          break;
        case uc.MediaPlayerCommands.VolumeDown:
          // if (now - this.lastCommandTime > queueThreshold) {
            this.lastCommandTime = now;
            await this.eiscp.command(setZonePrefix("volume level-down-1db-step"));
          // }
          break;
        case uc.MediaPlayerCommands.Volume:
          if (params?.volume !== undefined) {
            // Remote slider: 0-100, AVR display: 0-volumeScale, EISCP protocol: 0-200 or 0-100 depending on model
            const sliderValue = Math.max(0, Math.min(100, Number(params.volume)));
            const volumeScale = this.config.volumeScale || 100;
            const adjustVolumeDispl = this.config.adjustVolumeDispl ?? true; // Default to true for backward compatibility

            // Convert: slider → AVR display scale
            const avrDisplayValue = Math.round((sliderValue * volumeScale) / 100);

            // Convert to EISCP: some models use 0.5 dB steps (×2), others show EISCP value directly
            const eiscpValue = adjustVolumeDispl ? avrDisplayValue * 2 : avrDisplayValue;
            const hexVolume = eiscpValue.toString(16).toUpperCase().padStart(2, "0");

            // Debug logging for volume conversion
            log.info(
              "%s [%s] volume conversion: slider=%d volumeScale=%d adjustVolumeDispl=%s avrDisplay=%d eiscpValue=%d hex=%s",
              integrationName,
              entity.id,
              sliderValue,
              volumeScale,
              String(adjustVolumeDispl),
              avrDisplayValue,
              eiscpValue,
              hexVolume
            );

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
          if (isMediaBrowsingAvailable(entity.id)) {
            await browseTuneInMedia(entity.id, { paging: new uc.Paging(1, 50) } as uc.BrowseOptions);
          } else {
            log.debug("%s [%s] ignoring browse request outside NET TuneIn", integrationName, entity.id);
          }
          break;
        case uc.MediaPlayerCommands.PlayMedia: {
          const mediaId = typeof params?.media_id === "string" ? params.media_id : undefined;
          const mediaType = typeof params?.media_type === "string" ? params.media_type : undefined;
          const preset = resolveTuneInPreset(mediaId, mediaType);

          if (!preset) {
            return uc.StatusCodes.NotFound;
          }

          const currentSource = avrStateManager.getSource(entity.id);
          const currentSubSource = avrStateManager.getSubSource(entity.id);
          if (currentSource !== "net" || currentSubSource !== "tunein") {
            await this.eiscp.command(setZonePrefix("input-selector tunein"));
            await delay(targetAvr.netMenuDelay ?? DEFAULT_QUEUE_THRESHOLD);
          }

          await this.eiscp.command(setZonePrefix(`tunein-preset ${preset.presetIndex}`));
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
