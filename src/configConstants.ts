// Pure configuration types, constants, and utility functions. No I/O, no state, no side effects.

export const DEFAULT_QUEUE_THRESHOLD = 100;

/** Security: Maximum input lengths for validation */
export const MAX_LENGTHS = {
  MODEL_NAME: 50,
  IP_ADDRESS: 15,
  ALBUM_ART_URL: 250,
  PIN_CODE: 4,
  USER_COMMAND: 250, // input-selector, listening-mode, etc.
  RAW_COMMAND: 20 // raw MVL20, etc.
} as const;

/** Security: Validation patterns */
export const PATTERNS = {
  IP_ADDRESS: /^(\d{1,3}\.){3}\d{1,3}$/,
  MODEL_NAME: /^[a-zA-Z0-9\-_.() ]+$/,
  ALBUM_ART_URL: /^[a-zA-Z0-9._\-/]+$/,
  PIN_CODE: /^\d{4}$/,
  USER_COMMAND: /^[a-z0-9\-\s.:=]+$/i, // Letters, numbers, hyphens, spaces, delimiters
  SELECT_OPTION: /^[a-zA-Z0-9-]+$/, // Select-entity option entries: letters, numbers, hyphens only
  RAW_COMMAND: /^[A-Z0-9]+$/ // Uppercase letters and numbers only
} as const;

// Sentinel for "show all known options". Stored in config when the user leaves the field empty or enters 'all'.
export const ALL_OPTIONS = "all";

// Parsed value of a select-entity options field: "all" = show all, null = 'none' (don't create entity), else trimmed non-empty items.
export type SelectOptions = string[] | "all" | null;

// Parse a select-entity options field: 'all'/empty/undefined = show all, 'none' = don't create entity, else trimmed non-empty items.
export function parseSelectOptions(raw: unknown): SelectOptions {
  if (raw === null) return null;
  if (raw === undefined || raw === "") return ALL_OPTIONS;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    const lower = trimmed.toLowerCase();
    if (lower === "none") return null;
    if (lower === "all") return ALL_OPTIONS;
    return trimmed
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter((s) => s !== "");
  }
  if (Array.isArray(raw)) {
    const arr = (raw as unknown[]).map((s) => String(s).trim()).filter(Boolean);
    if (arr.length === 0) return ALL_OPTIONS;
    if (arr.length === 1 && arr[0].toLowerCase() === "none") return null;
    if (arr.length === 1 && arr[0].toLowerCase() === "all") return ALL_OPTIONS;
    return arr;
  }
  // Unknown type: return empty (treated as "all" by consumers) so callers can distinguish and validate the bad input.
  return [];
}

/** Parse a boolean-like value from string/boolean/undefined */
export function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return defaultValue;
}

/** Valid zone identifiers */
export type AvrZone = "main" | "zone2" | "zone3" | "zone4";

// Construct entity ID: "MODEL IP ZONE" (e.g. "TX-RZ50 192.168.2.103 main").
export function buildEntityId(model: string, host: string, zone: string): string {
  return `${model} ${host} ${zone}`;
}

// Construct physical AVR ID: "MODEL IP" (e.g. "TX-RZ50 192.168.2.103"), zone-agnostic.
export function buildPhysicalAvrId(model: string, host: string): string {
  return `${model} ${host}`;
}

// Derive physical AVR ID from entity ID "MODEL HOST ZONE" — returns null if fewer than 3 parts.
export function physicalAvrIdFromEntityId(entityId: string): string | null {
  const parts = entityId.trim().split(/\s+/);
  if (parts.length < 3) {
    return null;
  }
  const host = parts[parts.length - 2];
  const model = parts.slice(0, -2).join(" ");
  return buildPhysicalAvrId(model, host);
}

/** Default values for AVR configuration */
export const AVR_DEFAULTS = {
  queueThreshold: DEFAULT_QUEUE_THRESHOLD,
  albumArtURL: "album_art.cgi",
  volumeScale: 100,
  volumeDisplay: "absolute",
  adjustVolumeDispl: true,
  entityNameStyle: "short",
  createSensors: true,
  createRemoteEntity: true,
  createDiracSelectEntity: true,
  netMenuDelay: 500,
  tuneinPresetPosition: 1,
  tuneinMenuStyle: "mypresets",
  port: 60128
} as const;

export type EntityNameStyle = "long" | "short";
export type VolumeDisplay = "absolute" | "relative";
export type TuneInMenuStyle = "mypresets" | "full";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface AvrConfig {
  model: string;
  ip: string;
  port: number;
  zone: AvrZone;
  queueThreshold?: number;
  albumArtURL?: string;
  volumeScale?: number; // 80 or 100
  volumeDisplay?: VolumeDisplay; // absolute = 1-100 style, relative = dB style
  adjustVolumeDispl?: boolean; // true = use 0.5 dB steps (×2 / ÷2), false = direct EISCP value
  entityNameStyle?: EntityNameStyle; // long = include host/ip in visible names, short = omit host/ip
  createSensors?: boolean; // true = create sensor entities for this AVR
  createRemoteEntity?: boolean; // true = create a remote entity for this AVR
  createDiracSelectEntity?: boolean; // true (default) = create the Dirac select entity (fixed options)
  netMenuDelay?: number; // delay in ms for NET menu to load (default 2500)
  tuneinPresetPosition?: number; // position of "My Presets" in TuneIn menu (1-9, default 1)
  tuneinMenuStyle?: TuneInMenuStyle; // choose TuneIn navigation mode: mypresets or full
  // undefined = all options, non-empty = exact options, null = don't create entity. Empty input is normalized to "all".
  listeningModeOptions?: SelectOptions;
  // undefined = all inputs, non-empty = exact options, null = don't create entity. Empty input is normalized to "all".
  inputSelectorOptions?: SelectOptions;
}

// Learned capability entry. `names` are the canonical/alias names from eiscp-mappings.ts (seed).
// Once the AVR's exact front-panel name is captured (via FLD), `displayName` is set and `updated` becomes true.
export interface LearnedEntry {
  names: string[];
  displayName?: string;
  updated: boolean;
}

// Learning catalog for one physical AVR: LMD (listening modes) and SLI (input selectors), keyed by ISCP code (e.g. "08", "33").
export type LearningCatalog = {
  LMD: Record<string, LearnedEntry>;
  SLI: Record<string, LearnedEntry>;
};

export interface OnkyoConfig {
  avrs?: AvrConfig[];
  logLevel?: LogLevel;
  // true (default) = learn the AVR's exact front-panel names over time; false = use canonical mapping names only.
  learningEnabled?: boolean;
  // Per-physical-AVR learning data, keyed by physical AVR id (see buildPhysicalAvrId). Survives reboots and is part of backup/restore.
  learning?: Record<string, LearningCatalog>;
  queueThreshold?: number;
  albumArtURL?: string;
  volumeScale?: number; // 80 or 100
  volumeDisplay?: VolumeDisplay;
  adjustVolumeDispl?: boolean; // true = use 0.5 dB steps (×2 / ÷2), false = direct EISCP value
  entityNameStyle?: EntityNameStyle;
  createSensors?: boolean; // true = create sensor entities
  createRemoteEntity?: boolean; // true = create a remote entity
  // Legacy fields for backward compatibility
  model?: string;
  ip?: string;
  port?: number;
  selectedAvr?: string;
}

// AVR config with all optional fields resolved to defaults. Returned by normalizeAvrConfig.
export interface NormalizedAvrConfig {
  model: string;
  ip: string;
  port: number;
  zone: AvrZone;
  queueThreshold: number;
  albumArtURL: string;
  volumeScale: number;
  volumeDisplay: VolumeDisplay;
  adjustVolumeDispl: boolean;
  entityNameStyle: EntityNameStyle;
  createSensors: boolean;
  createRemoteEntity: boolean;
  createDiracSelectEntity: boolean;
  netMenuDelay: number;
  tuneinPresetPosition: number;
  tuneinMenuStyle: TuneInMenuStyle;
  listeningModeOptions: SelectOptions | undefined;
  inputSelectorOptions: SelectOptions | undefined;
}

// Coerce and apply defaults to a raw AvrConfig. OCP: adding a field only requires touching this function and AvrConfig/NormalizedAvrConfig.
export function normalizeAvrConfig(raw: AvrConfig): NormalizedAvrConfig {
  const queueThreshold = (() => {
    const v = raw.queueThreshold ?? AVR_DEFAULTS.queueThreshold;
    const n = typeof v === "number" ? v : parseInt(String(v), 10);
    return isNaN(n) || n < 0 ? DEFAULT_QUEUE_THRESHOLD : n;
  })();

  const albumArtURL = typeof raw.albumArtURL === "string" && raw.albumArtURL.trim() !== "" ? raw.albumArtURL.trim() : AVR_DEFAULTS.albumArtURL;

  const volumeScale = (() => {
    const v = typeof raw.volumeScale === "number" ? raw.volumeScale : parseInt(String(raw.volumeScale ?? ""), 10);
    return v === 80 || v === 100 ? v : AVR_DEFAULTS.volumeScale;
  })();

  const volumeDisplay: VolumeDisplay = String(raw.volumeDisplay ?? AVR_DEFAULTS.volumeDisplay).toLowerCase() === "relative" ? "relative" : "absolute";

  const adjustVolumeDispl = parseBoolean(raw.adjustVolumeDispl, AVR_DEFAULTS.adjustVolumeDispl);

  const entityNameStyle: EntityNameStyle = String(raw.entityNameStyle ?? AVR_DEFAULTS.entityNameStyle).toLowerCase() === "short" ? "short" : "long";

  const createSensors = parseBoolean(raw.createSensors, AVR_DEFAULTS.createSensors);

  const createRemoteEntity = parseBoolean(raw.createRemoteEntity, AVR_DEFAULTS.createRemoteEntity);

  const createDiracSelectEntity = parseBoolean(raw.createDiracSelectEntity, AVR_DEFAULTS.createDiracSelectEntity);

  const netMenuDelay = (() => {
    const v = typeof raw.netMenuDelay === "number" ? raw.netMenuDelay : parseInt(String(raw.netMenuDelay ?? ""), 10);
    return isNaN(v) || v < 0 ? AVR_DEFAULTS.netMenuDelay : v;
  })();

  const tuneinPresetPosition = (() => {
    const v = typeof raw.tuneinPresetPosition === "number" ? raw.tuneinPresetPosition : parseInt(String(raw.tuneinPresetPosition ?? ""), 10);
    if (isNaN(v) || v < 1 || v > 9) return AVR_DEFAULTS.tuneinPresetPosition;
    return v;
  })();

  const tuneinMenuStyle: TuneInMenuStyle = String(raw.tuneinMenuStyle ?? AVR_DEFAULTS.tuneinMenuStyle).toLowerCase() === "full" ? "full" : "mypresets";

  const port = (() => {
    const p = typeof raw.port === "number" ? raw.port : parseInt(String(raw.port ?? ""), 10);
    return isNaN(p) || p < 1 || p > 65535 ? AVR_DEFAULTS.port : p;
  })();

  return {
    model: raw.model,
    ip: raw.ip,
    port,
    zone: raw.zone,
    queueThreshold,
    albumArtURL,
    volumeScale,
    volumeDisplay,
    adjustVolumeDispl,
    entityNameStyle,
    createSensors,
    createRemoteEntity,
    createDiracSelectEntity,
    netMenuDelay,
    tuneinPresetPosition,
    tuneinMenuStyle,
    listeningModeOptions: Array.isArray(raw.listeningModeOptions) ? raw.listeningModeOptions.map((s) => s.trim()) : raw.listeningModeOptions,
    inputSelectorOptions: raw.inputSelectorOptions
  };
}
