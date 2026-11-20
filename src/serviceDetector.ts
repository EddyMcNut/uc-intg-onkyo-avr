// Focused responsibility: Detect service from various input formats
import { NETWORK_SERVICE_DEFINITIONS, findNetworkService } from "./networkServices.js";

// Detects a network service in free text (case-insensitive substring match) and returns its service id.
// Example: "Now Playing: Music Server / Some Track" -> "music-server".
export function detectServiceFromText(text: string): string | undefined {
  const normalizedText = text.toLowerCase();
  return NETWORK_SERVICE_DEFINITIONS.find((service) => normalizedText.includes(service.displayName.toLowerCase()))?.id;
}

// Detects a network service from ASCII front-panel data (prefix match) and returns its display name.
// Used in FLD parsing where the service name is ASCII-prefixed. Example: "Spotify..." -> "Spotify".
export function detectServiceFromAsciiPrefix(ascii: string): string | undefined {
  return NETWORK_SERVICE_DEFINITIONS.find((service) => ascii.startsWith(service.displayName))?.displayName;
}

// Returns the display name for a service id, display name or alias. Example: "music-server" -> "Music Server".
export function getCanonicalServiceName(serviceId: string): string | undefined {
  return findNetworkService(serviceId)?.displayName;
}
