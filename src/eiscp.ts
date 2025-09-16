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
const COMMANDS = eiscpCommands.commands;
const COMMAND_MAPPINGS = eiscpCommands.command_mappings;
const VALUE_MAPPINGS = eiscpCommands.value_mappings;

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

  // Create a proper eISCP packet for UDP broadcast (discovery)
  private eiscp_packet(data: string): Buffer {
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

  private iscp_to_command(message: string) {
    // Support both ISCP payloads with '!1' and raw command replies (e.g., DSNR10...)
    let payload: string;
    let cmd: string;
    let arg: string;
    if (message.indexOf("!1") !== -1) {
      // ISCP format
      const payloadIdx = message.indexOf("!1");
      payload = message.slice(payloadIdx).replace(/[\r\n]/g, "");
      cmd = payload.slice(2, 5);
      arg = payload.slice(5);
    } else {
      // Raw command format (e.g., DSNR10...)
      payload = message.replace(/[\r\n]/g, "");
      cmd = payload.slice(0, 3);
      arg = payload.slice(3);
    }
    // Remove trailing control characters (e.g., \x1A, \r, \n)
    arg = arg.replace(/[\x00-\x1F\x7F]+$/g, "");

    // Handle metadata and DAB station info explicitly
    if (cmd === "DSN") {
      // DAB station info
      return { command: "DSN", argument: arg };
    }
    if (cmd === "NTM") {
      // Now playing time info
      return { command: "NTM", argument: arg };
    }
    if (["NAT", "NTI", "NAL"].includes(cmd)) {
      // Metadata fields: Title, Artist, Album
      // Return as metadata object
      if (!this.currentMetadata) this.currentMetadata = {};
      if (cmd === "NAT") this.currentMetadata.title = arg;
      if (cmd === "NTI") this.currentMetadata.artist = arg;
      if (cmd === "NAL") this.currentMetadata.album = arg;
      return { command: "metadata", argument: { ...this.currentMetadata } };
    }

    // Translate command and argument using eiscp-commands.ts
    let friendlyCommand = cmd;
    let friendlyArgument = arg || "";
    // Debug log for volume parsing
    if (cmd === "MVL") {
      console.debug(`[EiscpDriver DEBUG] Parsed volume reply: command=MVL, argument=${friendlyArgument}`);
    }
    // Use correct mapping for command translation
    const cmdMap = (COMMANDS as any)[cmd] || (COMMANDS as any)[cmd.toUpperCase()];
    if (cmdMap) {
      friendlyCommand = cmdMap.name || cmd;
      // Try to map argument to friendly name if possible
      const values = cmdMap.values;
      if (values && values[arg] && values[arg].name) {
        friendlyArgument = values[arg].name;
      } else if (values && values[arg]) {
        friendlyArgument = arg;
      } else if (values && values.QSTN && arg === "QSTN") {
        friendlyArgument = values.QSTN.name || "query";
      }
    }
    return { command: friendlyCommand, argument: friendlyArgument };
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
          console.log(`[EiscpDriver] UDP packet from ${rinfo.address}:${rinfo.port} | HEX: ${raw} | ASCII: ${ascii}`);
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
          console.log(`[EiscpDriver] UDP sending to ${opts.address}:${opts.port} | Buffer:`, buffer.toString("hex"));
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
      this.emit("debug", "Already connected, skipping connect()");
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
        this.emit("connect", this.config.host, this.config.port, this.config.model);
        // Send initial queries after connection established
        this.command("system-power query");
        this.command("audio-muting query");
        this.command("volume query");
        this.command("input-selector query");
        this.command("preset query");
        this.raw("DSNQSTN");
        this.emit(
          "debug",
          `[EiscpDriver] Connected to AVR at ${this.config.host}:${this.config.port} (model: ${this.config.model})`
        );
      })
      .on("close", () => {
        this.is_connected = false;
        this.emit("close", this.config.host, this.config.port);
        if (this.config.reconnect) {
          setTimeout(() => this.connect(), this.config.reconnect_sleep! * 1000);
        }
      })
      .on("error", () => {
        this.is_connected = false;
        this.eiscp?.destroy();
      })
      .on("data", (data: any) => {
        this.emit("debug", `[EiscpDriver] Received data: ${data.toString("hex")} | ${data.toString()}`);
        const iscp_message = this.eiscp_packet_extract(data);
        const command = iscp_message.slice(0, 3);
        // Log ALL received messages, even those filtered out
        this.emit("debug", `[EiscpDriver] Raw TCP message: ${iscp_message.replace(/\r|\n/g, "↵")}`);
        if (["FLD", "NMS", "NPB"].includes(command)) {
          this.emit("debug", `[EiscpDriver] Ignored command: ${command}`);
          return;
        }
        const rawResult = this.iscp_to_command(iscp_message);
        if (!rawResult) {
          this.emit("debug", `[EiscpDriver] Could not parse ISCP message: ${iscp_message}`);
          return;
        }
        this.emit("data", {
          command: rawResult.command ?? undefined,
          argument: rawResult.argument ?? undefined,
          iscpCommand: iscp_message,
          host: this.config.host,
          port: this.config.port,
          model: this.config.model
        });
        this.emit(
          "debug",
          `[EiscpDriver] Emitted data event: command=${rawResult.command}, argument=${rawResult.argument}, iscpCommand=${iscp_message}`
        );
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
      this.emit("debug", `[EiscpDriver] Sending raw command: ${data}`);
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
        this.emit("debug", `[EiscpDriver] Sending command: ${data}`);
        this.raw(this.command_to_iscp(data, undefined, "main"), callback);
        return;
      }
    } else if (typeof data === "object" && data !== null) {
      zone = data.zone ?? "main";
      command = data.command;
      args = data.args;
    } else {
      this.emit("debug", `[EiscpDriver] Sending command: ${JSON.stringify(data)}`);
      this.raw(this.command_to_iscp(data, undefined, "main"), callback);
      return;
    }
    this.emit("debug", `[EiscpDriver] Sending command: zone=${zone}, command=${command}, args=${args}`);
    this.raw(this.command_to_iscp(command, args, zone), callback);
  }

  private command_to_iscp(command: string, args: any, zone: string) {
    const prefix = (COMMAND_MAPPINGS as Record<string, any>)[command];
    let value: any;
    const valueMap = (VALUE_MAPPINGS as Record<string, any>)[prefix];
    if (valueMap && Object.prototype.hasOwnProperty.call(valueMap, args)) {
      value = valueMap[args].value;
    } else if (valueMap && Object.prototype.hasOwnProperty.call(valueMap, "INTRANGES")) {
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
