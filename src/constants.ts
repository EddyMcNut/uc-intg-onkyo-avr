/** Timing constants */
/** Default delay for state query intervals (ms) */
export const QUERY_DEFAULT_DELAY = 250;
/** Default timeout for TCP connection attempts (ms) */
export const CONNECTION_TIMEOUT = 3000;
/** Delay before re-querying AV info after transient format (ms) */
export const AV_INFO_REQUERY_DELAY = 4000;
/** Default timeout for waitForConnect (ms) */
export const WAIT_FOR_CONNECT_TIMEOUT = 5000;

/** Network services that support album art */
export const ALBUM_ART = ["tunein", "spotify", "deezer", "tidal", "amazonmusic", "dts-play-fi"];

/** Network services that support media browsing */
export const MEDIA_BROWSING = ["tunein", "tidal", "deezer", "music-server"];

/** Network services that support song metadata */
export const SONG_INFO = ["tunein", "spotify", "deezer", "tidal", "amazonmusic", "dts-play-fi", "airplay"];

/**
 * Canonical display names for the network services this integration understands, keyed by the
 * lowercase service id used internally (see `getCanonicalServiceName`).
 *
 * These are deliberately NOT the names the AVR reports in `netservicelist`: the AVR calls TuneIn
 * "TuneIn Radio" and Amazon Music "Amazon Music", but the integration's service ids are "tunein" and
 * "amazonmusic". The AVR names are available via `listNetServiceNames` for capability checks, while
 * this list stays the display vocabulary.
 */
export const NETWORK_SERVICES = ["TuneIn", "Spotify", "Deezer", "Tidal", "AmazonMusic", "Chromecast built-in", "DTS Play-Fi", "AirPlay", "Alexa", "Music Server", "USB", "Play Queue"];

/** Network services that don't provide title metadata */
export const NO_TITLE = ["TuneIn"];
