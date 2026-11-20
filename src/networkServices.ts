// Single source of truth for the network services and source ids the integration understands.
//
// - `id` is the canonical sub-source id stored in avrState (e.g. "music-server").
// - `displayName` is the integration's display vocabulary. It is deliberately not the AVR's own spelling:
//   the AVR reports e.g. "TuneIn Radio" in NRI, which is matched through `aliases` (see avrInfoStore for the
//   AVR-reported list).
// - `aliases` are other spellings, compared in compact form (lowercase, letters and digits only).
// - `nss` is the logical NSS service code, when the service has one.
// - The row order matters: text detection returns the first service whose display name occurs in the text.

export interface NetworkServiceCapabilities {
  // Album art is available while playing.
  albumArt: boolean;
  // NAT/NTI/NAL song metadata is available.
  songInfo: boolean;
  // Media browsing is supported by the integration.
  browse: boolean;
  // The service sends no usable title; the display name is shown instead.
  noTitle: boolean;
}

export interface NetworkServiceDefinition {
  id: string;
  displayName: string;
  aliases: readonly string[];
  nss?: string;
  capabilities: NetworkServiceCapabilities;
}

const NONE: NetworkServiceCapabilities = { albumArt: false, songInfo: false, browse: false, noTitle: false };

export const NETWORK_SERVICE_DEFINITIONS: readonly NetworkServiceDefinition[] = [
  { id: "tunein", displayName: "TuneIn", aliases: ["tuneinradio"], nss: "NSS01", capabilities: { albumArt: true, songInfo: true, browse: true, noTitle: true } },
  { id: "spotify", displayName: "Spotify", aliases: [], nss: "NSS02", capabilities: { ...NONE, albumArt: true, songInfo: true } },
  { id: "deezer", displayName: "Deezer", aliases: [], nss: "NSS03", capabilities: { ...NONE, albumArt: true, songInfo: true, browse: true } },
  { id: "tidal", displayName: "Tidal", aliases: [], nss: "NSS04", capabilities: { ...NONE, albumArt: true, songInfo: true, browse: true } },
  { id: "amazonmusic", displayName: "AmazonMusic", aliases: [], nss: "NSS05", capabilities: { ...NONE, albumArt: true, songInfo: true } },
  { id: "chromecast-built-in", displayName: "Chromecast built-in", aliases: ["chromecast"], nss: "NSS06", capabilities: NONE },
  { id: "dts-play-fi", displayName: "DTS Play-Fi", aliases: ["playfi"], nss: "NSS07", capabilities: { ...NONE, albumArt: true, songInfo: true } },
  { id: "airplay", displayName: "AirPlay", aliases: ["airplay2"], nss: "NSS08", capabilities: { ...NONE, songInfo: true } },
  { id: "alexa", displayName: "Alexa", aliases: ["amazonalexa"], nss: "NSS09", capabilities: NONE },
  { id: "music-server", displayName: "Music Server", aliases: [], nss: "NSS10", capabilities: { ...NONE, browse: true } },
  { id: "usb", displayName: "USB", aliases: [], capabilities: NONE },
  { id: "play-queue", displayName: "Play Queue", aliases: [], capabilities: NONE }
];

// Source ids (the SLI input, not the network service) that the AVR may report with a friendly name.
// Keeps the state vocabulary canonical so NET browsing, metadata and album art work with AVR-reported inputs too.
const SOURCE_ALIASES: Readonly<Record<string, string>> = {
  network: "net",
  musicserver: "music-server",
  internetradio: "internet-radio",
  iradiofavorite: "internet-radio-favorite"
};

// Lowercase, trimmed, whitespace runs replaced by "-". Example: "Music Server" -> "music-server".
function toDashed(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

// Lowercase letters and digits only, for spelling-insensitive comparison. Example: "DTS Play-Fi" -> "dtsplayfi".
export function toCompactName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Find a service by id, display name or alias, in any spelling.
export function findNetworkService(name: string): NetworkServiceDefinition | undefined {
  const compact = toCompactName(name);
  if (!compact) return undefined;
  return NETWORK_SERVICE_DEFINITIONS.find((service) => toCompactName(service.id) === compact || toCompactName(service.displayName) === compact || service.aliases.includes(compact));
}

// Canonical sub-source id. Known services resolve to their id ("TuneIn Radio" -> "tunein");
// anything else is returned in dashed form ("My Presets" -> "my-presets").
export function toServiceId(name: string): string {
  return findNetworkService(name)?.id ?? toDashed(name);
}

// Canonical source id. Example: "Network" -> "net", "Internet Radio" -> "internet-radio".
export function toSourceId(source: string): string {
  const dashed = toDashed(source);
  return SOURCE_ALIASES[toCompactName(dashed)] ?? dashed;
}

export function hasServiceCapability(serviceIdOrName: string, capability: keyof NetworkServiceCapabilities): boolean {
  return findNetworkService(serviceIdOrName)?.capabilities[capability] ?? false;
}

export function listServiceIdsWith(capability: keyof NetworkServiceCapabilities): string[] {
  return NETWORK_SERVICE_DEFINITIONS.filter((service) => service.capabilities[capability]).map((service) => service.id);
}

const DISPLAY_NAMES_LOWERCASE = new Set(NETWORK_SERVICE_DEFINITIONS.map((service) => service.displayName.toLowerCase()));

// True when a menu row is exactly one of the network services' display names, e.g. a row of the AVR's NET root menu
// ("Spotify", "Music Server", "Play Queue"). Case-insensitive, surrounding whitespace ignored; no alias matching.
export function isNetworkServiceDisplayName(title: string): boolean {
  return DISPLAY_NAMES_LOWERCASE.has(title.trim().toLowerCase());
}
