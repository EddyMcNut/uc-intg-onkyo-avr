// Focused responsibility: Parse menu entry data from protocol strings and XML
// Parses an indexed menu entry in protocol format "U{menuIndex}-{rawTitle}%s".
// Example: "U5-Spotify%s" -> { menuIndex: 5, rawTitle: "Spotify" }. Returns undefined when the format is invalid.
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

// Extracts the offset attribute of the <items> element. Example: <items offset="20"> -> 20. Returns 0 when absent.
export function getXmlOffset(xmlPayload: string): number {
  const offsetMatch = xmlPayload.match(/<items\b[^>]*\boffset="(\d+)"/i);
  return offsetMatch ? parseInt(offsetMatch[1], 10) : 0;
}

// Unescapes XML entities in text.
export function unescapeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// Parses the <item> elements of an XML response into title, icon id and raw attributes.
export function parseXmlItems(xmlPayload: string): Array<{ title: string; iconId: string; iconType: string; selectable: boolean; rawTitle: string }> {
  const itemMatches = [...xmlPayload.matchAll(/<item\b([^>]*)\/?>/gi)];

  return itemMatches.map((match) => {
    const attributes = match[1] || "";
    const rawTitle = unescapeXml((attributes.match(/\btitle="([^"]*)"/i)?.[1] || "").trim());
    const iconId = (attributes.match(/\biconid="([^"]*)"/i)?.[1] || "").trim();
    const iconType = (attributes.match(/\bicontype="([^"]*)"/i)?.[1] || "").trim().toUpperCase();
    const selectable = (attributes.match(/\bselectable="([^"]*)"/i)?.[1] || "1") !== "0";

    return {
      title: rawTitle,
      iconId,
      iconType,
      selectable,
      rawTitle
    };
  });
}
