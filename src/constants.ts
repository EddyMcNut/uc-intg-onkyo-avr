import { listServiceIdsWith } from "./networkServices.js";

// Timing constants
// Default delay for state query intervals (ms)
export const QUERY_DEFAULT_DELAY = 250;
// Default timeout for TCP connection attempts (ms)
export const CONNECTION_TIMEOUT = 3000;
// Delay before re-querying AV info after transient format (ms)
export const AV_INFO_REQUERY_DELAY = 4000;
// Default timeout for waitForConnect (ms)
export const WAIT_FOR_CONNECT_TIMEOUT = 5000;

// Network service lists, derived from the single service table in networkServices.ts.
// Kept for existing consumers; new code should use `hasServiceCapability` / `findNetworkService` directly.

// Service ids that support album art
export const ALBUM_ART = listServiceIdsWith("albumArt");

// Service ids that support media browsing
export const MEDIA_BROWSING = listServiceIdsWith("browse");

// Service ids that support song metadata
export const SONG_INFO = listServiceIdsWith("songInfo");
