import net from "net";
import dgram from "dgram";
import log from "./loggers.js";

import EventEmitter from "events";
import { eiscpCommands } from "./eiscp-commands.js";
import { eiscpMappings } from "./eiscp-mappings.js";
import { avrStateManager } from "./avrState.js";
import { DEFAULT_QUEUE_THRESHOLD, buildEntityId } from "./configManager.js";
import { delay } from "./utils.js";
import { NETWORK_SERVICES, NO_TITLE } from "./constants.js";

export interface EiscpConfig {
  host?: string;
  port?: number;
  model?: string;
  reconnect?: boolean;
  reconnect_sleep?: number;
  verify_commands?: boolean;
  send_delay?: number;
  receive_delay?: number;
  netMenuDelay?: number;
  tuneinPresetPosition?: number;
  configuredZones?: string[]; // Zones configured for this physical AVR (e.g., ["main", "zone2"])
}

const COMMANDS = eiscpCommands.commands;
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

// Reverse mappings (zone-specific -> main) for parsing incoming commands
const ZONE2_REVERSE_MAP = Object.fromEntries(Object.entries(ZONE2_COMMAND_MAP).map(([k, v]) => [v, k]));
const ZONE3_REVERSE_MAP = Object.fromEntries(Object.entries(ZONE3_COMMAND_MAP).map(([k, v]) => [v, k]));
const ZONE4_REVERSE_MAP = Object.fromEntries(Object.entries(ZONE4_COMMAND_MAP).map(([k, v]) => [v, k]));

interface Metadata {
  title?: string;
  artist?: string;
  album?: string;
}

/** Result from parsing an ISCP command */
interface CommandResult {
  command: string;
  argument: string | number | string[] | Record<string, string>;
  zone: string;
}

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

/** Handler function type for special command parsing */
type CommandHandler = (value: string, command: string, result: CommandResult) => CommandResult;

export class EiscpDriver extends EventEmitter {
  public get connected(): boolean {
    return this.is_connected;
  }
  private config: EiscpConfig;
  private eiscp: net.Socket | null = null;
  private is_connected = false;
  private sendQueue: Promise<void> = Promise.resolve();
  private receiveQueue: Promise<void> = Promise.resolve();
  private currentMetadata: Metadata = {};

  /** Map of special command handlers for complex parsing logic */
  private readonly commandHandlers: Record<string, CommandHandler> = {
    NTM: (value, _cmd, result) => this.handleNTM(value, result),
    IFA: (value, _cmd, result) => this.handleIFA(value, result),
    IFV: (value, _cmd, result) => this.handleIFV(value, result),
    NAT: (value, cmd, result) => this.handleMetadata(value, cmd, result),
    NTI: (value, cmd, result) => this.handleMetadata(value, cmd, result),
    NAL: (value, cmd, result) => this.handleMetadata(value, cmd, result),
    DSN: (value, _cmd, result) => this.handleDSN(value, result),
    NST: (value, _cmd, result) => this.handleNST(value, result),
    FLD: (value, _cmd, result) => this.handleFLD(value, result),
    NLT: (value, _cmd, result) => this.handleNLT(value, result),
    NLS: (value, _cmd, result) => this.handleNLS(value, result),
    NLA: (value, _cmd, result) => this.handleNLA(value, result)
  };

  constructor(config?: EiscpConfig) {
    super();
    this.config = {
      host: config?.host,
      port: config?.port ?? 60128,
      model: config?.model,
      reconnect: config?.reconnect ?? false,
      reconnect_sleep: config?.reconnect_sleep ?? 5,
      verify_commands: config?.verify_commands ?? false,
      send_delay: config?.send_delay ?? DEFAULT_QUEUE_THRESHOLD,
      receive_delay: config?.receive_delay ?? DEFAULT_QUEUE_THRESHOLD,
      netMenuDelay: config?.netMenuDelay ?? 2500,
      tuneinPresetPosition: config?.tuneinPresetPosition ?? 1,
      configuredZones: config?.configuredZones
    };
    this.setupErrorHandler();
  }

  private setupErrorHandler() {
    if (this.listenerCount("error") === 0) {
      this.on("error", (err: Error) => {
        log.error("%s eiscp error (unhandled):", integrationName, err);
      });
    }
  }

  private timeToSeconds(timeStr: string): number {
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

  /** Parse comma-separated AV info string into trimmed parts array */
  private parseAvInfoParts(value: string): string[] {
    return (value?.toString() ?? "").split(",").map((p) => p.trim());
  }

  /** Get part at index, with optional space removal for source names */
  private getAvPart(parts: string[], index: number, removeSpaces = false): string {
    const val = parts[index] || "";
    return removeSpaces ? val.replace(/\s+/g, "") : val;
  }

  /** Join non-empty values with separator (default: " | ") */
  private joinFiltered(values: string[], separator = " | "): string {
    return values.filter(Boolean).join(separator);
  }

  /** Build display value, returning "---" if resolution is unknown */
  private buildDisplayValue(resolution: string, ...parts: string[]): string {
    return resolution.toLowerCase() === "unknown" ? "---" : this.joinFiltered(parts);
  }

  /** Translate main zone command prefix to zone-specific prefix */
  private getZonePrefix(prefix: string, zone: string): string {
    if (zone === "zone2") {
      return ZONE2_COMMAND_MAP[prefix] || prefix;
    } else if (zone === "zone3") {
      return ZONE3_COMMAND_MAP[prefix] || prefix;
    } else if (zone === "zone4") {
      return ZONE4_COMMAND_MAP[prefix] || prefix;
    }
    return prefix;
  }

  // ==================== Command Handlers ====================

  private handleNTM(value: string, result: CommandResult): CommandResult {
    let [position, duration] = value.toString().split("/");
    position = this.timeToSeconds(position).toString();
    duration = this.timeToSeconds(duration).toString();
    result.command = "NTM";
    result.argument = position + "/" + duration;
    return result;
  }

  private handleIFA(value: string, result: CommandResult): CommandResult {
    const parts = this.parseAvInfoParts(value);

    const inputSource = this.getAvPart(parts, 0, true);
    const inputFormat = this.getAvPart(parts, 1);
    const inputRate = this.getAvPart(parts, 2);
    const inputChannels = this.getAvPart(parts, 3);
    const outputFormat = this.getAvPart(parts, 4);
    const outputChannels = this.getAvPart(parts, 5);

    const inputRateChannels = inputFormat === "" ? inputSource : this.joinFiltered([inputRate, inputChannels], " ");
    const audioInputValue = this.joinFiltered([inputFormat, inputRateChannels]);
    const audioOutputValue = this.joinFiltered([outputFormat, outputChannels]);

    result.command = "IFA";
    result.argument = {
      inputSource,
      inputFormat,
      inputRate,
      inputChannels,
      outputFormat,
      outputChannels,
      audioInputValue,
      audioOutputValue
    };
    return result;
  }

  private handleIFV(value: string, result: CommandResult): CommandResult {
    // IFV format: inputSource,inputRes,inputColor,inputBit,outDisplay,outRes,outColor,outBit,?,videoFormat
    // Index:      0          ,1       ,2         ,3       ,4         ,5     ,6       ,7      ,8,9
    const parts = this.parseAvInfoParts(value);

    const inputSource = this.getAvPart(parts, 0, true);
    const inputResolution = this.getAvPart(parts, 1);
    const inputColorSpace = this.getAvPart(parts, 2);
    const inputBitDepth = this.getAvPart(parts, 3);
    const videoFormat = parts.length > 9 ? parts[9] : "";
    const outputDisplay = this.getAvPart(parts, 4);
    const outputResolution = this.getAvPart(parts, 5);
    const outputColorSpace = this.getAvPart(parts, 6);
    const outputBitDepth = this.getAvPart(parts, 7);

    const inputColorBit = this.joinFiltered([inputColorSpace, inputBitDepth], " ");
    const videoInputValue = this.buildDisplayValue(inputResolution, inputResolution, inputColorBit, videoFormat);
    const outputColorBit = this.joinFiltered([outputColorSpace, outputBitDepth], " ");
    const videoOutputValue = this.buildDisplayValue(outputResolution, outputResolution, outputColorBit, videoFormat);

    result.command = "IFV";
    result.argument = {
      inputSource,
      inputResolution,
      inputColorSpace,
      inputBitDepth,
      videoFormat,
      outputDisplay,
      outputResolution,
      outputColorSpace,
      outputBitDepth,
      videoInputValue,
      videoOutputValue
    };
    return result;
  }

  private handleMetadata(value: string, command: string, result: CommandResult): CommandResult {
    const originalValue = value;
    const combined = command + value;
    const parts = combined.split(/ISCP(?:[$.!]1|\$!1)/);
    let foundMatch = false;

    // Get current subsource to override artist for certain streaming services
    const entityId = buildEntityId(this.config.model!, this.config.host!, result.zone);
    const currentSubSource = avrStateManager.getSubSource(entityId);

    for (const part of parts) {
      if (!part.trim()) continue;
      const match = part.trim().match(/^([A-Z]{3})\s*(.*)$/s);
      if (match) {
        foundMatch = true;
        const type = match[1];
        let val = match[2].trim();
        if (type === "NAT") {
          // Override artist with service name for configured streaming services
          if (NO_TITLE.map((s) => s.toLowerCase()).includes(currentSubSource)) {
            // Find matching service name from NETWORK_SERVICES (case-insensitive)
            const serviceName = NETWORK_SERVICES.find((s) => s.toLowerCase() === currentSubSource);
            this.currentMetadata.title = serviceName || val;
          } else {
            this.currentMetadata.title = val;
          }
        }
        if (type === "NTI") this.currentMetadata.artist = val;
        if (type === "NAL") this.currentMetadata.album = val;
      }
    }

    if (!foundMatch) {
      if (command === "NAT") {
        // Override artist with service name for configured streaming services
        if (NO_TITLE.map((s) => s.toLowerCase()).includes(currentSubSource)) {
          // Find matching service name from NETWORK_SERVICES (case-insensitive)
          const serviceName = NETWORK_SERVICES.find((s) => s.toLowerCase() === currentSubSource);
          this.currentMetadata.title = serviceName || originalValue;
        } else {
          this.currentMetadata.title = originalValue;
        }
      }
      if (command === "NTI") this.currentMetadata.artist = originalValue;
      if (command === "NAL") this.currentMetadata.album = originalValue;
    }

    result.command = "metadata";
    result.argument = { ...this.currentMetadata };
    return result;
  }

  private handleDSN(value: string, result: CommandResult): CommandResult {
    result.command = "DSN";
    result.argument = value;
    return result;
  }

  private handleNST(value: string, result: CommandResult): CommandResult {
    const status = value.trim().charAt(0);
    let playback = "unknown";

    switch (status) {
      case "P":
        playback = "playing";
        break;
      case "p":
        playback = "paused";
        break;
      case "S":
        playback = "stopped";
        break;
      case "F":
        playback = "ff";
        break;
      case "R":
        playback = "fr";
        break;
      default:
        return result;
    }

    result.command = "NST";
    result.argument = playback;
    return result;
  }

  private handleNLT(value: string, result: CommandResult): CommandResult {
    // NLT format: hex data followed by ASCII text (e.g., "0E01000000090100FF0E00TuneIn Radio")
    // Extract ASCII text portion after hex prefix
    const textMatch = value.match(/[A-Z][a-z]/); // Find where actual text starts
    if (!textMatch || textMatch.index === undefined) {
      return result; // No text found, skip
    }

    const text = value.substring(textMatch.index).trim();
    const entityId = buildEntityId(this.config.model!, this.config.host!, result.zone);
    const currentSource = avrStateManager.getSource(entityId);

    // Only process if source is NET
    if (currentSource !== "net") {
      return result;
    }

    // Check if the title contains a known network service name
    const detectedService = NETWORK_SERVICES.find((service) => text.includes(service));
    if (detectedService) {
      const currentSubSource = avrStateManager.getSubSource(entityId);
      if (currentSubSource !== detectedService.toLowerCase()) {
        result.command = "NLT";
        result.argument = detectedService;
        return result;
      }
    }

    if (text.trim().toLowerCase() === "my presets") {
      result.command = "NLT_CONTEXT";
      result.argument = "My Presets";
      return result;
    }

    return result;
  }

  private handleNLS(value: string, result: CommandResult): CommandResult {
    const entry = value.trim();
    if (!/^U\d+-/.test(entry)) {
      return result;
    }

    result.command = "NLS";
    result.argument = entry;
    return result;
  }

  private handleNLA(value: string, result: CommandResult): CommandResult {
    const xmlStart = value.indexOf("<");
    if (xmlStart === -1 || value.charAt(0) !== "X" || value.charAt(5).toUpperCase() !== "S") {
      return result;
    }

    result.command = "NLA";
    result.argument = value.substring(xmlStart).trim();
    return result;
  }

  private handleFLD(value: string, result: CommandResult): CommandResult {
    let ascii = Buffer.from(value, "hex").toString("ascii");
    ascii = ascii.replace(/[^a-zA-Z0-9 .\-:/]/g, "").trim();

    // Construct entityId from config and zone
    const entityId = buildEntityId(this.config.model!, this.config.host!, result.zone);
    const currentSource = avrStateManager.getSource(entityId);

    // Check if FLD content matches a network service (regardless of current source)
    const detectedService = NETWORK_SERVICES.find((service) => ascii.startsWith(service));

    switch (currentSource) {
      case "net": {
        if (detectedService) {
          // Known service detected - only emit if different from current subSource
          const currentSubSource = avrStateManager.getSubSource(entityId);
          if (currentSubSource !== detectedService.toLowerCase()) {
            result.command = "FLD";
            result.argument = detectedService;
            return result;
          }
          // Same service, skip to prevent scroll updates
          return result;
        }
        // No known service - skip scrolling text from network sources
        return result;
      }

      case "fm": {
        // If we detect a network service but source is FM, skip (source changing)
        if (detectedService) {
          return result;
        }
        result.command = "FLD";
        result.argument = ascii.slice(0, -2);
        return result;
      }

      default: {
        // If we detect a network service but source isn't NET, skip (source changing)
        if (detectedService) {
          return result;
        }
        result.command = "FLD";
        result.argument = ascii.slice(0, -4);
        return result;
      }
    }
  }

  // ==================== Packet Handling ====================

  // Create a proper eISCP packet for UDP broadcast (discovery)
  private eiscp_packet(data: string): Buffer {
    if (data.charAt(0) !== "!") {
      data = "!1" + data;
    }
    const iscp_msg = Buffer.from(data + "\x0D\x0a");
    const header = Buffer.from([73, 83, 67, 80, 0, 0, 0, 16, 0, 0, 0, 0, 1, 0, 0, 0]);
    header.writeUInt32BE(iscp_msg.length, 8);
    return Buffer.concat([header, iscp_msg]);
  }

  private eiscp_packet_extract(packet: Buffer): string {
    return packet.toString("ascii", 18, packet.length - 2);
  }

  private eiscp_packet_extract_all(packet: Buffer): string[] {
    const messages: string[] = [];
    let offset = 0;

    while (offset + 16 <= packet.length && packet.toString("ascii", offset, offset + 4) === "ISCP") {
      const headerSize = packet.readUInt32BE(offset + 4);
      const dataSize = packet.readUInt32BE(offset + 8);
      const frameEnd = offset + headerSize + dataSize;

      if (headerSize < 16 || dataSize < 4 || frameEnd > packet.length) {
        break;
      }

      messages.push(packet.toString("ascii", offset + headerSize + 2, frameEnd - 2));
      offset = frameEnd;
    }

    if (messages.length === 0) {
      return [this.eiscp_packet_extract(packet)];
    }

    return messages;
  }

  private iscp_to_command(command: string, value: string): CommandResult {
    const result: CommandResult = {
      command: "undefined",
      argument: "undefined",
      zone: "main"
    };

    // Detect zone from command prefix
    // Zone 2: starts with Z (ZPW, ZVL, ZMT, SLZ) or ends with Z (TUZ)
    // Zone 3: ends with 3 (PW3, VL3, MT3, SL3, TU3)
    // Zone 4: ends with 4 (PW4, VL4, MT4, SL4, TU4)
    if (command.charAt(0) === "Z" && command.length === 3) {
      result.zone = "zone2";
    } else if (command.charAt(2) === "Z" && command.length === 3) {
      result.zone = "zone2";
    } else if (command.charAt(2) === "3" && command.length === 3) {
      result.zone = "zone3";
    } else if (command.charAt(2) === "4" && command.length === 3) {
      result.zone = "zone4";
    }

    // Check for special command handler
    const upperCommand = command.toUpperCase();
    const handler = this.commandHandlers[upperCommand];
    if (handler) {
      return handler(value, command, result);
    }

    // Map zone-specific command codes back to main zone for lookup
    let lookupCommand = command;
    if (result.zone === "zone2") {
      lookupCommand = ZONE2_REVERSE_MAP[command] || command;
    } else if (result.zone === "zone3") {
      lookupCommand = ZONE3_REVERSE_MAP[command] || command;
    } else if (result.zone === "zone4") {
      lookupCommand = ZONE4_REVERSE_MAP[command] || command;
    }

    // Direct lookup instead of iterating all commands
    type CommandType = {
      name: string;
      values: { [key: string]: { name: string | string[] } };
    };
    const cmdObj = (COMMANDS as unknown as Record<string, CommandType>)[lookupCommand];
    if (!cmdObj) {
      return result;
    }

    result.command = cmdObj.name;
    const valuesObj = cmdObj.values;

    if (valuesObj[value]?.name !== undefined) {
      result.argument = valuesObj[value].name;
    } else if (value === "N/A") {
      // Skip N/A values (zone is off or unavailable)
      // result.argument remains "undefined"
    } else if (
      VALUE_MAPPINGS.hasOwnProperty(lookupCommand as keyof typeof VALUE_MAPPINGS) &&
      Object.prototype.hasOwnProperty.call(VALUE_MAPPINGS[lookupCommand as keyof typeof VALUE_MAPPINGS], "intgrRange")
    ) {
      result.argument = parseInt(value, 16);
    } else if (typeof value === "string" && value.match(/^([0-9A-F]{2})+(,([0-9A-F]{2})+)*$/i)) {
      // Handle hex-encoded string(s), possibly comma-separated
      result.argument = value.split(",").map((hexStr) => {
        hexStr = hexStr.trim();
        let str = "";
        for (let i = 0; i < hexStr.length; i += 2) {
          str += String.fromCharCode(parseInt(hexStr.substring(i, i + 2), 16));
        }
        return str;
      });
      if (result.argument.length === 1) {
        result.argument = result.argument[0];
      }
    }

    return result;
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
      let timeout_timer: NodeJS.Timeout;
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
          if (!timeout_timer) {
            reject(err);
          }
        })
        .on("message", (packet: Buffer, rinfo: dgram.RemoteInfo) => {
          const message = this.eiscp_packet_extract_all(packet)[0] ?? this.eiscp_packet_extract(packet);
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
              clearTimeout(timeout_timer);
              close();
            }
          }
        })
        .on("listening", () => {
          client.setBroadcast(true);
          const buffer = this.eiscp_packet("!xECNQSTN");
          client.send(buffer, 0, buffer.length, opts.port, opts.address, (err) => {
            if (err) {
              // Log but don't fail - network might not be ready yet (ENETUNREACH)
              log.error("%s UDP send error (network may not be ready):", integrationName, err);
              // Close client and resolve with empty result - configured AVRs will still be tried
              clearTimeout(timeout_timer);
              close();
            }
          });
          timeout_timer = setTimeout(close, opts.timeout * 1000);
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
    if (this.is_connected && this.eiscp) {
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
        this.is_connected = true;
        this.emit("connect"); // Emit connect event for waitForConnect()
      })
      .on("close", () => {
        const wasConnected = this.is_connected;
        this.is_connected = false;
        if (wasConnected) {
          log.warn("%s Connection closed for %s at %s:%d", integrationName, this.config.model, this.config.host, this.config.port || 60128);
        }
        if (this.config.reconnect) {
          log.info("%s Scheduling reconnection in %ds", integrationName, this.config.reconnect_sleep);
          setTimeout(() => this.connect(), this.config.reconnect_sleep! * 1000);
        }
      })
      .on("error", (err) => {
        log.error("%s Socket error for %s at %s:%d - %s", integrationName, this.config.model, this.config.host, this.config.port || 60128, err.message);
        this.is_connected = false;
        this.eiscp?.destroy();
      })
      .on("data", (data: Buffer) => {
        for (const iscp_message of this.eiscp_packet_extract_all(data)) {
          let command = iscp_message.slice(0, 3);
          let value = iscp_message.slice(3);

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

          const rawResult = this.iscp_to_command(command, value);
          if (!rawResult || rawResult.command === "undefined") {
            continue;
          }

          const dataPayload: DataPayload = {
            command: rawResult.command ?? undefined,
            argument: rawResult.argument ?? undefined,
            zone: rawResult.zone ?? undefined,
            iscpCommand: iscp_message,
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
      });
    return { model: this.config.model!, host: this.config.host!, port: this.config.port! };
  }

  disconnect() {
    if (this.is_connected && this.eiscp) {
      this.eiscp.destroy();
    }
  }

  /** Enqueue a command to be sent with proper delay between commands */
  private enqueueSend(data: string | string[]): Promise<void> {
    const task = this.sendQueue.then(async () => {
      if (this.is_connected && this.eiscp) {
        // Handle single command (most common case)
        if (typeof data === "string") {
          this.eiscp.write(this.eiscp_packet(data));
        } else {
          // const shortDelay = Math.round((this.config.send_delay! ?? DEFAULT_QUEUE_THRESHOLD) / data.length / 20) * 10;
          // console.log("%s ***************", integrationName, data.length, shortDelay);
          for (const cmd of data) {
            this.eiscp.write(this.eiscp_packet(cmd));
            // await delay(shortDelay);
          }
        }
        await delay(this.config.send_delay! ?? DEFAULT_QUEUE_THRESHOLD);
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
        await delay(this.config.receive_delay! ?? DEFAULT_QUEUE_THRESHOLD);
        this.emit("data", data);
      })
      .catch((err) => {
        log.error("%s Error processing queued incoming message:", integrationName, err);
      });
  }

  /** Send a raw ISCP command */
  async raw(data: string): Promise<void> {
    if (!data || data === "") {
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

    this.currentMetadata.artist = "Selecting preset " + preset + "...";
    this.currentMetadata.album = "please wait";
    this.emit("data", {
      command: "metadata",
      argument: { ...this.currentMetadata },
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
    //, iscpCommand: string
    const sliPrefix = this.getZonePrefix("SLI", zone);
    const netCommand = `${sliPrefix}2B`; // 2B = NET input
    const queryCommand = `${sliPrefix}QSTN`;
    const newSubsource = String(nssCode.slice(-2)).padStart(5, "0");

    log.debug("%s Sending %s (NET input for zone %s) before %s", integrationName, netCommand, zone, nssCode);
    await this.raw(netCommand); // Select NET input first
    await delay(this.config.netMenuDelay ?? 2500); // Wait for AVR to fully load NET menu

    log.debug("%s Sending network service command: %s", integrationName, nssCode);
    await this.raw(`NLSI${newSubsource}`);
    await delay(this.config.netMenuDelay ?? 2500);
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
      return this.handleNSSsend(nssCode, zone); //, iscpCommand
    }
    // await this.raw(iscpCommand);
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
        await this.sendIscp(this.command_to_iscp(data, undefined, "main"), "main");
        return;
      }
    } else if (typeof data === "object" && data !== null) {
      zone = data.zone ?? "main";
      command = data.command;
      args = data.args;
    } else {
      await this.sendIscp(this.command_to_iscp(String(data), undefined, "main"), "main");
      return;
    }
    await this.sendIscp(this.command_to_iscp(command, args, zone), zone);
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

    const action = parts[1]; // e.g., "all-up", "main-zone2-down"

    // Determine which zones are configured for this AVR
    const configuredZones = this.config.configuredZones || ["main"]; // default to main if not specified
    const hasMain = configuredZones.includes("main");
    const hasZone2 = configuredZones.includes("zone2");
    const hasZone3 = configuredZones.includes("zone3");
    const hasZone4 = configuredZones.includes("zone4");

    // Map action to zone-specific volume commands (conditionally based on configured zones)
    const volumeCommands: string[] = [];

    switch (action) {
      case "all-up":
        if (hasMain) volumeCommands.push("MVLUP1"); // Main zone volume up
        if (hasZone2) volumeCommands.push("ZVLUP1"); // Zone 2 volume up
        if (hasZone3) volumeCommands.push("VL3UP1"); // Zone 3 volume up
        if (hasZone4) volumeCommands.push("VL4UP1"); // Zone 4 volume up
        break;
      case "all-down":
        if (hasMain) volumeCommands.push("MVLDOWN1"); // Main zone volume down
        if (hasZone2) volumeCommands.push("ZVLDOWN1"); // Zone 2 volume down
        if (hasZone3) volumeCommands.push("VL3DOWN1"); // Zone 3 volume down
        if (hasZone4) volumeCommands.push("VL4DOWN1"); // Zone 4 volume down
        break;
      case "main-zone2-up":
        if (hasMain) volumeCommands.push("MVLUP1"); // Main zone volume up
        if (hasZone2) volumeCommands.push("ZVLUP1"); // Zone 2 volume up
        break;
      case "main-zone2-down":
        if (hasMain) volumeCommands.push("MVLDOWN1"); // Main zone volume down
        if (hasZone2) volumeCommands.push("ZVLDOWN1"); // Zone 2 volume down
        break;
      case "main-zone3-up":
        if (hasMain) volumeCommands.push("MVLUP1"); // Main zone volume up
        if (hasZone3) volumeCommands.push("VL3UP1"); // Zone 3 volume up
        break;
      case "main-zone3-down":
        if (hasMain) volumeCommands.push("MVLDOWN1"); // Main zone volume down
        if (hasZone3) volumeCommands.push("VL3DOWN1"); // Zone 3 volume down
        break;
      case "zone2-zone3-up":
        if (hasZone2) volumeCommands.push("ZVLUP1"); // Zone 2 volume up
        if (hasZone3) volumeCommands.push("VL3UP1"); // Zone 3 volume up
        break;
      case "zone2-zone3-down":
        if (hasZone2) volumeCommands.push("ZVLDOWN1"); // Zone 2 volume down
        if (hasZone3) volumeCommands.push("VL3DOWN1"); // Zone 3 volume down
        break;
      default:
        log.warn("%s Unknown multi-zone-volume action: %s", integrationName, action);
        return;
    }

    if (volumeCommands.length === 0) {
      log.warn("%s No zones configured for multi-zone-volume action: %s (configured zones: %s)", integrationName, action, configuredZones.join(", "));
      return;
    }

    log.info("%s Multi-zone volume command: %s -> sending %d zone commands (configured zones: %s)", integrationName, data, volumeCommands.length, configuredZones.join(", "));

    // Send all zone commands at once with a single 100ms delay at the end
    this.enqueueSend(volumeCommands);
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

    const action = parts[1]; // e.g., "all-on", "all-off", "all-toggle", "main-zone2-on"

    // Determine which zones are configured for this AVR
    const configuredZones = this.config.configuredZones || ["main"]; // default to main if not specified
    const hasMain = configuredZones.includes("main");
    const hasZone2 = configuredZones.includes("zone2");
    const hasZone3 = configuredZones.includes("zone3");
    const hasZone4 = configuredZones.includes("zone4");

    // Map action to zone-specific mute commands (conditionally based on configured zones)
    const muteCommands: string[] = [];

    switch (action) {
      case "all-on":
        if (hasMain) muteCommands.push("AMT01"); // Main zone mute on
        if (hasZone2) muteCommands.push("ZMT01"); // Zone 2 mute on
        if (hasZone3) muteCommands.push("MT301"); // Zone 3 mute on
        if (hasZone4) muteCommands.push("MT401"); // Zone 4 mute on
        break;
      case "all-off":
        if (hasMain) muteCommands.push("AMT00"); // Main zone mute off
        if (hasZone2) muteCommands.push("ZMT00"); // Zone 2 mute off
        if (hasZone3) muteCommands.push("MT300"); // Zone 3 mute off
        if (hasZone4) muteCommands.push("MT400"); // Zone 4 mute off
        break;
      case "all-toggle":
        if (hasMain) muteCommands.push("AMTTG"); // Main zone mute toggle
        if (hasZone2) muteCommands.push("ZMTTG"); // Zone 2 mute toggle
        if (hasZone3) muteCommands.push("MT3TG"); // Zone 3 mute toggle
        if (hasZone4) muteCommands.push("MT4TG"); // Zone 4 mute toggle
        break;
      case "main-zone2-on":
        if (hasMain) muteCommands.push("AMT01"); // Main zone mute on
        if (hasZone2) muteCommands.push("ZMT01"); // Zone 2 mute on
        break;
      case "main-zone2-off":
        if (hasMain) muteCommands.push("AMT00"); // Main zone mute off
        if (hasZone2) muteCommands.push("ZMT00"); // Zone 2 mute off
        break;
      case "main-zone2-toggle":
        if (hasMain) muteCommands.push("AMTTG"); // Main zone mute toggle
        if (hasZone2) muteCommands.push("ZMTTG"); // Zone 2 mute toggle
        break;
      case "main-zone3-on":
        if (hasMain) muteCommands.push("AMT01"); // Main zone mute on
        if (hasZone3) muteCommands.push("MT301"); // Zone 3 mute on
        break;
      case "main-zone3-off":
        if (hasMain) muteCommands.push("AMT00"); // Main zone mute off
        if (hasZone3) muteCommands.push("MT300"); // Zone 3 mute off
        break;
      case "main-zone3-toggle":
        if (hasMain) muteCommands.push("AMTTG"); // Main zone mute toggle
        if (hasZone3) muteCommands.push("MT3TG"); // Zone 3 mute toggle
        break;
      case "zone2-zone3-on":
        if (hasZone2) muteCommands.push("ZMT01"); // Zone 2 mute on
        if (hasZone3) muteCommands.push("MT301"); // Zone 3 mute on
        break;
      case "zone2-zone3-off":
        if (hasZone2) muteCommands.push("ZMT00"); // Zone 2 mute off
        if (hasZone3) muteCommands.push("MT300"); // Zone 3 mute off
        break;
      case "zone2-zone3-toggle":
        if (hasZone2) muteCommands.push("ZMTTG"); // Zone 2 mute toggle
        if (hasZone3) muteCommands.push("MT3TG"); // Zone 3 mute toggle
        break;
      default:
        log.warn("%s Unknown multi-zone-muting action: %s", integrationName, action);
        return;
    }

    if (muteCommands.length === 0) {
      log.warn("%s No zones configured for multi-zone-muting action: %s (configured zones: %s)", integrationName, action, configuredZones.join(", "));
      return;
    }

    log.info("%s Multi-zone muting command: %s -> sending %d zone commands (configured zones: %s)", integrationName, data, muteCommands.length, configuredZones.join(", "));

    // Send all zone commands at once with a single 100ms delay at the end
    this.enqueueSend(muteCommands);
  }

  private command_to_iscp(command: string, args: string | number | undefined, zone: string): string {
    const prefix = (COMMAND_MAPPINGS as Record<string, string>)[command];
    let value: string;
    const valueMap = (VALUE_MAPPINGS as unknown as Record<string, Record<string, { value: string }>>)[prefix];
    if (args !== undefined && valueMap && Object.prototype.hasOwnProperty.call(valueMap, args)) {
      value = valueMap[String(args)].value;
    } else if (valueMap && Object.prototype.hasOwnProperty.call(valueMap, "intgrRange")) {
      value = (+args!).toString(16).toUpperCase();
      value = value.length < 2 ? "0" + value : value;
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
      if (this.is_connected) {
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
