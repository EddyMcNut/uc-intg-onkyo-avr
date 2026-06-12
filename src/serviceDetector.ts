// Focused responsibility: Detect service from various input formats
import { NETWORK_SERVICES } from "./constants.js";

/**
 * Detects network service from text content (case-insensitive substring match).
 * Example: "Now Playing: Spotify / Some Track" → "spotify"
 * @param text - Text to search for service name
 * @returns Lowercase service name (e.g., "spotify", "tidal", "tunein") or undefined
 */
export function detectServiceFromText(text: string): string | undefined {
  const normalizedText = text.toLowerCase();
  const detectedService = NETWORK_SERVICES.find((service) => normalizedText.includes(service.toLowerCase()));
  return detectedService?.toLowerCase();
}

/**
 * Detects network service from ASCII hex-encoded data (prefix match).
 * Used in FLD (front panel display) parsing where service name is ASCII-prefixed.
 * @param ascii - ASCII representation of the data (e.g., "spotify")
 * @returns Service name (e.g., "Spotify") or undefined
 */
export function detectServiceFromAsciiPrefix(ascii: string): string | undefined {
  return NETWORK_SERVICES.find((service) => ascii.startsWith(service));
}

/**
 * Gets canonical service name for a given lowercase service ID.
 * @param lowercaseServiceId - Lowercase service identifier (e.g., "spotify")
 * @returns Canonical service name (e.g., "Spotify") or undefined
 */
export function getCanonicalServiceName(lowercaseServiceId: string): string | undefined {
  return NETWORK_SERVICES.find((service) => service.toLowerCase() === lowercaseServiceId);
}
