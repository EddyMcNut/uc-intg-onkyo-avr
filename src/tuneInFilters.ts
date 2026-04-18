import { NETWORK_SERVICES } from "./constants.js";

export function normalizeTuneInLabel(label: string): string {
  const pipeIndex = label.indexOf("|");
  if (pipeIndex === -1) {
    return label.trim();
  }
  return label.substring(pipeIndex + 1).trim();
}

export function looksLikeTuneInDirectory(title: string, iconId?: string): boolean {
  const normalized = title.trim().toLowerCase();
  const normalizedIconId = (iconId || "").trim().toUpperCase();
  const knownServiceNames = NETWORK_SERVICES.map((service) => service.toLowerCase());

  if (["29", "2A", "2B", "2C", "38", "3A", "3B", "3C", "3D", "43", "44"].includes(normalizedIconId)) {
    return true;
  }

  if (knownServiceNames.includes(normalized)) {
    return true;
  }

  return [
    "login",
    "search",
    "browse",
    "my presets",
    "my favorites",
    "recent",
    "location",
    "by location",
    "by language",
    "by genre",
    "local radio",
    "genre",
    "music",
    "sports",
    "stations",
    "shows",
    "language",
    "languages",
    "topics",
    "categories",
    "profile",
    "following",
    "podcast",
    "podcasts",
    "talk",
    "news",
    "recommended",
    "trending"
  ].some((prefix) => normalized.startsWith(prefix));
}

export function unescapeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function parseTuneInXmlItems(xmlPayload: string): Array<{ title: string; iconId: string }> {
  const itemMatches = [...xmlPayload.matchAll(/<item\b([^>]*)\/?>/gi)];

  return itemMatches.map((match) => {
    const attributes = match[1] || "";
    const rawTitle = unescapeXml((attributes.match(/\btitle="([^"]*)"/i)?.[1] || "").trim());
    const iconId = (attributes.match(/\biconid="([^"]*)"/i)?.[1] || "").trim();

    return {
      title: normalizeTuneInLabel(rawTitle),
      iconId
    };
  });
}
