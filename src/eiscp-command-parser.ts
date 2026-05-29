import { eiscpCommands } from "./eiscp-commands.js";
import { eiscpMappings } from "./eiscp-mappings.js";
import { NETWORK_SERVICES, NO_TITLE } from "./constants.js";
import type { TidalBrowseState } from "./tidalBrowserStore.js";

const COMMANDS = eiscpCommands.commands;
const VALUE_MAPPINGS = eiscpMappings.value_mappings;

// Zone-specific command codes → main-zone equivalent (for incoming command parsing)
const ZONE2_REVERSE_MAP: Record<string, string> = { ZVL: "MVL", ZPW: "PWR", ZMT: "AMT", SLZ: "SLI", TUZ: "TUN" };
const ZONE3_REVERSE_MAP: Record<string, string> = { VL3: "MVL", PW3: "PWR", MT3: "AMT", SL3: "SLI", TU3: "TUN" };
const ZONE4_REVERSE_MAP: Record<string, string> = { VL4: "MVL", PW4: "PWR", MT4: "AMT", SL4: "SLI", TU4: "TUN" };

export interface AvrStateReader {
  getSource(entityId: string): string;
  getSubSource(entityId: string): string;
}

export interface TidalStoreApi {
  getBrowseState(entityId: string): TidalBrowseState | null;
}

export interface Metadata {
  title?: string;
  artist?: string;
  album?: string;
}

export interface CommandResult {
  command: string;
  argument: string | number | string[] | Record<string, string>;
  zone: string;
}

type CommandHandler = (value: string, command: string, result: CommandResult) => CommandResult;

// Parses raw ISCP command strings into structured CommandResult objects; owns current metadata state.
export class IscpCommandParser {
  private currentMetadata: Metadata = {};
  private readonly commandHandlers: Record<string, CommandHandler>;

  // getEntityId: returns UC entity ID for a zone (called at parse time). stateReader/tidalStore: injected for testability.
  constructor(
    private readonly getEntityId: (zone: string) => string,
    private readonly stateReader: AvrStateReader,
    private readonly tidalStore: TidalStoreApi
  ) {
    this.commandHandlers = {
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
  }

  /** Read the current metadata snapshot (title, artist, album). */
  getMetadata(): Readonly<Metadata> {
    return { ...this.currentMetadata };
  }

  /** Partially update the current metadata (used by the driver during TuneIn navigation). */
  patchMetadata(patch: Partial<Metadata>): void {
    Object.assign(this.currentMetadata, patch);
  }

  /**
   * Parse a raw ISCP command into a structured result.
   * Returns null if the command maps to nothing useful (unknown command, zone offline, no match).
   */
  parse(command: string, value: string): CommandResult | null {
    const result: CommandResult = {
      command: "undefined",
      argument: "undefined",
      zone: "main"
    };

    // Detect zone from command prefix
    if (command.charAt(0) === "Z" && command.length === 3) {
      result.zone = "zone2";
    } else if (command.charAt(2) === "Z" && command.length === 3) {
      result.zone = "zone2";
    } else if (command.charAt(2) === "3" && command.length === 3) {
      result.zone = "zone3";
    } else if (command.charAt(2) === "4" && command.length === 3) {
      result.zone = "zone4";
    }

    // Delegate to special handler if one exists
    const upperCommand = command.toUpperCase();
    const handler = this.commandHandlers[upperCommand];
    if (handler) {
      const handled = handler(value, command, result);
      return handled.command === "undefined" ? null : handled;
    }

    // Map zone-specific command codes back to main zone for command table lookup
    let lookupCommand = command;
    if (result.zone === "zone2") {
      lookupCommand = ZONE2_REVERSE_MAP[command] || command;
    } else if (result.zone === "zone3") {
      lookupCommand = ZONE3_REVERSE_MAP[command] || command;
    } else if (result.zone === "zone4") {
      lookupCommand = ZONE4_REVERSE_MAP[command] || command;
    }

    type CommandType = {
      name: string;
      values: { [key: string]: { name: string | string[] } };
    };
    const cmdObj = (COMMANDS as unknown as Record<string, CommandType>)[lookupCommand];
    if (!cmdObj) {
      return null;
    }

    result.command = cmdObj.name;
    const valuesObj = cmdObj.values;

    if (valuesObj[value]?.name !== undefined) {
      result.argument = valuesObj[value].name;
    } else if (value === "N/A") {
      // Skip N/A values (zone is off or unavailable)
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
      if ((result.argument as string[]).length === 1) {
        result.argument = (result.argument as string[])[0];
      }
    }

    return result;
  }

  // ==================== Parsing helpers ====================

  private timeToSeconds(timeStr: string): number {
    if (!timeStr) return 0;
    const parts = timeStr.split(":").map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 1) {
      return parts[0];
    }
    return 0;
  }

  private parseAvInfoParts(value: string): string[] {
    return (value?.toString() ?? "").split(",").map((p) => p.trim());
  }

  private getAvPart(parts: string[], index: number, removeSpaces = false): string {
    const val = parts[index] || "";
    return removeSpaces ? val.replace(/\s+/g, "") : val;
  }

  private joinFiltered(values: string[], separator = " | "): string {
    return values.filter(Boolean).join(separator);
  }

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

    // Get current subsource to override artist for certain streaming services
    const entityId = this.getEntityId(result.zone);
    const currentSubSource = this.stateReader.getSubSource(entityId);

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
    result.argument = { ...this.currentMetadata } as Record<string, string>;
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
    // NLT format: xx u y cccc iiii ll s r aa bb ss [title text]  (all hex until title)
    //   xx   = service type (2 hex chars)
    //   u    = UI type (1 char)
    //   y    = layer info (1 char)
    //   cccc = cursor position, 0-based absolute (4 hex chars) — chars 4-7
    //   iiii = total item count (4 hex chars)                  — chars 8-11
    const entityId = this.getEntityId(result.zone);

    if (value.length >= 12) {
      const cursorHex = value.substring(4, 8);
      const countHex = value.substring(8, 12);
      const layerHex = value.length >= 14 ? value.substring(12, 14) : "";
      if (/^[0-9A-Fa-f]{4}$/.test(cursorHex) && /^[0-9A-Fa-f]{4}$/.test(countHex)) {
        const cursorOffset = parseInt(cursorHex, 16);
        const totalCount = parseInt(countHex, 16);
        const layerNumber = /^[0-9A-Fa-f]{2}$/.test(layerHex) ? parseInt(layerHex, 16) : 0;
        if (this.stateReader.getSubSource(entityId) === "tidal") {
          const tidalState = this.tidalStore.getBrowseState(entityId);
          if (tidalState) {
            // Don't overwrite the cursor during harvest — the loop manages it locally.
            if (!tidalState.harvestMode) tidalState.nlsCursorOffset = cursorOffset;
            tidalState.totalListItemCount = totalCount;
            if (layerNumber > 0) tidalState.nlsLayerNumber = layerNumber;
          }
        }
      }
    }

    // The hex payload is followed by ASCII/UTF-8 title text. The text may be uppercase (e.g. "TIDAL"),
    // so detect the first non-hex character instead of relying on title casing.
    const asciiStart = value.search(/[^0-9A-Fa-f]/);
    if (asciiStart === -1) {
      return result;
    }

    const text = value
      .substring(asciiStart)
      .replace(/\s+%s$/i, "")
      .trim();
    if (!text) {
      return result;
    }

    const currentSource = this.stateReader.getSource(entityId);

    // Check if the title contains a known network service name
    const normalizedText = text.toLowerCase();
    const detectedService = NETWORK_SERVICES.find((service) => normalizedText.includes(service.toLowerCase()));
    if (detectedService) {
      const currentSubSource = this.stateReader.getSubSource(entityId);
      if (currentSubSource !== detectedService.toLowerCase()) {
        result.command = "NLT";
        result.argument = detectedService;
        return result;
      }
    }

    if (currentSource === "net" && normalizedText === "my presets") {
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

    const entityId = this.getEntityId(result.zone);
    const currentSource = this.stateReader.getSource(entityId);

    // Check if FLD content matches a network service (regardless of current source)
    const detectedService = NETWORK_SERVICES.find((service) => ascii.startsWith(service));

    switch (currentSource) {
      case "net": {
        if (detectedService) {
          // Known service detected - only emit if different from current subSource
          const currentSubSource = this.stateReader.getSubSource(entityId);
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
}
