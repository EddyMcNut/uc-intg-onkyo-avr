import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import log from "./loggers.js";
import type { TuneInBrowseState } from "./tuneInBrowserStore.js";

const integrationName = "tuneInThumbnails:";
const MAX_TUNEIN_THUMBNAIL_LENGTH = 4000;
const MAX_INLINE_BACKGROUND_DATA_LENGTH = 0;

type TuneInBackgroundAsset = {
  dataUri: string | null;
  signature: string;
  inlineSafe: boolean;
  logoMarkup: string | null;
};

let cachedTuneInBackgroundAsset: TuneInBackgroundAsset | null = null;

function loadTuneInBackgroundDataUri(): TuneInBackgroundAsset {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(currentDir, "logos/tunein.svg"),
    path.resolve(currentDir, "../logos/tunein.svg"),
    path.resolve(currentDir, "../../logos/tunein.svg"),
    path.resolve(process.cwd(), "logos/tunein.svg")
  ];

  for (const candidate of candidatePaths) {
    try {
      if (fs.existsSync(candidate)) {
        const stat = fs.statSync(candidate);
        const signature = `${candidate}:${stat.mtimeMs}:${stat.size}`;

        if (cachedTuneInBackgroundAsset?.signature === signature) {
          return cachedTuneInBackgroundAsset;
        }

        const fileContents = fs.readFileSync(candidate);
        const extension = path.extname(candidate).toLowerCase();
        const mimeType = extension === ".svg" ? "image/svg+xml" : "image/png";
        const base64 = fileContents.toString("base64");
        const dataUri = `data:${mimeType};base64,${base64}`;
        const svgContent = extension === ".svg" ? fileContents.toString("utf8") : "";
        const pathMatch = svgContent.match(/<path[^>]*d=(['"])([\s\S]*?)\1[^>]*>/i);
        const logoMarkup = pathMatch
          ? `<g transform="translate(202 228) scale(.38)"><path fill="#17245f" fill-rule="evenodd" clip-rule="evenodd" d="${pathMatch[2]}"/></g>`
          : null;

        cachedTuneInBackgroundAsset = {
          dataUri,
          signature,
          inlineSafe: dataUri.length <= MAX_INLINE_BACKGROUND_DATA_LENGTH,
          logoMarkup
        };
        return cachedTuneInBackgroundAsset;
      }
    } catch (err) {
      log.warn("%s failed to load TuneIn background asset %s: %s", integrationName, candidate, err);
    }
  }

  if (cachedTuneInBackgroundAsset?.signature !== "missing") {
    log.warn("%s TuneIn background asset not found; falling back to default icon", integrationName);
  }

  cachedTuneInBackgroundAsset = { dataUri: null, signature: "missing", inlineSafe: false, logoMarkup: null };
  return cachedTuneInBackgroundAsset;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapStationTitle(title: string, maxCharsPerLine = 16, maxLines = 3): string[] {
  const words = title.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) {
    return [title.trim()];
  }

  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      lines.push(word.slice(0, maxCharsPerLine));
      currentLine = word.slice(maxCharsPerLine);
    }

    if (lines.length === maxLines) {
      break;
    }
  }

  if (lines.length < maxLines && currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, maxLines).map((line, index, arr) => {
    if (index === arr.length - 1 && (words.join(" ").length > arr.join(" ").length)) {
      return line.length > maxCharsPerLine - 1 ? `${line.slice(0, maxCharsPerLine - 1)}…` : `${line}…`;
    }
    return line;
  });
}

function buildTuneInBackgroundMarkup(backgroundAsset: TuneInBackgroundAsset): string {
  const markup = ['<rect width="640" height="360" fill="rgb(20,216,204)"/>'];

  if (backgroundAsset.logoMarkup) {
    markup.push(backgroundAsset.logoMarkup);
  } else {
    markup.push('<rect x="205" y="276" width="230" height="42" rx="14" fill="#ffffff" fill-opacity=".22"/>');
    markup.push('<text x="320" y="304" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700" letter-spacing=".5" fill="#17245f">tunein</text>');
  }

  return markup.join("");
}

function svgToDataUri(svg: string): string {
  const compact = svg
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .replace(/"/g, "'")
    .trim();

  return `data:image/svg+xml;utf8,${compact}`
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/\n/g, "");
}

function finalizeTuneInThumbnail(svg: string): string {
  const uri = svgToDataUri(svg);
  return uri.length <= MAX_TUNEIN_THUMBNAIL_LENGTH ? uri : "icon://uc:radio";
}

export function createTuneInBackdrop(): string {
  const backgroundAsset = loadTuneInBackgroundDataUri();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">${buildTuneInBackgroundMarkup(backgroundAsset)}</svg>`;
  return finalizeTuneInThumbnail(svg);
}

export function getOrCreateTuneInThumbnail(state: TuneInBrowseState, title: string): string {
  const backgroundAsset = loadTuneInBackgroundDataUri();

  if (state.backgroundSignature !== backgroundAsset.signature) {
    state.thumbnailByTitle.clear();
    state.backgroundSignature = backgroundAsset.signature;
  }

  const existing = state.thumbnailByTitle.get(title);
  if (existing) {
    return existing;
  }

  const lines = wrapStationTitle(title, 14, 4);
  const fontSize = lines.length >= 4 ? 26 : lines.length === 3 ? 32 : lines.length === 2 ? 40 : 48;
  const lineHeight = fontSize + 8;
  const startY = 34 + ((156 - lineHeight * lines.length) / 2) + fontSize;
  const text = lines
    .map((line, index) => `<text x="320" y="${startY + index * lineHeight}">${escapeXml(line)}</text>`)
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">${buildTuneInBackgroundMarkup(backgroundAsset)}<g fill="#17245f" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle">${text}</g></svg>`;
  const generated = finalizeTuneInThumbnail(svg);
  state.thumbnailByTitle.set(title, generated);
  return generated;
}
