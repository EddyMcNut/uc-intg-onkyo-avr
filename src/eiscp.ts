import net from "net";
import dgram from "dgram";
import log from "./loggers.js";

import EventEmitter from "events";
import { eiscpMappings } from "./eiscp-mappings.js";
import { DEFAULT_QUEUE_THRESHOLD, buildEntityId, buildPhysicalAvrId } from "./configManager.js";
import { findAvrInputId } from "./inputSourceStore.js";
import { delay } from "./utils.js";
import { IscpCommandParser, type CommandResult } from "./eiscp-command-parser.js";
import { createEiscpPacket, extractIscpMessage, extractAllIscpMessages } from "./eiscp-packet.js";
import { buildMultiZoneVolumeCommands, buildMultiZoneMuteCommands } from "./eiscp-multi-zone.js";
import { getDeezerBrowseState } from "./deezerBrowserStore.js";
import { getMusicServerBrowseState } from "./musicServerBrowserStore.js";
import { getTidalBrowseState } from "./tidalBrowserStore.js";
import { getTuneInMenuBrowseState } from "./tuneInMenuStore.js";
import { getZonePrefix } from "./zoneMappings.js";
import { WAIT_FOR_CONNECT_TIMEOUT, CONNECTION_TIMEOUT } from "./constants.js";
import type { AvrStateReader } from "./eiscp-command-parser.js";
import { findNetServiceByName } from "./avrInfoStore.js";
import { findLearnedListeningModeCode } from "./learnedListeningModeStore.js";
import { findConfiguredInputId } from "./inputSourcePreferences.js";
import { stripInputSourceMarker } from "./inputSourceResolver.js";
import { EiscpCommandWorkflow, NSS_SERVICE_NAMES, extractNetworkServiceCode, isTuneInPresetCommand } from "./eiscpCommandWorkflow.js";
import type { EiscpConfig } from "./eiscpTypes.js";

export type { EiscpConfig } from "./eiscpTypes.js";

const NOOP_STATE_READER: AvrStateReader = {
  getSource: () => "unknown",
  getSubSource: () => "unknown"
};

const COMMAND_MAPPINGS = eiscpMappings.command_mappings;
const VALUE_MAPPINGS = eiscpMappings.value_mappings;
const logSource = "eISCP:";
const IGNORED_COMMANDS = new Set(["NMS", "NPB", "NJA", "EDV", "NFI", "NDN", "NTR", "NDS", "NLU"]); // Commands to ignore from AVR (NMS=menu, NPB=playback info, NLU=list URL info)
const THROTTLED_COMMANDS = new Set(["IFA", "IFV", "FLD"]); // Commands to send to incoming queue for throttling
const FLD_VOLUME_HEX_PREFIX = "566F6C756D65"; // "Volume" in hex - skip these FLD messages

// Re-export zone prefix lookup for backward compatibility — canonical definition is in zoneMappings.ts
export { getZonePrefix, ZONE_COMMAND_MAP, ZONE_VOLUME_PREFIX, ZONE_VOLUME_UP_DOWN, ZONE_MUTE } from "./zoneMappings.js";

// Result from parsing an ISCP command — re-exported from eiscp-command-parser.ts
export type { CommandResult };

// Data payload emitted on 'data' event
interface DataPayload {
  command: string | undefined;
  argument: string | number | string[] | Record<string, string> | undefined;
  zone: string | undefined;
  iscpCommand: string;
  host: string | undefined;
  port: number | undefined;
  model: string | undefined;
}

// Discovered AVR device info
interface DiscoveredDevice {
  host: string;
  port: string;
  model: string;
  mac: string;
  areacode: string;
}

// Command input as object
interface CommandInput {
  zone?: string;
  command: string;
  args: string | number;
}

export class EiscpDriver extends EventEmitter {
  public get connected(): boolean {
    return this.isConnected;
  }

  // Read-only access to the current driver configuration.
  public get eiscpConfig(): Readonly<EiscpConfig> {
    return this.config;
  }

  // Merge a partial config patch into the current configuration.
  public updateConfig(patch: Partial<EiscpConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  private config: EiscpConfig;
  private eiscp: net.Socket | null = null;
  private isConnected = false;
  private disconnectRequested = false;
  private connectPromise: Promise<{ model: string; host: string; port: number } | null> | null = null;
  private sendQueue: Promise<void> = Promise.resolve();
  private pendingSendCount = 0;
  private lastSendTime = 0;
  private receiveQueue: Promise<void> = Promise.resolve();
  private readonly pendingIncoming = new Map<string, DataPayload>();
  private incomingDrainScheduled = false;
  private tcpBuffer: Buffer = Buffer.alloc(0);
  private readonly commandParser: IscpCommandParser;
  private readonly commandWorkflow: EiscpCommandWorkflow;

  constructor(
    config?: EiscpConfig,
    private readonly stateReader: AvrStateReader = NOOP_STATE_READER
  ) {
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
      configuredZones: config?.configuredZones,
      idInputSources: config?.idInputSources
    };
    this.commandParser = new IscpCommandParser(
      (zone) => buildEntityId(this.config.model!, this.config.host!, zone),
      this.stateReader,
      {
        getBrowseState: getDeezerBrowseState
      },
      {
        getBrowseState: getTidalBrowseState
      },
      {
        getBrowseState: getTuneInMenuBrowseState
      },
      {
        getBrowseState: getMusicServerBrowseState
      }
    );
    this.commandWorkflow = new EiscpCommandWorkflow({
      getConfig: () => this.config,
      raw: (command) => this.raw(command),
      publishMetadata: (metadata, command) => {
        this.commandParser.patchMetadata(metadata);
        this.emit("data", {
          command: "metadata",
          argument: { ...this.commandParser.getMetadata() },
          zone: "main",
          iscpCommand: command,
          host: this.config.host,
          port: this.config.port,
          model: this.config.model
        });
      }
    });
    if (this.listenerCount("error") === 0) {
      this.on("error", (err: Error) => {
        log.error("%s eiscp error (unhandled):", logSource, err);
      });
    }
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
          log.error("%s UDP error:", logSource, err);
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
            if (data.length < 4 || !data[0] || !data[1] || !data[2] || !data[3]) {
              log.warn("%s Ignoring malformed ECN discovery response from %s", logSource, rinfo.address);
              return;
            }
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
              log.error("%s UDP send error (network may not be ready):", logSource, err);
              // Close client and resolve with empty result - configured AVRs will still be tried
              clearTimeout(timeoutTimer);
              close();
            }
          });
          timeoutTimer = setTimeout(close, opts.timeout * 1000);
        })
        .on("close", () => {
          log.info("%s UDP socket closed", logSource);
        })
        .bind(0, undefined, (err?: Error) => {
          if (err) log.error("%s UDP bind error:", logSource, err);
        });
    });
  }

  async connect(options?: EiscpConfig): Promise<{ model: string; host: string; port: number } | null> {
    if (this.connectPromise) return this.connectPromise;
    const attempt = this.connectInternal(options);
    this.connectPromise = attempt;
    try {
      return await attempt;
    } finally {
      if (this.connectPromise === attempt) this.connectPromise = null;
    }
  }

  private async connectInternal(options?: EiscpConfig): Promise<{ model: string; host: string; port: number } | null> {
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
        log.error("%s No AVR found during discovery.", logSource);
        return null;
      }
    }
    // Ensure port is always a number
    const port = typeof this.config.port === "number" ? this.config.port : 60128;
    // If already connected, return info
    if (this.isConnected && this.eiscp) {
      return { model: this.config.model!, host: this.config.host!, port };
    }
    // A connection attempt may already be in progress. Reuse its socket rather
    // than calling socket.connect() a second time.
    if (this.eiscp) {
      return { model: this.config.model!, host: this.config.host!, port };
    }
    // Create new socket and connect
    const socket = net.connect(port, this.config.host!);
    this.eiscp = socket;
    // Bound connection establishment so failed attempts fail fast instead of hanging on
    // the OS-level TCP timeout. Disabled once the connection is established.
    this.eiscp.setTimeout(CONNECTION_TIMEOUT);
    this.eiscp
      .on("timeout", () => {
        this.isConnected = false;
        this.eiscp?.destroy();
      })
      .on("connect", () => {
        this.eiscp?.setTimeout(0); // no inactivity timeout on a live connection
        this.tcpBuffer = Buffer.alloc(0); // Clear any stale bytes from a previous connection.
        this.isConnected = true;
        this.emit("connect"); // Emit connect event for waitForConnect()
      })
      .on("close", () => {
        const intentionalDisconnect = this.disconnectRequested;
        this.disconnectRequested = false;
        this.tcpBuffer = Buffer.alloc(0);
        const wasConnected = this.isConnected;
        this.isConnected = false;
        if (this.eiscp === socket) this.eiscp = null;
        this.emit("close");
        if (wasConnected) {
          log.warn("%s Connection closed for %s at %s:%d", logSource, this.config.model, this.config.host, this.config.port || 60128);
        }
        if (!intentionalDisconnect && this.config.reconnect) {
          log.info("%s Scheduling reconnection in %ds", logSource, this.config.reconnectSleep);
          setTimeout(() => this.connect(), this.config.reconnectSleep! * 1000);
        }
      })
      .on("error", (err) => {
        log.error("%s Socket error for %s at %s:%d - %s", logSource, this.config.model, this.config.host, this.config.port || 60128, err.message);
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

          // log.info("%s RAW (0) RECEIVE: [%s] %s %s", logSource, command, value);

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
    const socket = this.eiscp;
    this.disconnectRequested = Boolean(socket);
    this.isConnected = false;
    this.eiscp = null;
    if (socket) {
      socket.destroy();
    }
  }

  // Enqueue a command to be sent with proper delay between commands
  private enqueueSend(data: string | string[]): Promise<void> {
    const prevQueue = this.sendQueue;
    this.pendingSendCount++;
    const task = (async () => {
      try {
        await prevQueue;
        if (this.isConnected && this.eiscp) {
          if (typeof data === "string") {
            this.eiscp.write(createEiscpPacket(data));
          } else {
            for (const cmd of data) {
              this.eiscp.write(createEiscpPacket(cmd));
            }
          }
          this.lastSendTime = Date.now();
          await delay(this.config.sendDelay! ?? DEFAULT_QUEUE_THRESHOLD);
        } else {
          throw new Error("Send command while not connected");
        }
      } finally {
        this.pendingSendCount--;
      }
    })();
    this.sendQueue = task.catch(() => {});
    return task;
  }

  // Enqueue an incoming message to be emitted with throttle delay
  private enqueueIncoming(data: DataPayload): void {
    // Coalesce throttled stream commands: only the latest value per command matters,
    // so stale intermediate frames (e.g. FLD scroll text) are dropped. This reduces
    // memory pressure and wasted work without losing the final state.
    this.pendingIncoming.set(data.command ?? data.iscpCommand, data);
    if (this.incomingDrainScheduled) {
      return;
    }
    this.incomingDrainScheduled = true;
    const prevQueue = this.receiveQueue;
    this.receiveQueue = (async () => {
      await prevQueue;
      try {
        await delay(this.config.receiveDelay ?? DEFAULT_QUEUE_THRESHOLD);
        this.incomingDrainScheduled = false;
        const batch = [...this.pendingIncoming.values()];
        this.pendingIncoming.clear();
        for (const payload of batch) {
          this.emit("data", payload);
        }
      } catch (err) {
        this.incomingDrainScheduled = false;
        log.error("%s Error processing queued incoming message:", logSource, err);
      }
    })();
  }

  // Send a raw ISCP command
  async raw(data: string): Promise<void> {
    if (!data) {
      throw new Error("No data provided");
    }
    return this.enqueueSend(data);
  }

  // Drop a command when the transport is still pacing a previous send. This is
  // used for repeat-style commands such as volume up/down, where queuing stale
  // requests would continue changing the AVR after the button is released.
  async rawIfAvailable(data: string): Promise<boolean> {
    if (!data) {
      throw new Error("No data provided");
    }
    const sendDelay = this.config.sendDelay ?? DEFAULT_QUEUE_THRESHOLD;
    const elapsed = Date.now() - this.lastSendTime;
    const reason =
      !this.isConnected || !this.eiscp
        ? "not connected"
        : this.pendingSendCount > 0
          ? `transport busy (${this.pendingSendCount} pending)`
          : elapsed < sendDelay
            ? `send pacing (${elapsed}ms/${sendDelay}ms)`
            : undefined;
    if (reason) {
      log.debug("%s Dropping paced raw command %s: %s", logSource, data, reason);
      return false;
    }
    log.debug("%s Accepting paced raw command %s", logSource, data);
    await this.enqueueSend(data);
    return true;
  }

  private async sendIscp(iscpCommand: string, zone: string = "main"): Promise<void> {
    // Hot path: most commands are plain ISCP and do not require TIP/NSS special handling.
    if (!iscpCommand.startsWith("TIP") && iscpCommand.indexOf("NSS") === -1 && !iscpCommand.startsWith("NSV")) {
      await this.raw(iscpCommand);
      return;
    }

    // Handle TuneIn preset navigation.
    await this.commandWorkflow.send(iscpCommand, zone);
  }

  // Backward-compatible accessors retained for integrations and diagnostics that used these
  // classifiers. The implementation is shared with EiscpCommandWorkflow.
  isTIPCommand(iscpCommand: string): boolean {
    return isTuneInPresetCommand(iscpCommand);
  }

  extractNSSCode(iscpCommand: string): string | undefined {
    return extractNetworkServiceCode(iscpCommand);
  }

  // Send a command to the AVR
  async command(data: string | CommandInput): Promise<void> {
    let command: string, args: string | number, zone: string;

    if (typeof data === "string") {
      const normalizedData = data.toLowerCase();

      // Fast path: most commands are not multi-zone, so only check detailed variants when needed.
      if (normalizedData.startsWith("multi-zone-")) {
        if (normalizedData.startsWith("multi-zone-volume")) {
          await this.handleMultiZoneCommand(data, "volume");
          return;
        }
        if (normalizedData.startsWith("multi-zone-muting")) {
          await this.handleMultiZoneCommand(data, "muting");
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

  private async handleMultiZoneCommand(data: string, commandType: "volume" | "muting"): Promise<void> {
    const parts = data
      .toLowerCase()
      .split(/[\s]+/)
      .filter((item) => item !== "");

    if (parts.length !== 2) {
      log.warn("%s Invalid multi-zone-%s command format: %s", logSource, commandType, data);
      return;
    }

    const action = parts[1];
    const configuredZones = this.config.configuredZones ?? ["main"];
    const commands = commandType === "volume" ? buildMultiZoneVolumeCommands(action, configuredZones) : buildMultiZoneMuteCommands(action, configuredZones);

    if (commands.length === 0) {
      log.warn("%s No zones configured for multi-zone-%s action: %s (configured zones: %s)", logSource, commandType, action, configuredZones.join(", "));
      return;
    }

    log.info("%s Multi-zone %s command: %s -> sending %d zone commands (configured zones: %s)", logSource, commandType, data, commands.length, configuredZones.join(", "));
    this.enqueueSend(commands);
  }

  private commandToIscp(command: string, args: string | number | undefined, zone: string): string {
    const prefix = (COMMAND_MAPPINGS as Record<string, string>)[command];
    let value: string;
    // Music Server is selected directly by the Onkyo app. SLI27 only moves
    // the NET menu cursor; it does not activate the service.
    if (prefix === "SLI" && typeof args === "string" && stripInputSourceMarker(args).toLowerCase() === "music-server") {
      return "NSV000";
    }
    if (prefix === "SLI" && typeof args === "string" && stripInputSourceMarker(args).toLowerCase() === "tidal") {
      return "NSV1B0";
    }
    if (prefix === "SLI" && typeof args === "string" && stripInputSourceMarker(args).toLowerCase() === "deezer") {
      return "NSV120";
    }
    const valueMap = (VALUE_MAPPINGS as unknown as Record<string, Record<string, { value: string }>>)[prefix];
    const mappedKey = args !== undefined && valueMap
      ? Object.keys(valueMap).find((key) => key.toLowerCase() === String(args).toLowerCase() || key.toLowerCase().replace(/[\s_-]+/g, "") === String(args).toLowerCase().replace(/[\s_-]+/g, ""))
      : undefined;
    if (args !== undefined && valueMap && mappedKey !== undefined) {
      value = valueMap[mappedKey].value;
    } else if (prefix === "SLI" && typeof args === "string") {
      args = stripInputSourceMarker(args);
      const physicalAvrId = buildPhysicalAvrId(this.config.model ?? "", this.config.host ?? "");
      const reportedService = findNetServiceByName(physicalAvrId, [args]);
      if (reportedService) {
        const logicalService = Object.entries(NSS_SERVICE_NAMES).find(([, names]) => names.includes(reportedService.name.toLowerCase().replace(/[^a-z0-9]/g, "")));
        if (logicalService) {
          log.debug("%s Sending reported network service %s through %s", logSource, args, logicalService[0]);
          return logicalService[0];
        }
        log.debug("%s Sending reported network service %s directly through NSV%s", logSource, args, reportedService.id);
        return `NSV${reportedService.id.toUpperCase()}0`;
      }

      // An input name the AVR reported itself ("BD/DVD", "CBL/SAT") is not in the hardcoded SLI
      // table: send the input id the AVR gave for it instead.
      const inputId = findAvrInputId(physicalAvrId, args) ?? findConfiguredInputId(this.config.idInputSources, args);
      if (inputId) {
        log.debug("%s Sending input-selector %s as %s%s (id reported by the AVR)", logSource, args, getZonePrefix(prefix, zone), inputId);
        return getZonePrefix(prefix, zone) + inputId;
      }
      log.error("%s Input source alias is not mapped: %s %s", logSource, command, args);
      value = String(args ?? "");
    } else if (prefix === "LMD" && typeof args === "string") {
      const physicalAvrId = buildPhysicalAvrId(this.config.model ?? "", this.config.host ?? "");
       const entityId = buildEntityId(this.config.model ?? "", this.config.host ?? "", zone);
       const learnedCode = findLearnedListeningModeCode(
         physicalAvrId,
         args,
         this.stateReader.getSource(entityId),
         this.stateReader.getAudioFormat?.(entityId)
       );
      if (learnedCode) {
        log.debug("%s Sending learned listening mode %s as LMD%s", logSource, args, learnedCode);
        value = learnedCode;
      } else {
        log.warn("%s Listening mode is not mapped: %s", logSource, args);
        value = String(args);
      }
    } else if (valueMap && Object.prototype.hasOwnProperty.call(valueMap, "intgrRange")) {
      value = (+args!).toString(16).toUpperCase().padStart(2, "0");
    } else {
      log.warn("%s not found in JSON: %s %s", logSource, command, args);
      value = String(args ?? "");
    }

    // Translate main zone command prefixes to zone-specific prefixes
    const zonePrefix = getZonePrefix(prefix, zone);

    return zonePrefix + value;
  }

  // Get all available commands
  getCommands(): string[] {
    const mappings = COMMAND_MAPPINGS as Record<string, string>;
    return Object.keys(mappings);
  }

  // Get all available values for a command
  getCommandValues(command: string): string[] {
    const parts = command.split(".");
    const cmd = parts.length === 2 ? parts[1] : parts[0];
    const prefix = (COMMAND_MAPPINGS as Record<string, string>)[cmd];
    const valueMap = (VALUE_MAPPINGS as Record<string, Record<string, unknown>>)[prefix] ?? {};
    return Object.keys(valueMap);
  }

  waitForConnect(timeoutMs = WAIT_FOR_CONNECT_TIMEOUT): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        resolve();
        return;
      }
      let timer: NodeJS.Timeout;
      const cleanup = () => {
        clearTimeout(timer);
        this.off("connect", onConnect);
        this.off("close", onClose);
        this.off("error", onError);
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onClose = () => {
        cleanup();
        reject(new Error("Connection closed before AVR responded"));
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timeout waiting for AVR connection"));
      }, timeoutMs);
      this.on("connect", onConnect);
      this.on("close", onClose);
      this.on("error", onError);
    });
  }
}

export default EiscpDriver;
