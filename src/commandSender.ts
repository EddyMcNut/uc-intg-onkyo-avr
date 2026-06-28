import * as uc from "@unfoldedcircle/integration-api";
import { EiscpDriver } from "./eiscp.js";
import { buildEntityId, DEFAULT_QUEUE_THRESHOLD, OnkyoConfig } from "./configManager.js";
import { MAX_LENGTHS, PATTERNS } from "./configConstants.js";
import { ICommandReceiver, AvrStateApi } from "./types.js";
import { ZONE_VOLUME_PREFIX, ZONE_VOLUME_UP_DOWN } from "./zoneMappings.js";
import { SIMPLE_COMMANDS_MAP, ALL_INPUT_SELECTOR_NAMES } from "./simpleCommands.js";
const INPUT_NAMES_SET = new Set(ALL_INPUT_SELECTOR_NAMES);
import log from "./loggers.js";
import { toHex, ensureEiscpConnected } from "./utils.js";
import { browseMedia, isMediaBrowsingAvailable } from "./mediaBrowser.js";
import { PlayMediaCommandHandler } from "./playMediaCommandHandler.js";

const integrationName = "commandSender:";

export class CommandSender {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private eiscp: EiscpDriver;
  private avrStateApi: AvrStateApi;
  private lastCommandTime: number = 0;
  private commandReceiver: ICommandReceiver | undefined;
  private playMediaCommandHandler: PlayMediaCommandHandler;

  constructor(driver: uc.IntegrationAPI, config: OnkyoConfig, eiscp: EiscpDriver, avrStateApi: AvrStateApi, commandReceiver: ICommandReceiver | undefined) {
    this.driver = driver;
    this.config = config;
    this.eiscp = eiscp;
    this.avrStateApi = avrStateApi;
    this.commandReceiver = commandReceiver;
    this.playMediaCommandHandler = new PlayMediaCommandHandler(this.eiscp, this.avrStateApi, this.commandReceiver);
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

    if (!(await ensureEiscpConnected(this.eiscp, { model: targetAvr.model, host: targetAvr.ip, port: targetAvr.port }, entity.id, integrationName))) {
      return uc.StatusCodes.Timeout;
    }

    log.info("%s [%s] media-player command request: %s", integrationName, entity.id, cmdId, params || "");

    const setZonePrefix = (cmd: string): string => (zone === "main" ? cmd : `${zone}.${cmd}`);

    const now = Date.now();
    const queueThreshold = this.config.queueThreshold ?? (typeof this.eiscp.eiscpConfig?.sendDelay === "number" ? this.eiscp.eiscpConfig.sendDelay : DEFAULT_QUEUE_THRESHOLD);

    if (now - this.lastCommandTime <= queueThreshold) {
      return uc.StatusCodes.Ok;
    }

    const handler = this.handlers.get(cmdId);
    if (!handler) {
      if (cmdId === uc.MediaPlayerCommands.Shuffle || cmdId === uc.MediaPlayerCommands.Repeat) {
        log.debug("%s [%s] ignoring unsupported media-player command '%s'", integrationName, entity.id, cmdId);
        return uc.StatusCodes.Ok;
      }
      return this.handleSimpleCommand(cmdId, zone);
    }

    return handler(entity, zone, setZonePrefix, params, targetAvr, queueThreshold, now);
  }

  private readonly handlers = new Map<
    string,
    (
      entity: uc.Entity,
      zone: string,
      setZonePrefix: (cmd: string) => string,
      params: { [key: string]: string | number | boolean } | undefined,
      targetAvr: import("./configManager.js").AvrConfig,
      queueThreshold: number,
      now: number
    ) => Promise<uc.StatusCodes>
  >([
    [
      uc.MediaPlayerCommands.On,
      async (_e, _zone, sz) => {
        await this.eiscp.command(sz("system-power on"));
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.Off,
      async (_e, _zone, sz) => {
        await this.eiscp.command(sz("system-power standby"));
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.Toggle,
      async (entity, _zone, sz) => {
        entity.attributes?.state === uc.MediaPlayerStates.On ? await this.eiscp.command(sz("system-power standby")) : await this.eiscp.command(sz("system-power on"));
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.MuteToggle,
      async (_e, _zone, sz) => {
        await this.eiscp.command(sz("audio-muting toggle"));
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.VolumeUp,
      async (_e, zone, _sz, _p, _t, _q, now) => {
        this.lastCommandTime = now;
        await this.eiscp.raw(ZONE_VOLUME_UP_DOWN[zone].up);
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.VolumeDown,
      async (_e, zone, _sz, _p, _t, _q, now) => {
        this.lastCommandTime = now;
        await this.eiscp.raw(ZONE_VOLUME_UP_DOWN[zone].down);
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.Volume,
      async (_e, zone, _sz, params) => {
        if (params?.volume === undefined) return uc.StatusCodes.Ok;
        const volumeDisplay = String(this.config.volumeDisplay ?? "absolute").toLowerCase() === "relative" ? "relative" : "absolute";
        if (volumeDisplay !== "absolute") {
          log.debug("%s volume set to relative so slider is ignored.", integrationName);
          return uc.StatusCodes.Ok;
        }
        const sliderValue = Math.max(0, Math.min(100, Number(params.volume)));
        const volumeScale = this.config.volumeScale || 100;
        const adjustVolumeDispl = this.config.adjustVolumeDispl ?? true;
        const avrDisplayValue = Math.round((sliderValue * volumeScale) / 100);
        const eiscpValue = adjustVolumeDispl ? avrDisplayValue * 2 : avrDisplayValue;
        await this.eiscp.raw(`${ZONE_VOLUME_PREFIX[zone]}${toHex(eiscpValue, 2)}`);
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.ChannelUp,
      async (_e, zone, sz) => {
        await this.eiscp.command(sz("preset up"));
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.ChannelDown,
      async (_e, zone, sz) => {
        await this.eiscp.command(sz("preset down"));
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.SelectSource,
      async (_e, _zone, sz, params) => {
        if (!params?.source || typeof params.source !== "string") return uc.StatusCodes.Ok;
        const request = params.source.toLowerCase();
        if (request.startsWith("raw ")) {
          const rawCmd = request.substring(3).trim().toUpperCase();
          if (rawCmd.length > MAX_LENGTHS.RAW_COMMAND) {
            log.error("%s Raw command too long (%d chars), rejecting", integrationName, rawCmd.length);
            return uc.StatusCodes.BadRequest;
          }
          if (!PATTERNS.RAW_COMMAND.test(rawCmd)) {
            log.error("%s Raw command contains invalid characters, rejecting", integrationName);
            return uc.StatusCodes.BadRequest;
          }
          await this.eiscp.raw(rawCmd);
          return uc.StatusCodes.Ok;
        }

        if (request.length > MAX_LENGTHS.USER_COMMAND) {
          log.error("%s Command too long (%d chars), rejecting", integrationName, request.length);
          return uc.StatusCodes.BadRequest;
        }
        if (!PATTERNS.USER_COMMAND.test(request)) {
          log.error("%s Command contains invalid characters, rejecting", integrationName);
          return uc.StatusCodes.BadRequest;
        }

        if (request.startsWith("multi-zone")) {
          await this.eiscp.command(request);
        } else if (INPUT_NAMES_SET.has(request)) {
          await this.eiscp.command(sz(`input-selector ${request}`));
        } else {
          await this.eiscp.command(sz(request));
        }
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.PlayPause,
      async (_e, zone, sz) => {
        await this.eiscp.command(sz("network-usb play"));
        return uc.StatusCodes.Ok;
      }
    ],
    [
      "browse",
      async (entity) => {
        const subSource = this.avrStateApi.getSubSource(entity.id);
        if (isMediaBrowsingAvailable(entity.id, subSource)) {
          await browseMedia(entity.id, { paging: new uc.Paging(1, 50) } as uc.BrowseOptions);
        }
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.PlayMedia,
      async (entity, _zone, sz, params, targetAvr) => {
        const status = await this.playMediaCommandHandler.handle({
          entityId: entity.id,
          mediaId: typeof params?.media_id === "string" ? params.media_id : undefined,
          mediaType: typeof params?.media_type === "string" ? params.media_type : undefined,
          netMenuDelay: targetAvr.netMenuDelay,
          setZonePrefix: sz
        });
        return status;
      }
    ],
    [
      uc.MediaPlayerCommands.Next,
      async (_e, zone, sz) => {
        await this.eiscp.command(sz("network-usb trup"));
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.Previous,
      async (_e, zone, sz) => {
        await this.eiscp.command(sz("network-usb trdn"));
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.Settings,
      async (_e, zone, sz) => {
        await this.eiscp.command(sz("setup menu"));
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.Home,
      async (_e, zone, sz) => {
        await this.eiscp.command(sz("setup exit"));
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.CursorEnter,
      async (_e, zone, sz) => {
        await this.eiscp.command(sz("setup enter"));
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.CursorUp,
      async (_e, zone, sz) => {
        await this.eiscp.command(sz("setup up"));
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.CursorDown,
      async (_e, zone, sz) => {
        await this.eiscp.command(sz("setup down"));
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.CursorLeft,
      async (_e, zone, sz) => {
        await this.eiscp.command(sz("setup left"));
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.CursorRight,
      async (_e, zone, sz) => {
        await this.eiscp.command(sz("setup right"));
        return uc.StatusCodes.Ok;
      }
    ],
    [
      uc.MediaPlayerCommands.Info,
      async (entity, zone, _sz, _p, _t, queueThreshold) => {
        await this.avrStateApi.refreshAvrState(entity.id, this.eiscp, zone, this.driver, queueThreshold, this.commandReceiver);
        return uc.StatusCodes.Ok;
      }
    ]
  ]);

  private async handleSimpleCommand(cmdId: string, zone: string): Promise<uc.StatusCodes> {
    const commandStr = SIMPLE_COMMANDS_MAP[cmdId];
    if (!commandStr) {
      return uc.StatusCodes.NotImplemented;
    }

    const zonePrefixed = zone === "main" ? commandStr : `${zone}.${commandStr}`;
    log.info("%s executing simple command '%s' → %s", integrationName, cmdId, zonePrefixed);
    await this.eiscp.command(zonePrefixed);
    return uc.StatusCodes.Ok;
  }
}
