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
}
import net from "net";
import dgram from "dgram";
import async from "async";

import EventEmitter from "events";
import { eiscpCommands } from "./eiscp-commands.js";
import { avrCurrentSource } from "./state.js";
import { DEFAULT_QUEUE_THRESHOLD } from "./configManager.js";
const COMMANDS = eiscpCommands.commands;
const COMMAND_MAPPINGS = eiscpCommands.command_mappings;
const VALUE_MAPPINGS = eiscpCommands.value_mappings;
const integrationName = "Onkyo-Integration eISCP:";
const IGNORED_COMMANDS = new Set(["NMS", "NPB"]); // Commands to ignore from AVR
const THROTTLED_COMMANDS = new Set(["IFA", "IFV", "FLD"]); // Commands to send to incoming queue for throttling
const FLD_VOLUME_HEX_PREFIX = "566F6C756D65"; // "Volume" in hex - skip these FLD messages

// Known network streaming services - when FLD starts with one of these, emit once and suppress scroll updates
const NETWORK_SERVICES = ["TuneIn", "Spotify", "Deezer", "Tidal", "AmazonMusic", "Chromecast built-in", "DTS Play-Fi", "AirPlay", "Alexa", "Music Server", "USB", "Play Queue"];

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

/** Handler function type for special command parsing */
type CommandHandler = (value: string, command: string, result: CommandResult) => CommandResult;

export class EiscpDriver extends EventEmitter {
  public get connected(): boolean {
    return this.is_connected;
  }
  private config: EiscpConfig;
  private eiscp: net.Socket | null = null;
  private is_connected = false;
  private send_queue: async.QueueObject<any>;
  private receive_queue: async.QueueObject<any>;
  private currentMetadata: Metadata = {};
  private lastFldService: string | null = null; // Track last detected network service from FLD

  /** Map of special command handlers for complex parsing logic */
  private readonly commandHandlers: Record<string, CommandHandler> = {
    NTM: (value, _cmd, result) => this.handleNTM(value, result),
    IFA: (value, _cmd, result) => this.handleIFA(value, result),
    IFV: (value, _cmd, result) => this.handleIFV(value, result),
    NAT: (value, cmd, result) => this.handleMetadata(value, cmd, result),
    NTI: (value, cmd, result) => this.handleMetadata(value, cmd, result),
    NAL: (value, cmd, result) => this.handleMetadata(value, cmd, result),
    DSN: (value, _cmd, result) => this.handleDSN(value, result),
    FLD: (value, _cmd, result) => this.handleFLD(value, result),
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
      netMenuDelay: config?.netMenuDelay ?? 2500
    };
    this.send_queue = async.queue(this.sendCommand.bind(this), 1);
    this.receive_queue = async.queue(this.processIncomingMessage.bind(this), 1);
    this.setupErrorHandler();
  }

  private setupErrorHandler() {
    if (this.listenerCount("error") === 0) {
      this.on("error", (err: any) => {
        console.error("eiscp error (unhandled):", err);
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

    for (const part of parts) {
      if (!part.trim()) continue;
      const match = part.trim().match(/^([A-Z]{3})\s*(.*)$/s);
      if (match) {
        foundMatch = true;
        const type = match[1];
        const val = match[2].trim();
        if (type === "NAT") this.currentMetadata.title = val;
        if (type === "NTI") this.currentMetadata.artist = val;
        if (type === "NAL") this.currentMetadata.album = val;
      }
    }

    if (!foundMatch) {
      if (command === "NAT") this.currentMetadata.title = originalValue;
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

  private handleFLD(value: string, result: CommandResult): CommandResult {
    let ascii = Buffer.from(value, "hex").toString("ascii");
    ascii = ascii.replace(/[^a-zA-Z0-9 .\-:/]/g, "").trim();

    switch (avrCurrentSource.toUpperCase()) {
      case "NET": {
        const detectedService = NETWORK_SERVICES.find((service) => ascii.startsWith(service));
        if (detectedService) {
          if (this.lastFldService !== detectedService) {
            this.lastFldService = detectedService;
            result.command = "FLD";
            result.argument = detectedService;
            return result;
          }
        }
        return result;
      }

      case "FM": {
        this.lastFldService = null;
        ascii = ascii.slice(0, -2);
        result.command = "FLD";
        result.argument = ascii;
        return result;
      }

      default: {
        this.lastFldService = null;
        ascii = ascii.slice(0, -4);
        result.command = "FLD";
        result.argument = ascii;
        return result;
      }
    }
  }

  // ==================== Packet Handling ====================

  // Create a proper eISCP packet for UDP broadcast (discovery)
  private eiscp_packet(data: any): Buffer {
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

  private iscp_to_command(command: string, value: string): CommandResult {
    const result: CommandResult = {
      command: "undefined",
      argument: "undefined",
      zone: "main"
    };

    // Detect zone from command prefix
    // Zone 2: starts with Z (ZPW, ZVL, ZMT, SLZ) or ends with Z (TUZ)
    // Zone 3: ends with 3 (PW3, VL3, MT3, SL3, TU3)
    if (command.charAt(0) === "Z" && command.length === 3) {
      result.zone = "zone2";
    } else if (command.charAt(2) === "Z" && command.length === 3) {
      result.zone = "zone2";
    } else if (command.charAt(2) === "3" && command.length === 3) {
      result.zone = "zone3";
    }

    // Check for special command handler
    const upperCommand = command.toUpperCase();
    const handler = this.commandHandlers[upperCommand];
    if (handler) {
      return handler(value, command, result);
    }

    // Fall through to generic command lookup
    type CommandType = {
      name: string;
      values: { [key: string]: { name: string } };
    };

    // Map zone-specific command codes back to main zone for lookup
    let lookupCommand = command;
    if (result.zone === "zone2") {
      const zone2ReverseMap: Record<string, string> = {
        ZVL: "MVL",
        ZPW: "PWR",
        ZMT: "AMT",
        SLZ: "SLI",
        TUZ: "TUN"
      };
      lookupCommand = zone2ReverseMap[command] || command;
    } else if (result.zone === "zone3") {
      const zone3ReverseMap: Record<string, string> = {
        VL3: "MVL",
        PW3: "PWR",
        MT3: "AMT",
        SL3: "SLI",
        TU3: "TUN"
      };
      lookupCommand = zone3ReverseMap[command] || command;
    }

    (Object.keys(COMMANDS) as Array<keyof typeof COMMANDS>).forEach(function () {
      const commansList = COMMANDS as unknown as { [key: string]: CommandType };

      if (typeof commansList[lookupCommand] !== "undefined") {
        result.command = commansList[lookupCommand].name;

        // console.log("******* %s", command);

        const cmdObj = COMMANDS[lookupCommand as keyof typeof COMMANDS];
        const valuesObj = cmdObj.values as { [key: string]: { name: string } };
        if (valuesObj[value]?.name !== undefined) {
          result.argument = valuesObj[value]?.name;

          // return result;
        } else if (value === "N/A") {
          // Skip N/A values (zone is off or unavailable)
          return result;
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
      }
    });
    // console.log("******3* %s", result.argument);
    return result;
  }

  async discover(options?: { devices?: number; timeout?: number; address?: string; port?: number; subnetBroadcast?: string }): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const result: any[] = [];
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
        .on("error", (err: any) => {
          console.error("[EiscpDriver] UDP error:", err);
          try {
            client.close();
          } catch {}
          // Don't reject immediately - allow timeout to complete for graceful handling, Only reject if timeout hasn't been set yet (meaning bind failed)
          if (!timeout_timer) {
            reject(err);
          }
        })
        .on("message", (packet: any, rinfo: any) => {
          const message = this.eiscp_packet_extract(packet);
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
              console.error(`[EiscpDriver] UDP send error (network may not be ready):`, err);
              // Close client and resolve with empty result - configured AVRs will still be tried
              clearTimeout(timeout_timer);
              close();
            }
          });
          timeout_timer = setTimeout(close, opts.timeout * 1000);
        })
        .on("close", () => {
          console.log("[EiscpDriver] UDP socket closed");
        })
        .bind(0, undefined, (err?: Error) => {
          if (err) console.error("[EiscpDriver] UDP bind error:", err);
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
        console.error("[EiscpDriver] No AVR found during discovery.");
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
        this.is_connected = false;
        if (this.config.reconnect) {
          setTimeout(() => this.connect(), this.config.reconnect_sleep! * 1000);
        }
      })
      .on("error", () => {
        this.is_connected = false;
        this.eiscp?.destroy();
      })
      .on("data", (data: any) => {
        var iscp_message = this.eiscp_packet_extract(data);
        let command = iscp_message.slice(0, 3);
        let value = iscp_message.slice(3);
        
        // console.log("%s RAW (0) RECEIVE: [%s] %s %s", integrationName, command, value);

        // Ignore messages we don't care about
        if (IGNORED_COMMANDS.has(command)) {
          return;
        }

        // Skip FLD volume display messages early (before full parsing)
        if (command === "FLD" && value.slice(0, 12) === FLD_VOLUME_HEX_PREFIX) {
          return;
        }

        value = String(value).replace(/[\x00-\x1F]/g, ""); // remove weird characters like \x1A

        // Strip trailing ISCP messages for certain commands, move this to ondata?
        if (["SLI", "SLZ", "SL3", "PRS", "AMT", "ZMT", "MT3", "MVL", "ZVL", "VL3"].includes(command)) {
          const idx = value.indexOf("ISCP");
          if (idx !== -1) {
            value = value.substring(0, idx);
          }
          value = value.trim();
        }

        const rawResult = this.iscp_to_command(command, value);

        // Only emit if rawResult is defined and has a meaningful command
        if (!rawResult || rawResult.command === "undefined") {
          return;
        }

        const dataPayload = {
          command: rawResult.command ?? undefined,
          argument: rawResult.argument ?? undefined,
          zone: rawResult.zone ?? undefined,
          iscpCommand: iscp_message,
          host: this.config.host,
          port: this.config.port,
          model: this.config.model
        };

        // Route less important messages through the incoming queue for throttling
        if (THROTTLED_COMMANDS.has(command)) {
          this.receive_queue.push(dataPayload, (err: any) => {
            if (err) {
              console.error("Error processing queued incoming message:", err);
            }
          });
        } else {
          // Emit other messages immediately
          this.emit("data", dataPayload);
        }
      });
    return { model: this.config.model!, host: this.config.host!, port: this.config.port! };
  }

  disconnect() {
    if (this.is_connected && this.eiscp) {
      this.eiscp.destroy();
    }
  }

  private async sendCommand(data: any, callback: any) {
    if (this.is_connected && this.eiscp) {
      this.eiscp.write(this.eiscp_packet(data));
      setTimeout(callback, this.config.send_delay, false);
      return;
    }
    callback("Send command, while not connected", null);
  }

  private async processIncomingMessage(data: any, callback: any) {
    // Emit the incoming message data after the throttle delay
    setTimeout(() => {
      this.emit("data", data);
      if (typeof callback === "function") {
        callback();
      }
    }, this.config.receive_delay);
  }

  raw(data: any, callback?: any) {
    if (typeof data !== "undefined" && data !== "") {
      this.send_queue.push(data, (err: any) => {
        if (typeof callback === "function") {
          callback(err, null);
        }
      });
    } else if (typeof callback === "function") {
      callback(true, "No data provided.");
    }
  }

  private async sendIscp(iscpCommand: string, callback?: any) {
    // Check if command contains a network service selection (NLSLx), this handles both direct NLSL commands and embedded ones like "SLINLSL1"
    const nlslMatch = iscpCommand.match(/NLSL[0-9A-Fa-f]/);
    if (nlslMatch) {
      console.debug("%s Sending SLI2B (NET input) before %s", integrationName, nlslMatch[0]);
      this.raw("SLI2B"); // Select NET input first
      await new Promise((resolve) => setTimeout(resolve, this.config.netMenuDelay ?? 2500)); // Wait for AVR to fully load NET menu (needs time when exiting a service)
      console.debug("%s Sending network service command: %s", integrationName, nlslMatch[0]);
      this.raw(nlslMatch[0], callback); // Send just the NLSL command
      return;
    }
    this.raw(iscpCommand, callback);
  }

  command(data: any, callback?: any) {
    let command: string, args: any, zone: any;

    if (typeof data === "string") {
      const parts = data
        .toLowerCase()
        .split(/[\s.=:]/)
        .filter((item: any) => item !== "");
      if (parts.length === 3) {
        zone = parts[0];
        command = parts[1];
        args = parts[2];
      } else if (parts.length === 2) {
        zone = "main";
        command = parts[0];
        args = parts[1];
      } else {
        this.sendIscp(this.command_to_iscp(data, undefined, "main"), callback);
        return;
      }
    } else if (typeof data === "object" && data !== null) {
      zone = data.zone ?? "main";
      command = data.command;
      args = data.args;
    } else {
      this.sendIscp(this.command_to_iscp(data, undefined, "main"), callback);
      return;
    }
    this.sendIscp(this.command_to_iscp(command, args, zone), callback);
  }

  private command_to_iscp(command: string, args: any, zone: string) {
    const prefix = (COMMAND_MAPPINGS as Record<string, any>)[command];
    let value: any;
    const valueMap = (VALUE_MAPPINGS as Record<string, any>)[prefix];
    if (valueMap && Object.prototype.hasOwnProperty.call(valueMap, args)) {
      value = valueMap[args].value;
    } else if (valueMap && Object.prototype.hasOwnProperty.call(valueMap, "intgrRange")) {
      value = (+args).toString(16).toUpperCase();
      value = value.length < 2 ? "0" + value : value;
    } else {
      console.log("%s not found in JSON: %s %s", integrationName, command, args);
      value = args;
    }

    // Translate main zone command prefixes to zone-specific prefixes
    let zonePrefix = prefix;
    if (zone === "zone2") {
      // Zone 2: MVL->ZVL, PWR->ZPW, AMT->ZMT, SLI->SLZ, TUN->TUZ
      const zone2Map: Record<string, string> = {
        MVL: "ZVL",
        PWR: "ZPW",
        AMT: "ZMT",
        SLI: "SLZ",
        TUN: "TUZ"
      };
      zonePrefix = zone2Map[prefix] || prefix;
    } else if (zone === "zone3") {
      // Zone 3: MVL->VL3, PWR->PW3, AMT->MT3, SLI->SL3, TUN->TU3
      const zone3Map: Record<string, string> = {
        MVL: "VL3",
        PWR: "PW3",
        AMT: "MT3",
        SLI: "SL3",
        TUN: "TU3"
      };
      zonePrefix = zone3Map[prefix] || prefix;
    }

    return zonePrefix + value;
  }

  get_commands(zone: string, callback: any) {
    const result: any[] = [];
    async.each(
      Object.keys((COMMAND_MAPPINGS as any)[zone]),
      (cmd: string, cb: any) => {
        result.push(cmd);
        cb();
      },
      (err: any) => {
        callback(err, result);
      }
    );
  }

  get_command(command: string, callback: any) {
    const result: any[] = [];
    const parts = command.split(".");
    if (parts.length !== 2) {
      command = parts[0];
    } else {
      command = parts[1];
    }
    const prefix = (COMMAND_MAPPINGS as Record<string, any>)[command];
    const valueMap = (VALUE_MAPPINGS as Record<string, any>)[prefix];
    async.each(
      Object.keys(valueMap),
      (val: string, cb: any) => {
        result.push(val);
        cb();
      },
      (err: any) => {
        callback(err, result);
      }
    );
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
