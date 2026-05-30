import net from "net";
import dgram from "dgram";
import log from "./loggers.js";

import EventEmitter from "events";
import { eiscpMappings } from "./eiscp-mappings.js";
import { DEFAULT_QUEUE_THRESHOLD, buildEntityId } from "./configManager.js";
import { delay } from "./utils.js";
import { IscpCommandParser, type CommandResult } from "./eiscp-command-parser.js";
import { createEiscpPacket, extractIscpMessage, extractAllIscpMessages } from "./eiscp-packet.js";
import { buildMultiZoneVolumeCommands, buildMultiZoneMuteCommands } from "./eiscp-multi-zone.js";
import { avrStateManager } from "./avrState.js";
import { getTidalBrowseState } from "./tidalBrowserStore.js";

export interface EiscpConfig {
  host?: string;
  port?: number;
  model?: string;
  reconnect?: boolean;
  reconnectSleep?: number;
  sendDelay?: number;
  receiveDelay?: number;
  netMenuDelay?: number;
  tuneinPresetPosition?: number;
  configuredZones?: string[]; // Zones configured for this physical AVR (e.g., ["main", "zone2"])
}

const COMMAND_MAPPINGS = eiscpMappings.command_mappings;
const VALUE_MAPPINGS = eiscpMappings.value_mappings;
const integrationName = "eISCP:";
const IGNORED_COMMANDS = new Set(["NMS", "NPB"]); // Commands to ignore from AVR (NMS=menu, NPB=playback info)
const THROTTLED_COMMANDS = new Set(["IFA", "IFV", "FLD"]); // Commands to send to incoming queue for throttling
const FLD_VOLUME_HEX_PREFIX = "566F6C756D65"; // "Volume" in hex - skip these FLD messages

// Zone command prefix mappings (main -> zone-specific)
const ZONE2_COMMAND_MAP: Record<string, string> = {
  MVL: "ZVL",
  PWR: "ZPW",
  AMT: "ZMT",
  SLI: "SLZ",
  TUN: "TUZ"
};
const ZONE3_COMMAND_MAP: Record<string, string> = {
  MVL: "VL3",
  PWR: "PW3",
  AMT: "MT3",
  SLI: "SL3",
  TUN: "TU3"
};
const ZONE4_COMMAND_MAP: Record<string, string> = {
  MVL: "VL4",
  PWR: "PW4",
  AMT: "MT4",
  SLI: "SL4",
  TUN: "TU4"
};

// Reverse mappings (zone-specific -> main) for parsing incoming commands are in eiscp-command-parser.ts

/** Result from parsing an ISCP command — re-exported from eiscp-command-parser.ts */
export type { CommandResult };

/** Data payload emitted on 'data' event */
interface DataPayload {
  command: string | undefined;
  argument: string | number | string[] | Record<string, string> | undefined;
  zone: string | undefined;
  iscpCommand: string;
  host: string | undefined;
  port: number | undefined;
  model: string | undefined;
}

/** Discovered AVR device info */
interface DiscoveredDevice {
  host: string;
  port: string;
  model: string;
  mac: string;
  areacode: string;
}

/** Command input as object */
interface CommandInput {
  zone?: string;
  command: string;
  args: string | number;
}

export class EiscpDriver extends EventEmitter {
  public get connected(): boolean {
    return this.isConnected;
  }

  /** Read-only access to the current driver configuration. */
  public get eiscpConfig(): Readonly<EiscpConfig> {
    return this.config;
  }

  /** Merge a partial config patch into the current configuration. */
  public updateConfig(patch: Partial<EiscpConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  private config: EiscpConfig;
  private eiscp: net.Socket | null = null;
  private isConnected = false;
  private sendQueue: Promise<void> = Promise.resolve();
  private receiveQueue: Promise<void> = Promise.resolve();
  private tcpBuffer: Buffer = Buffer.alloc(0);
  private readonly commandParser: IscpCommandParser;

  constructor(config?: EiscpConfig) {
    super();
    this.config = {
      host: config?.host,
      port: config?.port ?? 60128,
      model: config?.model,
      reconnect: config?.reconnect ?? false,
      reconnectSleep: config?.reconnectSleep ?? 5,
      sendDelay: config?.sendDelay ?? DEFAULT_QUEUE_THRESHOLD,
      receiveDelay: config?.receiveDelay ?? DEFAULT_QUEUE_THRESHOLD,
      netMenuDelay: config?.netMenuDelay ?? 2500,
      tuneinPresetPosition: config?.tuneinPresetPosition ?? 1,
      configuredZones: config?.configuredZones
    };
    this.commandParser = new IscpCommandParser((zone) => buildEntityId(this.config.model!, this.config.host!, zone), avrStateManager, {
      getBrowseState: getTidalBrowseState
    });
    if (this.listenerCount("error") === 0) {
      this.on("error", (err: Error) => {
        log.error("%s eiscp error (unhandled):", integrationName, err);
      });
    }
  }

  /** Translate main zone command prefix to zone-specific prefix */
  private getZonePrefix(prefix: string, zone: string): string {
    const zoneMaps: Record<string, Record<string, string>> = { zone2: ZONE2_COMMAND_MAP, zone3: ZONE3_COMMAND_MAP, zone4: ZONE4_COMMAND_MAP };
    return zoneMaps[zone]?.[prefix] ?? prefix;
  }

  async discover(options?: { devices?: number; timeout?: number; address?: string; port?: number; subnetBroadcast?: string }): Promise<DiscoveredDevice[]> {
    return new Promise((resolve, reject) => {
      const result: DiscoveredDevice[] = [];
      // Always default to broadcast unless address is explicitly provided
      const opts = {
        devices: options?.devices ?? 1,
        timeout: options?.timeout ?? 10,
        address: typeof options?.address === "string" ? options.address : "255.255.255.255",
        port: options?.port ?? 60128
      };
      const client = dgram.createSocket("udp4");
      let timeoutTimer: NodeJS.Timeout;
      function close() {
        try {
          client.close();
        } catch {}
        resolve(result);
      }
      client
        .on("error", (err: Error) => {
          log.error("%s UDP error:", integrationName, err);
          try {
            client.close();
          } catch {}
          // Don't reject immediately - allow timeout to complete for graceful handling, Only reject if timeout hasn't been set yet (meaning bind failed)
          if (!timeoutTimer) {
            reject(err);
          }
        })
        .on("message", (packet: Buffer, rinfo: dgram.RemoteInfo) => {
          const message = extractAllIscpMessages(packet)[0] ?? extractIscpMessage(packet);
          const command = message.slice(0, 3);
          if (command === "ECN") {
            const data = message.slice(3).split("/");
            result.push({
              host: rinfo.address,
              port: data[1],
              model: data[0],
              mac: data[3].slice(0, 12),
              areacode: data[2]
            });
            if (result.length >= opts.devices) {
              clearTimeout(timeoutTimer);
              close();
            }
          }
        })
        .on("listening", () => {
          client.setBroadcast(true);
          const buffer = createEiscpPacket("!xECNQSTN");
          client.send(buffer, 0, buffer.length, opts.port, opts.address, (err) => {
            if (err) {
              // Log but don't fail - network might not be ready yet (ENETUNREACH)
              log.error("%s UDP send error (network may not be ready):", integrationName, err);
              // Close client and resolve with empty result - configured AVRs will still be tried
              clearTimeout(timeoutTimer);
              close();
            }
          });
          timeoutTimer = setTimeout(close, opts.timeout * 1000);
        })
        .on("close", () => {
          log.info("%s UDP socket closed", integrationName);
        })
        .bind(0, undefined, (err?: Error) => {
          if (err) log.error("%s UDP bind error:", integrationName, err);
        });
    });
  }

  async connect(options?: EiscpConfig): Promise<{ model: string; host: string; port: number } | null> {
    this.config = { ...this.config, ...options };
    // Discover host/model if missing
    if (!this.config.host || !this.config.model) {
      // Always use broadcast address for autodiscover if host is missing
      const hosts = await this.discover({ address: "255.255.255.255" });
      if (hosts && hosts.length > 0) {
        const h = hosts[0];
        this.config.host = h.host;
        this.config.port = Number(h.port);
        this.config.model = h.model;
      } else {
        log.error("%s No AVR found during discovery.", integrationName);
        return null;
      }
    }
    // Ensure port is always a number
    const port = typeof this.config.port === "number" ? this.config.port : 60128;
    // If already connected, return info
    if (this.isConnected && this.eiscp) {
      return { model: this.config.model!, host: this.config.host!, port };
    }
    // If socket exists, try to connect
    if (this.eiscp) {
      this.eiscp.connect(port, this.config.host!);
      return { model: this.config.model!, host: this.config.host!, port };
    }
    // Create new socket and connect
    this.eiscp = net.connect(port, this.config.host!);
    this.eiscp
      .on("connect", () => {
        this.tcpBuffer = Buffer.alloc(0); // Clear any stale bytes from a previous connection.
        this.isConnected = true;
        this.emit("connect"); // Emit connect event for waitForConnect()
      })
      .on("close", () => {
        this.tcpBuffer = Buffer.alloc(0);
        const wasConnected = this.isConnected;
        this.isConnected = false;
        if (wasConnected) {
          log.warn("%s Connection closed for %s at %s:%d", integrationName, this.config.model, this.config.host, this.config.port || 60128);
        }
        if (this.config.reconnect) {
          log.info("%s Scheduling reconnection in %ds", integrationName, this.config.reconnectSleep);
          setTimeout(() => this.connect(), this.config.reconnectSleep! * 1000);
        }
      })
      .on("error", (err) => {
        log.error("%s Socket error for %s at %s:%d - %s", integrationName, this.config.model, this.config.host, this.config.port || 60128, err.message);
        this.isConnected = false;
        this.eiscp?.destroy();
      })
      .on("data", (data: Buffer) => {
        // Accumulate into a stream buffer — ISCP frames can be split across TCP segments.
        this.tcpBuffer = Buffer.concat([this.tcpBuffer, data]);

        let offset = 0;
        while (offset + 16 <= this.tcpBuffer.length) {
          // Verify ISCP magic at current offset.
          if (this.tcpBuffer.toString("ascii", offset, offset + 4) !== "ISCP") {
            // Out of sync — advance one byte and retry.
            offset++;
            continue;
          }

          const headerSize = this.tcpBuffer.readUInt32BE(offset + 4);
          const dataSize = this.tcpBuffer.readUInt32BE(offset + 8);
          if (headerSize < 16 || dataSize < 4) {
            offset++;
            continue;
          }

          const frameEnd = offset + headerSize + dataSize;
          if (frameEnd > this.tcpBuffer.length) {
            // Incomplete frame — wait for more TCP data.
            break;
          }

          // Extract the complete ISC message (strip "!1" prefix and "\r\n" suffix).
          const iscpMessage = this.tcpBuffer.toString("ascii", offset + headerSize + 2, frameEnd - 2);
          offset = frameEnd;

          let command = iscpMessage.slice(0, 3);
          let value = iscpMessage.slice(3);

          // log.info("%s RAW (0) RECEIVE: [%s] %s %s", integrationName, command, value);

          if (IGNORED_COMMANDS.has(command)) {
            continue;
          }

          if (command === "FLD" && value.slice(0, 12) === FLD_VOLUME_HEX_PREFIX) {
            continue;
          }

          value = String(value)
            .replace(/[\x00-\x1F]/g, "")
            .trim();

          const parsed = this.commandParser.parse(command, value);
          if (!parsed) {
            continue;
          }

          const dataPayload: DataPayload = {
            command: parsed.command,
            argument: parsed.argument,
            zone: parsed.zone,
            iscpCommand: iscpMessage,
            host: this.config.host,
            port: this.config.port,
            model: this.config.model
          };

          if (THROTTLED_COMMANDS.has(command)) {
            this.enqueueIncoming(dataPayload);
          } else {
            this.emit("data", dataPayload);
          }
        }

        // Keep any unconsumed bytes for the next data event.
        this.tcpBuffer = offset > 0 ? this.tcpBuffer.slice(offset) : this.tcpBuffer;
      });
    return { model: this.config.model!, host: this.config.host!, port: this.config.port! };
  }

  disconnect() {
    if (this.isConnected && this.eiscp) {
      this.eiscp.destroy();
    }
  }

  /** Enqueue a command to be sent with proper delay between commands */
  private enqueueSend(data: string | string[]): Promise<void> {
    const task = this.sendQueue.then(async () => {
      if (this.isConnected && this.eiscp) {
        // Handle single command (most common case)
        if (typeof data === "string") {
          this.eiscp.write(createEiscpPacket(data));
        } else {
          for (const cmd of data) {
            this.eiscp.write(createEiscpPacket(cmd));
          }
        }
        await delay(this.config.sendDelay! ?? DEFAULT_QUEUE_THRESHOLD);
      } else {
        throw new Error("Send command while not connected");
      }
    });
    this.sendQueue = task.catch(() => {}); // Prevent unhandled rejection, errors handled by caller
    return task;
  }

  /** Enqueue an incoming message to be emitted with throttle delay */
  private enqueueIncoming(data: DataPayload): void {
    this.receiveQueue = this.receiveQueue
      .then(async () => {
        await delay(this.config.receiveDelay! ?? DEFAULT_QUEUE_THRESHOLD);
        this.emit("data", data);
      })
      .catch((err) => {
        log.error("%s Error processing queued incoming message:", integrationName, err);
      });
  }

  /** Send a raw ISCP command */
  async raw(data: string): Promise<void> {
    if (!data) {
      throw new Error("No data provided");
    }
    return this.enqueueSend(data);
  }

  private async handleTIPsend(iscpCommand: string): Promise<void> {
    // Assumes TuneIn is already the active source.
    const presetHex = iscpCommand.slice(3);
    const preset = parseInt(presetHex, 16);
    const presetIndex = String(preset).padStart(5, "0");
    const menuDelay = this.config.netMenuDelay ?? 2500;
    const myPresetsPosition = String(this.config.tuneinPresetPosition ?? 1).padStart(5, "0");

    log.info("%s TuneIn preset %d: navigating to My Presets (position %s), selecting index %s", integrationName, preset, myPresetsPosition, presetIndex);

    this.commandParser.patchMetadata({ artist: `Selecting preset ${preset}...`, album: "please wait" });
    this.emit("data", {
      command: "metadata",
      argument: { ...this.commandParser.getMetadata() },
      zone: "main",
      iscpCommand: iscpCommand,
      host: this.config.host,
      port: this.config.port,
      model: this.config.model
    });

    await this.raw("NTCTOP"); // Go to TuneIn top menu
    await delay(menuDelay);
    await this.raw("NTCSELECT"); // Confirm / enter
    await delay(menuDelay * 3);
    await this.raw(`NLSI${myPresetsPosition}`); // Navigate down to My Presets (first position)
    await delay(menuDelay * 2);
    await this.raw(`NLSI${presetIndex}`); // Select preset by index
  }

  /** Fast TIP detector with validation only when prefix matches */
  private isTIPCommand(iscpCommand: string): boolean {
    if (!iscpCommand.startsWith("TIP")) {
      return false;
    }
    const presetHex = iscpCommand.slice(3);
    return presetHex.length > 0 && /^[0-9A-Fa-f]+$/.test(presetHex);
  }

  /** Fast NSS extractor supporting both direct NSSxx and embedded command forms */
  private extractNSSCode(iscpCommand: string): string | undefined {
    const nssIndex = iscpCommand.indexOf("NSS");
    if (nssIndex === -1 || nssIndex + 5 > iscpCommand.length) {
      return undefined;
    }

    const d1 = iscpCommand.charCodeAt(nssIndex + 3);
    const d2 = iscpCommand.charCodeAt(nssIndex + 4);
    const isDigit1 = d1 >= 48 && d1 <= 57;
    const isDigit2 = d2 >= 48 && d2 <= 57;
    if (!isDigit1 || !isDigit2) {
      return undefined;
    }

    return iscpCommand.slice(nssIndex, nssIndex + 5);
  }

  private async handleNSSsend(nssCode: string, zone: string): Promise<void> {
    const menuDelay = this.config.netMenuDelay ?? 2500;
    const sliPrefix = this.getZonePrefix("SLI", zone);
    const netCommand = `${sliPrefix}2B`; // 2B = NET input
    const queryCommand = `${sliPrefix}QSTN`;
    const newSubsource = String(nssCode.slice(-2)).padStart(5, "0");

    log.debug("%s Sending %s (NET input for zone %s) before %s", integrationName, netCommand, zone, nssCode);
    await this.raw(netCommand); // Select NET input first
    await delay(menuDelay); // Wait for AVR to switch/acknowledge NET input

    // NTCTOP exits any active sub-service (e.g. Spotify) and returns to the NET root menu.
    // Without this, if the AVR was already on NET/Spotify, SLI2B is a no-op and NLSI
    // would select from Spotify's menu instead of the NET top-level service list.
    await this.raw("NTCTOP");
    await delay(menuDelay); // Wait for AVR to fully load NET menu

    log.debug("%s Sending network service command: %s", integrationName, nssCode);
    await this.raw(`NLSI${newSubsource}`);
    await delay(menuDelay);
    await this.raw(queryCommand); // Query input-selector to ensure source state updates
  }

  private async sendIscp(iscpCommand: string, zone: string = "main"): Promise<void> {
    // Hot path: most commands are plain ISCP and do not require TIP/NSS special handling.
    if (!iscpCommand.startsWith("TIP") && iscpCommand.indexOf("NSS") === -1) {
      await this.raw(iscpCommand);
      return;
    }

    // Handle TuneIn preset navigation.
    if (this.isTIPCommand(iscpCommand)) {
      return this.handleTIPsend(iscpCommand);
    }

    // Handle network service selection (NSSxx), including embedded forms like "SLINSS01".
    const nssCode = this.extractNSSCode(iscpCommand);
    if (nssCode) {
      return this.handleNSSsend(nssCode, zone);
    }
  }

  /** Send a command to the AVR */
  async command(data: string | CommandInput): Promise<void> {
    let command: string, args: string | number, zone: string;

    if (typeof data === "string") {
      const normalizedData = data.toLowerCase();

      // Fast path: most commands are not multi-zone, so only check detailed variants when needed.
      if (normalizedData.startsWith("multi-zone-")) {
        if (normalizedData.startsWith("multi-zone-volume")) {
          await this.handleMultiZoneVolume(data);
          return;
        }
        if (normalizedData.startsWith("multi-zone-muting")) {
          await this.handleMultiZoneMuting(data);
          return;
        }
      }

      const parts = normalizedData.split(/[\s.=:]/).filter((item) => item !== "");
      if (parts.length === 3) {
        zone = parts[0];
        command = parts[1];
        args = parts[2];
      } else if (parts.length === 2) {
        zone = "main";
        command = parts[0];
        args = parts[1];
      } else {
        await this.sendIscp(this.commandToIscp(data, undefined, "main"), "main");
        return;
      }
    } else if (typeof data === "object" && data !== null) {
      zone = data.zone ?? "main";
      command = data.command;
      args = data.args;
    } else {
      await this.sendIscp(this.commandToIscp(String(data), undefined, "main"), "main");
      return;
    }
    await this.sendIscp(this.commandToIscp(command, args, zone), zone);
  }

  private async handleMultiZoneVolume(data: string): Promise<void> {
    const parts = data
      .toLowerCase()
      .split(/[\s]+/)
      .filter((item) => item !== "");

    if (parts.length !== 2) {
      log.warn("%s Invalid multi-zone-volume command format: %s", integrationName, data);
      return;
    }

    const action = parts[1];
    const configuredZones = this.config.configuredZones ?? ["main"];
    const commands = buildMultiZoneVolumeCommands(action, configuredZones);

    if (commands.length === 0) {
      log.warn("%s No zones configured for multi-zone-volume action: %s (configured zones: %s)", integrationName, action, configuredZones.join(", "));
      return;
    }

    log.info("%s Multi-zone volume command: %s -> sending %d zone commands (configured zones: %s)", integrationName, data, commands.length, configuredZones.join(", "));
    this.enqueueSend(commands);
  }

  private async handleMultiZoneMuting(data: string): Promise<void> {
    const parts = data
      .toLowerCase()
      .split(/[\s]+/)
      .filter((item) => item !== "");

    if (parts.length !== 2) {
      log.warn("%s Invalid multi-zone-muting command format: %s", integrationName, data);
      return;
    }

    const action = parts[1];
    const configuredZones = this.config.configuredZones ?? ["main"];
    const commands = buildMultiZoneMuteCommands(action, configuredZones);

    if (commands.length === 0) {
      log.warn("%s No zones configured for multi-zone-muting action: %s (configured zones: %s)", integrationName, action, configuredZones.join(", "));
      return;
    }

    log.info("%s Multi-zone muting command: %s -> sending %d zone commands (configured zones: %s)", integrationName, data, commands.length, configuredZones.join(", "));
    this.enqueueSend(commands);
  }

  private commandToIscp(command: string, args: string | number | undefined, zone: string): string {
    const prefix = (COMMAND_MAPPINGS as Record<string, string>)[command];
    let value: string;
    const valueMap = (VALUE_MAPPINGS as unknown as Record<string, Record<string, { value: string }>>)[prefix];
    if (args !== undefined && valueMap && Object.prototype.hasOwnProperty.call(valueMap, args)) {
      value = valueMap[String(args)].value;
    } else if (valueMap && Object.prototype.hasOwnProperty.call(valueMap, "intgrRange")) {
      value = (+args!).toString(16).toUpperCase().padStart(2, "0");
    } else {
      log.warn("%s not found in JSON: %s %s", integrationName, command, args);
      value = String(args ?? "");
    }

    // Translate main zone command prefixes to zone-specific prefixes
    const zonePrefix = this.getZonePrefix(prefix, zone);

    return zonePrefix + value;
  }

  /** Get all available commands */
  getCommands(): string[] {
    const mappings = COMMAND_MAPPINGS as Record<string, string>;
    return Object.keys(mappings);
  }

  /** Get all available values for a command */
  getCommandValues(command: string): string[] {
    const parts = command.split(".");
    const cmd = parts.length === 2 ? parts[1] : parts[0];
    const prefix = (COMMAND_MAPPINGS as Record<string, string>)[cmd];
    const valueMap = (VALUE_MAPPINGS as Record<string, Record<string, unknown>>)[prefix] ?? {};
    return Object.keys(valueMap);
  }

  waitForConnect(timeoutMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        resolve();
        return;
      }
      let timer: NodeJS.Timeout;
      const onConnect = () => {
        clearTimeout(timer);
        this.off("connect", onConnect);
        resolve();
      };
      timer = setTimeout(() => {
        this.off("connect", onConnect);
        reject(new Error("Timeout waiting for AVR connection"));
      }, timeoutMs);
      this.on("connect", onConnect);
    });
  }
}

export default EiscpDriver;
