// Handler for remote-entity commands. The remote entity exposes the same media-player style commands as the
// media player entity (power, volume, mute, navigation, inputs, ...) plus the generated simple commands.

import * as uc from "@unfoldedcircle/integration-api";
import { RemoteCommands, RemoteAttributes, RemoteStates } from "@unfoldedcircle/integration-api";
import { IPhysicalConnectionLookup, IAvrInstanceLookup, AvrStateApi, ICommandReceiver } from "./types.js";
import { buildPhysicalAvrId } from "./configManager.js";
import { ensureEiscpConnected, delay, toHex } from "./utils.js";
import { ZONE_VOLUME_PREFIX, ZONE_VOLUME_UP_DOWN } from "./zoneMappings.js";
import { SIMPLE_COMMANDS_MAP, ALL_INPUT_SELECTOR_NAMES } from "./simpleCommands.js";
import { MAX_LENGTHS, PATTERNS } from "./configConstants.js";
import { REMOTE_SUFFIX } from "./sensorSuffixes.js";
import log from "./loggers.js";
import { EiscpDriver } from "./eiscp.js";
import { AvrConfig } from "./configManager.js";

const integrationName = "remoteHandler:";
const INPUT_NAMES_SET = new Set(ALL_INPUT_SELECTOR_NAMES);

/** Remote command params can also carry arrays (e.g. send_cmd_sequence). */
type RemoteParams = { [key: string]: string | number | boolean | string[] } | undefined;

export class RemoteCommandHandler {
  constructor(
    private readonly driver: uc.IntegrationAPI,
    private readonly connectionManager: IPhysicalConnectionLookup,
    private readonly avrInstanceManager: IAvrInstanceLookup,
    private readonly avrStateApi: AvrStateApi
  ) {}

  public async handle(entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }): Promise<uc.StatusCodes> {
    const avrEntry = entity.id.replace(REMOTE_SUFFIX, "");
    const instance = this.avrInstanceManager.get(avrEntry);

    if (!instance) {
      log.error("%s [%s] No AVR instance found", integrationName, entity.id);
      return uc.StatusCodes.NotFound;
    }

    const physicalAVR = buildPhysicalAvrId(instance.config.model, instance.config.ip);
    const physicalConnection = this.connectionManager.getPhysicalConnection(physicalAVR);

    if (!physicalConnection) {
      log.error("%s [%s] No physical connection found", integrationName, entity.id);
      return uc.StatusCodes.ServiceUnavailable;
    }

    if (!(await ensureEiscpConnected(physicalConnection.eiscp, { model: instance.config.model, host: instance.config.ip, port: instance.config.port }, entity.id, integrationName))) {
      return uc.StatusCodes.Timeout;
    }

    log.info("%s [%s] remote command request: %s", integrationName, entity.id, cmdId, params ?? "");

    try {
      switch (cmdId) {
        case RemoteCommands.On:
          await this.sendPower(physicalConnection.eiscp, instance.config.zone, entity, "on");
          return uc.StatusCodes.Ok;
        case RemoteCommands.Off:
          await this.sendPower(physicalConnection.eiscp, instance.config.zone, entity, "standby");
          return uc.StatusCodes.Ok;
        case RemoteCommands.Toggle:
          return this.sendToggle(physicalConnection.eiscp, instance.config.zone, entity, avrEntry);
        case RemoteCommands.SendCmd:
          return this.handleSendCmd(entity, physicalConnection.eiscp, physicalConnection.commandReceiver, instance.config, avrEntry, params);
        case RemoteCommands.SendCmdSequence:
          return this.handleSendCmdSequence(entity, physicalConnection.eiscp, physicalConnection.commandReceiver, instance.config, avrEntry, params);
        default:
          // Direct command from a physical button mapping.
          return this.handleCommand(entity, physicalConnection.eiscp, physicalConnection.commandReceiver, instance.config, avrEntry, cmdId, params);
      }
    } catch (err) {
      log.error("%s [%s] Failed to execute remote command %s:", integrationName, entity.id, cmdId, err);
      return uc.StatusCodes.ServerError;
    }
  }

  private async handleSendCmd(entity: uc.Entity, eiscp: EiscpDriver, commandReceiver: ICommandReceiver | undefined, cfg: AvrConfig, avrEntry: string, params: RemoteParams): Promise<uc.StatusCodes> {
    const command = typeof params?.command === "string" ? params.command : "";
    if (!command) {
      log.warn("%s [%s] send_cmd without a command", integrationName, entity.id);
      return uc.StatusCodes.BadRequest;
    }

    const repeat = params && "repeat" in params ? Math.max(1, Number(params.repeat) || 1) : 1;
    const delayMs = params && "delay" in params ? Math.max(0, Number(params.delay) || 0) : 0;

    for (let i = 0; i < repeat; i++) {
      const status = await this.handleCommand(entity, eiscp, commandReceiver, cfg, avrEntry, command, params);
      if (status !== uc.StatusCodes.Ok) return status;
      if (i < repeat - 1 && delayMs > 0) await delay(delayMs);
    }
    return uc.StatusCodes.Ok;
  }

  private async handleSendCmdSequence(
    entity: uc.Entity,
    eiscp: EiscpDriver,
    commandReceiver: ICommandReceiver | undefined,
    cfg: AvrConfig,
    avrEntry: string,
    params: RemoteParams
  ): Promise<uc.StatusCodes> {
    const sequence = Array.isArray(params?.sequence) ? params.sequence.map(String) : [];
    if (sequence.length === 0) {
      log.warn("%s [%s] send_cmd_sequence without a sequence", integrationName, entity.id);
      return uc.StatusCodes.BadRequest;
    }

    const delayMs = params && "delay" in params ? Math.max(0, Number(params.delay) || 0) : 0;

    for (const command of sequence) {
      const status = await this.handleCommand(entity, eiscp, commandReceiver, cfg, avrEntry, command, params);
      if (status !== uc.StatusCodes.Ok) return status;
      if (delayMs > 0) await delay(delayMs);
    }
    return uc.StatusCodes.Ok;
  }

  private async sendPower(eiscp: EiscpDriver, zone: string, entity: uc.Entity, state: "on" | "standby"): Promise<void> {
    await eiscp.command(this.zonePrefixed(zone, `system-power ${state}`));
    this.updateState(entity, state === "on" ? RemoteStates.On : RemoteStates.Off);
  }

  private async sendToggle(eiscp: EiscpDriver, zone: string, entity: uc.Entity, avrEntry: string): Promise<uc.StatusCodes> {
    const isOn = this.avrStateApi.isEntityOn(avrEntry);
    await eiscp.command(this.zonePrefixed(zone, isOn ? "system-power standby" : "system-power on"));
    this.updateState(entity, isOn ? RemoteStates.Off : RemoteStates.On);
    return uc.StatusCodes.Ok;
  }

  private async handleCommand(
    entity: uc.Entity,
    eiscp: EiscpDriver,
    commandReceiver: ICommandReceiver | undefined,
    cfg: AvrConfig,
    avrEntry: string,
    cmdId: string,
    params: RemoteParams
  ): Promise<uc.StatusCodes> {
    const zone = cfg.zone;
    const zonePrefix = (cmd: string): string => this.zonePrefixed(zone, cmd);

    switch (cmdId) {
      case uc.MediaPlayerCommands.On:
        await this.sendPower(eiscp, zone, entity, "on");
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.Off:
        await this.sendPower(eiscp, zone, entity, "standby");
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.Toggle:
        return this.sendToggle(eiscp, zone, entity, avrEntry);
      case uc.MediaPlayerCommands.VolumeUp:
        await eiscp.raw(ZONE_VOLUME_UP_DOWN[zone].up);
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.VolumeDown:
        await eiscp.raw(ZONE_VOLUME_UP_DOWN[zone].down);
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.Volume:
        return this.setVolume(eiscp, cfg, params);
      case uc.MediaPlayerCommands.MuteToggle:
        await eiscp.command(zonePrefix("audio-muting toggle"));
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.Mute:
        await eiscp.command(zonePrefix("audio-muting on"));
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.Unmute:
        await eiscp.command(zonePrefix("audio-muting off"));
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.ChannelUp:
        await eiscp.command(zonePrefix("preset up"));
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.ChannelDown:
        await eiscp.command(zonePrefix("preset down"));
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.CursorUp:
        await eiscp.command(zonePrefix("setup up"));
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.CursorDown:
        await eiscp.command(zonePrefix("setup down"));
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.CursorLeft:
        await eiscp.command(zonePrefix("setup left"));
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.CursorRight:
        await eiscp.command(zonePrefix("setup right"));
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.CursorEnter:
        await eiscp.command(zonePrefix("setup enter"));
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.Settings:
        await eiscp.command(zonePrefix("setup menu"));
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.Home:
      case uc.MediaPlayerCommands.Back:
        await eiscp.command(zonePrefix("setup exit"));
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.Info:
        await this.avrStateApi.refreshAvrState(avrEntry, eiscp, zone, this.driver, cfg.queueThreshold, commandReceiver);
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.SelectSource:
        return this.selectSource(eiscp, zone, zonePrefix, params);
      case uc.MediaPlayerCommands.PlayPause:
        await eiscp.command(zonePrefix("network-usb play"));
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.Next:
        await eiscp.command(zonePrefix("network-usb trup"));
        return uc.StatusCodes.Ok;
      case uc.MediaPlayerCommands.Previous:
        await eiscp.command(zonePrefix("network-usb trdn"));
        return uc.StatusCodes.Ok;
      default:
        return this.handleSimpleOrRaw(entity, eiscp, zone, cmdId);
    }
  }

  private async setVolume(eiscp: EiscpDriver, cfg: AvrConfig, params: RemoteParams): Promise<uc.StatusCodes> {
    if (params?.volume === undefined) return uc.StatusCodes.Ok;
    const volumeDisplay = String(cfg.volumeDisplay ?? "absolute").toLowerCase() === "relative" ? "relative" : "absolute";
    if (volumeDisplay !== "absolute") {
      log.debug("%s volume set to relative so slider is ignored.", integrationName);
      return uc.StatusCodes.Ok;
    }
    const sliderValue = Math.max(0, Math.min(100, Number(params.volume)));
    const volumeScale = cfg.volumeScale || 100;
    const adjustVolumeDispl = cfg.adjustVolumeDispl ?? true;
    const avrDisplayValue = Math.round((sliderValue * volumeScale) / 100);
    const eiscpValue = adjustVolumeDispl ? avrDisplayValue * 2 : avrDisplayValue;
    await eiscp.raw(`${ZONE_VOLUME_PREFIX[cfg.zone]}${toHex(eiscpValue, 2)}`);
    return uc.StatusCodes.Ok;
  }

  private async selectSource(eiscp: EiscpDriver, zone: string, zonePrefix: (cmd: string) => string, params: RemoteParams): Promise<uc.StatusCodes> {
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
      await eiscp.raw(rawCmd);
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
      await eiscp.command(request);
    } else if (INPUT_NAMES_SET.has(request)) {
      await eiscp.command(zonePrefix(`input-selector ${request}`));
    } else {
      await eiscp.command(zonePrefix(request));
    }
    return uc.StatusCodes.Ok;
  }

  private async handleSimpleOrRaw(entity: uc.Entity, eiscp: EiscpDriver, zone: string, cmdId: string): Promise<uc.StatusCodes> {
    if (cmdId.startsWith("raw ")) {
      const rawCmd = cmdId.substring(4).trim().toUpperCase();
      if (rawCmd.length === 0 || rawCmd.length > MAX_LENGTHS.RAW_COMMAND || !PATTERNS.RAW_COMMAND.test(rawCmd)) {
        log.error("%s [%s] Invalid raw command: %s", integrationName, entity.id, cmdId);
        return uc.StatusCodes.BadRequest;
      }
      await eiscp.raw(rawCmd);
      return uc.StatusCodes.Ok;
    }

    const commandStr = SIMPLE_COMMANDS_MAP[cmdId];
    if (!commandStr) {
      log.warn("%s [%s] Unknown command: %s", integrationName, entity.id, cmdId);
      return uc.StatusCodes.NotImplemented;
    }

    const zonePrefixed = zone === "main" ? commandStr : `${zone}.${commandStr}`;
    log.info("%s [%s] executing simple command '%s' → %s", integrationName, entity.id, cmdId, zonePrefixed);
    await eiscp.command(zonePrefixed);
    return uc.StatusCodes.Ok;
  }

  private zonePrefixed(zone: string, cmd: string): string {
    return zone === "main" ? cmd : `${zone}.${cmd}`;
  }

  private updateState(entity: uc.Entity, state: uc.RemoteStates): void {
    if (typeof this.driver.updateEntityAttributes === "function") {
      this.driver.updateEntityAttributes(entity.id, { [RemoteAttributes.State]: state });
    }
  }
}
