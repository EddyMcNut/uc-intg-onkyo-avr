/**
 * Pure functions for eISCP packet encoding and TCP frame extraction.
 * No external dependencies — fully unit-testable in isolation.
 */

/**
 * Wrap a raw ISCP command string in a binary eISCP packet.
 * Prepends "!1" if the message does not already start with "!".
 */
export function createEiscpPacket(data: string): Buffer {
  if (data.charAt(0) !== "!") {
    data = "!1" + data;
  }
  const iscpMsg = Buffer.from(data + "\x0D\x0a");
  const header = Buffer.from([73, 83, 67, 80, 0, 0, 0, 16, 0, 0, 0, 0, 1, 0, 0, 0]);
  header.writeUInt32BE(iscpMsg.length, 8);
  return Buffer.concat([header, iscpMsg]);
}

/**
 * Fallback single-frame extraction.
 * Strips the 18-byte header prefix and the trailing "\r\n".
 */
export function extractIscpMessage(packet: Buffer): string {
  return packet.toString("ascii", 18, packet.length - 2);
}

/**
 * Extract all ISCP messages from a buffer that may contain concatenated eISCP frames.
 * Falls back to single-frame extraction if no valid multi-frame structure is detected.
 */
export function extractAllIscpMessages(packet: Buffer): string[] {
  const messages: string[] = [];
  let offset = 0;

  while (offset + 16 <= packet.length && packet.toString("ascii", offset, offset + 4) === "ISCP") {
    const headerSize = packet.readUInt32BE(offset + 4);
    const dataSize = packet.readUInt32BE(offset + 8);
    const frameEnd = offset + headerSize + dataSize;

    if (headerSize < 16 || dataSize < 4 || frameEnd > packet.length) {
      break;
    }

    messages.push(packet.toString("ascii", offset + headerSize + 2, frameEnd - 2));
    offset = frameEnd;
  }

  return messages.length > 0 ? messages : [extractIscpMessage(packet)];
}
