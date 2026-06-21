// Focused responsibility: Parse menu entry data from protocol strings and XML
/**
 * Parses indexed menu entry from protocol format: "U{menuIndex}-{rawTitle}%s"
 * Example: "U5-Spotify%s" → { menuIndex: 5, rawTitle: "Spotify" }
 * @param entry - Protocol entry string
 * @returns Parsed entry with menuIndex and rawTitle, or undefined if format is invalid
 */
export function parseIndexedMenuEntry(entry: string): { menuIndex: number; rawTitle: string } | undefined {
  const match = entry.match(/^U(\d+)-(.*)$/);
  if (!match) {
    return undefined;
  }

  const parsedIndex = parseInt(match[1], 10);
  if (isNaN(parsedIndex) || parsedIndex < 0) {
    return undefined;
  }

  return {
    menuIndex: parsedIndex,
    rawTitle: match[2].trim().replace(/\s+%s$/i, "")
  };
}

/**
 * Extracts XML offset attribute from items element.
 * Example: <items offset="20"> → 20
 * @param xmlPayload - XML payload string
 * @returns Offset value (default 0 if not found)
 */
export function getXmlOffset(xmlPayload: string): number {
  const offsetMatch = xmlPayload.match(/<items\b[^>]*\boffset="(\d+)"/i);
  return offsetMatch ? parseInt(offsetMatch[1], 10) : 0;
}

/**
 * Unescapes XML entities in text.
 * @param value - Text with XML entities
 * @returns Unescaped text
 */
export function unescapeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Parses XML item elements from response payload.
 * Extracts title, icon ID, and other attributes from <item> tags.
 * @param xmlPayload - XML payload containing <item> elements
 * @returns Array of parsed items with title, iconId, and raw data
 */
export function parseXmlItems(xmlPayload: string): Array<{ title: string; iconId: string; rawTitle: string }> {
  const itemMatches = [...xmlPayload.matchAll(/<item\b([^>]*)\/?>/gi)];

  return itemMatches.map((match) => {
    const attributes = match[1] || "";
    const rawTitle = unescapeXml((attributes.match(/\btitle="([^"]*)"/i)?.[1] || "").trim());
    const iconId = (attributes.match(/\biconid="([^"]*)"/i)?.[1] || "").trim();

    return {
      title: rawTitle,
      iconId,
      rawTitle
    };
  });
}
