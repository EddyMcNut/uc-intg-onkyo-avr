/** Network services that support album art */
export const ALBUM_ART = ["tunein", "spotify", "deezer", "tidal", "amazonmusic", "dts-play-fi"];

/** Network services that support media browsing */
export const MEDIA_BROWSING = ["tunein"];

/** Network services that support song metadata */
export const SONG_INFO = ["tunein", "spotify", "deezer", "tidal", "amazonmusic", "dts-play-fi", "airplay"];

/** //TODO: lowercase? Known network streaming services - when FLD starts with one of these, emit once and suppress scroll updates */
export const NETWORK_SERVICES = ["TuneIn", "Spotify", "Deezer", "Tidal", "AmazonMusic", "Chromecast built-in", "DTS Play-Fi", "AirPlay", "Alexa", "Music Server", "USB", "Play Queue"];

/** Network services that don't provide title metadata */
export const NO_TITLE = ["TuneIn"];
