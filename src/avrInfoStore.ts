// Parser and store for the NRI (AVR Information) XML payload.
//
// NRI is a query-only command: `NRIQSTN` makes the AVR return a single XML document describing
// itself: model and firmware, zone layout, available inputs, network services, the full DAB and
// FM/AM preset lists, capability flags and tuner ranges. That makes it the only documented way to
// read preset slots directly, without driving the on-screen menu.
//
// The payload is a flat, attribute-only document, so a targeted scan is used instead of a real
// XML parser: this keeps the integration free of runtime dependencies.
import { physicalAvrIdFromEntityId } from "./configManager.js";
import { ZONE_ID_BY_ZONE } from "./zoneMappings.js";

/**
 * Band values observed in the `band` attribute of `<preset>` elements.
 *
 * Verified against a live TX-RZ50: with the input set to DAB and the display showing "JOENstop",
 * slot 12 of the `band=2` range is "JOEnstop". DAB service labels are space-padded to 8 characters
 * (the ETSI EN 300 401 limit), which these names are, and DAB has no tuning frequency to report,
 * which is why `freq` is "0". FM/AM presets carry a real frequency in `freq`.
 */
export const PRESET_BAND_EMPTY = "0";
/** FM/AM tuner preset, the `freq` attribute carries the frequency in MHz. */
export const PRESET_BAND_FM = "1";
/** DAB/DAB+ preset, addressed by service label rather than frequency. */
export const PRESET_BAND_DAB = "2";

export type AvrPreset = {
  /** 1-based slot number as stored on the AVR, derived from the 2-digit hex `id` attribute. */
  slot: number;
  /** Station name, trimmed from the space-padded `name` attribute. Empty for empty slots. */
  name: string;
  /** Raw `band` attribute, one of the PRESET_BAND_* constants. */
  band: string;
  /** Frequency string, only meaningful for tuner presets. */
  freq: string;
};

export type AvrNetService = {
  /** Service id as used by NSV, e.g. "0e" for TuneIn. */
  id: string;
  name: string;
  enabled: boolean;
  /** True when the service requires account details to be usable. */
  hasAccount: boolean;
};

export type AvrSelector = {
  /** Input id as used by SLI, e.g. "33" for DAB. */
  id: string;
  name: string;
};

export type AvrControl = {
  id: string;
  /** Availability or current parameter value, depending on the control. Never live state. */
  value: string;
  zone?: number;
  min?: number;
  max?: number;
  step?: number;
  /** The `code` attribute, present on controls that map to a named listening mode or menu. */
  code?: string;
  /** The `position` attribute, present on controls that map to a remote key. */
  position?: string;
};

export type AvrZone = {
  id: number;
  name: string;
  enabled: boolean;
  /**
   * `volmax`: the highest volume the AVR shows on its own display for this zone, in display units
   * (80 or 100). Zones the AVR has disabled report 0, and models without a volume scale omit it.
   */
  volMax?: number;
};

export type AvrTunerBand = {
  band: string;
  min: number;
  max: number;
  step: number;
};

export type AvrInfo = {
  model: string;
  friendlyName: string;
  firmwareVersion: string;
  presetCount: number;
  presets: AvrPreset[];
  netServices: AvrNetService[];
  zones: AvrZone[];
  selectors: AvrSelector[];
  controls: AvrControl[];
  tunerBands: AvrTunerBand[];
  /** Unix ms of the last successful parse, or undefined when nothing was collected yet. */
  collectedAt?: number;
};

// Match one self-closing element and capture its attributes, e.g. `<preset id="01" band="2" />`.
const ELEMENT_PATTERN = /<([a-zA-Z][\w-]*)\b([^>]*?)\/?>/g;
const ATTRIBUTE_PATTERN = /([\w-]+)\s*=\s*"([^"]*)"/g;

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

function readAttributes(attributeText: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  ATTRIBUTE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE_PATTERN.exec(attributeText)) !== null) {
    attributes[match[1].toLowerCase()] = unescapeXml(match[2]);
  }
  return attributes;
}

function toBoolean(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function toOptionalInt(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/**
 * Parse the NRI XML payload into a AvrInfo.
 * Returns null when the payload is not a usable avr-info document, so a
 * partial or unexpected reply can never wipe a previously good snapshot.
 */
export function parseAvrInfo(xml: string): AvrInfo | null {
  if (!xml || !xml.includes("<response") || !xml.includes("<device")) {
    return null;
  }

  // The AVR strips CR/LF from the payload but is not guaranteed to, so normalise first.
  const normalized = xml.replace(/\r?\n/g, "");

  const info: AvrInfo = {
    model: "",
    friendlyName: "",
    firmwareVersion: "",
    presetCount: 0,
    presets: [],
    netServices: [],
    zones: [],
    selectors: [],
    controls: [],
    tunerBands: [],
    collectedAt: Date.now()
  };

  let currentSection: "device" | "preset" | "netservice" | "zone" | "selector" | "control" | "tuner" | null = null;

  ELEMENT_PATTERN.lastIndex = 0;
  let element: RegExpExecArray | null;
  while ((element = ELEMENT_PATTERN.exec(normalized)) !== null) {
    const name = element[1].toLowerCase();
    const attributes = readAttributes(element[2]);

    switch (name) {
      case "device":
        currentSection = "device";
        break;
      case "presetlist":
        currentSection = "preset";
        info.presetCount = Number(attributes.count ?? 0);
        break;
      case "preset": {
        if (currentSection !== "preset") break;
        const slot = Number.parseInt(attributes.id ?? "", 16);
        if (!Number.isInteger(slot)) break;
        info.presets.push({
          slot,
          // Names are padded with trailing spaces to a fixed width on the AVR.
          name: (attributes.name ?? "").trim(),
          band: attributes.band ?? PRESET_BAND_EMPTY,
          freq: attributes.freq ?? ""
        });
        break;
      }
      case "netservicelist":
        currentSection = "netservice";
        break;
      case "netservice": {
        if (currentSection !== "netservice") break;
        info.netServices.push({
          id: (attributes.id ?? "").toLowerCase(),
          name: attributes.name ?? "",
          enabled: toBoolean(attributes.enable ?? attributes.value),
          // The AVR sends placeholder strings for services it has no credentials for, and omits
          // the attributes entirely for services that need no login.
          hasAccount: attributes.account !== undefined || attributes.password !== undefined
        });
        break;
      }
      case "selectorlist":
        currentSection = "selector";
        break;
      case "selector": {
        if (currentSection !== "selector") break;
        info.selectors.push({
          id: (attributes.id ?? "").toLowerCase(),
          name: attributes.name ?? ""
        });
        break;
      }
      case "controllist":
        currentSection = "control";
        break;
      case "control": {
        if (currentSection !== "control") break;
        info.controls.push({
          id: attributes.id ?? "",
          value: attributes.value ?? "",
          zone: toOptionalInt(attributes.zone),
          min: toOptionalInt(attributes.min),
          max: toOptionalInt(attributes.max),
          step: toOptionalInt(attributes.step),
          code: attributes.code,
          position: attributes.position
        });
        break;
      }
      case "zonelist":
        currentSection = "zone";
        break;
      case "zone": {
        if (currentSection !== "zone") break;
        const id = Number.parseInt(attributes.id ?? "", 10);
        if (!Number.isInteger(id)) break;
        info.zones.push({
          id,
          name: attributes.name ?? "",
          enabled: toBoolean(attributes.value),
          volMax: toOptionalInt(attributes.volmax)
        });
        break;
      }
      case "tuners":
        currentSection = "tuner";
        break;
      case "tuner": {
        if (currentSection !== "tuner") break;
        const min = Number.parseInt(attributes.min ?? "", 10);
        const max = Number.parseInt(attributes.max ?? "", 10);
        const step = Number.parseInt(attributes.step ?? "", 10);
        if (!Number.isInteger(min) || !Number.isInteger(max) || !Number.isInteger(step)) break;
        info.tunerBands.push({ band: attributes.band ?? "", min, max, step });
        break;
      }
      default:
        break;
    }
  }

  // Text-only elements are cheaper to read directly than via the attribute scan above.
  info.model = textElement(normalized, "model") ?? info.model;
  info.friendlyName = textElement(normalized, "friendlyname") ?? "";
  info.firmwareVersion = textElement(normalized, "firmwareversion") ?? "";

  return info;
}

function textElement(xml: string, tagName: string): string | undefined {
  const match = xml.match(new RegExp(`<${tagName}>([^<]*)</${tagName}>`, "i"));
  return match ? match[1] : undefined;
}

const avrInfoByPhysicalAvr = new Map<string, AvrInfo>();

/**
 * The NRI response is roughly 9 KB, so it is re-collected at most this often.
 * Preset edits on the AVR are picked up within this window without flooding the socket.
 */
export const AVR_INFO_TTL = 10 * 60 * 1000;

/** True when no receiver info was collected yet, or the cached snapshot is older than AVR_INFO_TTL. */
export function isAvrInfoStale(entityId: string): boolean {
  const info = getAvrInfo(entityId);
  if (!info?.collectedAt) {
    return true;
  }
  return Date.now() - info.collectedAt > AVR_INFO_TTL;
}

export function getAvrInfo(entityId: string): AvrInfo | null {
  const physicalAvrId = physicalAvrIdFromEntityId(entityId);
  if (!physicalAvrId) {
    return null;
  }
  return avrInfoByPhysicalAvr.get(physicalAvrId) ?? null;
}

export function setAvrInfo(entityId: string, info: AvrInfo): void {
  const physicalAvrId = physicalAvrIdFromEntityId(entityId);
  if (!physicalAvrId) {
    return;
  }
  avrInfoByPhysicalAvr.set(physicalAvrId, info);
}

/**
 * DAB/DAB+ presets, ordered by AVR slot number.
 * Empty slots are dropped so only actually stored stations are returned.
 */
export function listDabPresets(entityId: string): AvrPreset[] {
  const info = getAvrInfo(entityId);
  if (!info) {
    return [];
  }
  return info.presets.filter((preset) => preset.band === PRESET_BAND_DAB && preset.name !== "").sort((a, b) => a.slot - b.slot);
}

/** FM/AM tuner presets, ordered by AVR slot number. Empty slots are dropped. */
export function listFmPresets(entityId: string): AvrPreset[] {
  const info = getAvrInfo(entityId);
  if (!info) {
    return [];
  }
  return info.presets.filter((preset) => preset.band === PRESET_BAND_FM).sort((a, b) => a.slot - b.slot);
}

/**
 * Every preset slot the AVR has a station name for, on any band, ordered by AVR slot number.
 *
 * Empty slots (band=0, no name) are dropped: there is nothing to select there. The slot number is
 * kept because that is what `PRS` takes to recall a station.
 */
export function listNamedPresets(entityId: string): AvrPreset[] {
  const info = getAvrInfo(entityId);
  if (!info) {
    return [];
  }
  return info.presets.filter((preset) => preset.name !== "").sort((a, b) => a.slot - b.slot);
}

/** Inputs the AVR actually has, e.g. DAB, FM, NET, Bluetooth. */
export function listSelectors(entityId: string): AvrSelector[] {
  return getAvrInfo(entityId)?.selectors ?? [];
}

/**
 * Network services the AVR reports, e.g. TuneIn Radio, Spotify, TIDAL.
 *
 * This is the authoritative list for the current hardware: the hardcoded NETWORK_SERVICES constant
 * has to guess, and gets it wrong for any AVR whose firmware reports a different spelling.
 */
export function listNetServiceNames(entityId: string): string[] {
  return (getAvrInfo(entityId)?.netServices ?? []).map((service) => service.name).filter((name) => name !== "");
}

/** Read one control's raw value by id, e.g. getControlValue(id, "DolbyAtmos"). */
export function getControlValue(entityId: string, controlId: string): string | undefined {
  return getAvrInfo(entityId)?.controls.find((control) => control.id === controlId)?.value;
}

/**
 * Highest volume the AVR shows on its own display, in display units (80 or 100).
 *
 * The scale is a property of the AVR rather than of the zone, so the zone itself is preferred and any
 * other zone that reports a usable value is used as fallback. Returns undefined when nothing was
 * collected yet, when the AVR does not support NRI, or when it reports no volume scale at all.
 */
export function getAvrVolumeScale(entityId: string, zone: string): number | undefined {
  const zones = getAvrInfo(entityId)?.zones ?? [];
  const hasVolumeScale = (candidate: AvrZone | undefined): boolean => (candidate?.volMax ?? 0) > 0;
  const reporting = [zones.find((z) => z.id === ZONE_ID_BY_ZONE[zone]), ...zones].find(hasVolumeScale);
  return reporting?.volMax;
}

export function resetAvrInfo(entityId: string): void {
  const physicalAvrId = physicalAvrIdFromEntityId(entityId);
  if (physicalAvrId) {
    avrInfoByPhysicalAvr.delete(physicalAvrId);
  }
}
