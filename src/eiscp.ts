export interface EiscpConfig {
  host?: string;
  port?: number;
  model?: string;
  reconnect?: boolean;
  reconnect_sleep?: number;
  verify_commands?: boolean;
  send_delay?: number;
}
import net from "net";
import dgram from "dgram";
import async from "async";

import EventEmitter from "events";
import { eiscpCommands } from "./eiscp-commands.js";
import { avrCurrentSource, setAvrCurrentSource } from "./state.js";
const COMMANDS = eiscpCommands.commands;
const COMMAND_MAPPINGS = eiscpCommands.command_mappings;
const VALUE_MAPPINGS = eiscpCommands.value_mappings;
// const VALUE_MAPPINGS: {
// [prefix: string]: {
// [arg: string]: any;
// intgrRange?: any;
// };
// } = eiscpCommands.value_mappings;

const integrationName = "Onkyo-Integration: ";

interface Metadata {
  title?: string;
  artist?: string;
  album?: string;
}

export class EiscpDriver extends EventEmitter {
  public get connected(): boolean {
    return this.is_connected;
  }
  private config: EiscpConfig;
  private eiscp: net.Socket | null = null;
  private is_connected = false;
  private send_queue: async.AsyncQueue<any>;
  private currentMetadata: Metadata = {};

  constructor(config?: EiscpConfig) {
    super();
    this.config = {
      host: config?.host,
      port: config?.port ?? 60128,
      model: config?.model,
      reconnect: config?.reconnect ?? false,
      reconnect_sleep: config?.reconnect_sleep ?? 5,
      verify_commands: config?.verify_commands ?? false,
      send_delay: config?.send_delay ?? 500
    };
    this.send_queue = async.queue(this.sendCommand.bind(this), 1);
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

  // Create a proper eISCP packet for UDP broadcast (discovery)
  private eiscp_packet(data: any): Buffer {
    // Add ISCP header if not already present
    if (data.charAt(0) !== "!") {
      data = "!1" + data;
    }
    // ISCP message
    const iscp_msg = Buffer.from(data + "\x0D\x0a");
    // eISCP header
    const header = Buffer.from([
      73,
      83,
      67,
      80, // magic
      0,
      0,
      0,
      16, // header size
      0,
      0,
      0,
      0, // data size
      1,
      0,
      0,
      0 // version + reserved
    ]);
    // write data size to eISCP header
    header.writeUInt32BE(iscp_msg.length, 8);
    return Buffer.concat([header, iscp_msg]);
  }

  // Extract message from eISCP packet (discovery response)
  private eiscp_packet_extract(packet: Buffer): string {
    // Extract ASCII message from offset 18 to length-2
    return packet.toString("ascii", 18, packet.length - 2);
  }

  private iscp_to_command(iscp_message: any) {
    // Transform a low-level ISCP message to a high-level command
    var command = iscp_message.slice(0, 3),
      value = iscp_message.slice(3),
      result: { command: string; argument: string | number | string[] | Record<string, string>; zone: string } = {
        command: "undefined",
        argument: "undefined",
        zone: "main"
      };
    value = String(value).replace(/[\x00-\x1F]/g, ""); // remove weird characters like \x1A

    // Strip trailing ISCP messages for certain commands
    if (["SLI", "PRS", "AMT", "MVL"].includes(command)) {
      const idx = value.indexOf("ISCP");
      if (idx !== -1) {
        value = value.substring(0, idx);
      }
      value = value.trim();
    }

    // console.log("%s RAW: %s %s", integrationName, command, value); 

    if (command === "NTM") {
      let [position, duration] = value.toString().split("/");
      position = this.timeToSeconds(position).toString();
      duration = this.timeToSeconds(duration).toString();
      result.command = "NTM";
      result.argument = position + "/" + duration;
      return result;
    }

    if (["NAT", "NTI", "NAL"].includes(command)) {
      setAvrCurrentSource("net");
      value = command + value;
      const parts = value.split(/ISCP(?:[$.!]1|\$!1)/);
      for (const part of parts) {
        if (!part.trim()) continue; // skip empty parts
        const match = part.trim().match(/^([A-Z]{3})\s*(.*)$/s);
        if (match) {
          // Parse all metadata fields from the value, regardless of command, handles cases like: "NATTitle\nNTIArtist\nNALAlbum"
          const metaMatches = value.match(/(NAT|NTI|NAL)[^\n\r]*/g);
          if (metaMatches) {
            for (const meta of metaMatches) {
              const type = match[1];
              const val = match[2].trim();
              if (type === "NAT") this.currentMetadata.title = val;
              if (type === "NTI") this.currentMetadata.artist = val;
              if (type === "NAL") this.currentMetadata.album = val;
            }
          } else {
            // Fallback: assign the value to the current command type
            if (command === "NAT") this.currentMetadata.title = value;
            if (command === "NTI") this.currentMetadata.artist = value;
            if (command === "NAL") this.currentMetadata.album = value;
          }
        }
      }

      result.command = "metadata";
      result.argument = { ...this.currentMetadata };
      return result;
    }

    if (command === "DSN") {
      result.command = "DSN";
      result.argument = value;
      return result;
    }

    type CommandType = {
      name: string;
      values: { [key: string]: { name: string } };
    };

    (Object.keys(COMMANDS) as Array<keyof typeof COMMANDS>).forEach(function () {
      const commansList = COMMANDS as unknown as { [key: string]: CommandType };

      if (typeof commansList[command] !== "undefined") {
        result.command = commansList[command].name;

        // console.log("******* %s", command);

        const cmdObj = COMMANDS[command as keyof typeof COMMANDS];
        const valuesObj = cmdObj.values as { [key: string]: { name: string } };
        if (valuesObj[value]?.name !== undefined) {
          result.argument = valuesObj[value]?.name;

          // return result;
        } else if (
          VALUE_MAPPINGS.hasOwnProperty(command as keyof typeof VALUE_MAPPINGS) &&
          Object.prototype.hasOwnProperty.call(VALUE_MAPPINGS[command as keyof typeof VALUE_MAPPINGS], "intgrRange")
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

  async discover(options?: {
    devices?: number;
    timeout?: number;
    address?: string;
    port?: number;
    subnetBroadcast?: string;
  }): Promise<any[]> {
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
          reject(err);
        })
        .on("message", (packet: any, rinfo: any) => {
          // Log ALL UDP packets, not just ECN
          const raw = packet.toString("hex");
          const ascii = packet.toString("ascii");
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
            if (err) console.error(`[EiscpDriver] UDP send error:`, err);
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
        const command = iscp_message.slice(0, 3);

        // Ignore these messages
        if (["FLD", "NMS", "NPB"].includes(command)) {
          return;
        }

        const rawResult = this.iscp_to_command(iscp_message);

        // Only emit if rawResult is defined
        if (!rawResult) {
          return;
        }

        this.emit("data", {
          command: rawResult.command ?? undefined,
          argument: rawResult.argument ?? undefined,
          zone: rawResult.zone ?? undefined,
          iscpCommand: iscp_message,
          host: this.config.host,
          port: this.config.port,
          model: this.config.model
        });
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
        this.raw(this.command_to_iscp(data, undefined, "main"), callback);
        return;
      }
    } else if (typeof data === "object" && data !== null) {
      zone = data.zone ?? "main";
      command = data.command;
      args = data.args;
    } else {
      this.raw(this.command_to_iscp(data, undefined, "main"), callback);
      return;
    }
    this.raw(this.command_to_iscp(command, args, zone), callback);
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
    return prefix + value;
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
