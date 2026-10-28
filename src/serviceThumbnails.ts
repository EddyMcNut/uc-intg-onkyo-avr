import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import log from "./loggers.js";

export type ThumbnailCacheState = {
  thumbnailByTitle: Map<string, string>;
  backgroundSignature: string;
};

type BackgroundAsset = {
  dataUri: string | null;
  signature: string;
  inlineSafe: boolean;
  logoMarkup: string | null;
};

export type ServiceThumbnailConfig = {
  svgFileName: string;
  logoTransform: string;
  logoPathAttrs: string;
  backgroundColor: string;
  fallbackLabel: string;
  fallbackLabelColor: string;
  fallbackBgOpacity: string;
  textColor: string;
  fallbackIcon: string;
  logName: string;
  maxThumbnailLength?: number;
};

const MAX_INLINE_BACKGROUND_DATA_LENGTH = 0;

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function polygonPointsToPath(points: string): string {
  const coords = points
    .trim()
    .split(/[\s,]+/)
    .map((n) => parseFloat(n))
    .filter((n) => !Number.isNaN(n));
  if (coords.length < 4 || coords.length % 2 !== 0) {
    return "";
  }
  let path = "M";
  for (let i = 0; i < coords.length; i += 2) {
    path += `${coords[i]} ${coords[i + 1]} `;
    if (i + 2 < coords.length) {
      path += "L";
    }
  }
  path += "Z";
  return path;
}

function wrapTitle(title: string, maxCharsPerLine = 16, maxLines = 3): string[] {
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
    if (index === arr.length - 1 && words.join(" ").length > arr.join(" ").length) {
      return line.length > maxCharsPerLine - 1 ? `${line.slice(0, maxCharsPerLine - 1)}…` : `${line}…`;
    }
    return line;
  });
}

function svgToDataUri(svg: string): string {
  const compact = svg
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .replace(/"/g, "'")
    .trim();

  return `data:image/svg+xml;utf8,${compact}`.replace(/%/g, "%25").replace(/#/g, "%23").replace(/\n/g, "");
}

export type TunerArtworkOptions = {
  textColor?: string;
  maxLength?: number;
  fallbackIcon?: string;
};

const TUNER_ICON_COLOR = "#1a6fd1";
const TUNER_ICON_PATH =
  "M495 401Q515 409 511 431Q503 451 481 447L52 321Q38 317 27 308Q1 289 0 256V252V144V0Q1 -27 19 -45Q37 -63 64 -64H448Q475 -63 493 -45Q511 -27 512 0V256Q511 283 493 301Q475 319 448 320H219L495 401ZM368 208Q413 207 437 168Q459 128 437 88Q413 49 368 48Q323 49 299 88Q277 128 299 168Q323 207 368 208ZM80 192Q81 207 96 208H192Q207 207 208 192Q207 177 192 176H96Q81 177 80 192ZM64 128Q65 143 80 144H208Q223 143 224 128Q223 113 208 112H80Q65 113 64 128ZM80 64Q81 79 96 80H192Q207 79 208 64Q207 49 192 48H96Q81 49 80 64Z";

export function createTunerArtwork(options: TunerArtworkOptions = {}): string {
  const textColor = options.textColor ?? TUNER_ICON_COLOR;
  const maxLength = options.maxLength ?? 4000;
  const fallbackIcon = options.fallbackIcon ?? "";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">` +
    `<g transform="translate(169 30) scale(0.59) translate(0 64) scale(1 -1) translate(0 -383.67)"><path fill="${textColor}" d="${TUNER_ICON_PATH}"/></g>` +
    `</svg>`;

  const uri = svgToDataUri(svg);
  return uri.length <= maxLength ? uri : fallbackIcon;
}

export function createServiceThumbnails(config: ServiceThumbnailConfig) {
  const maxLength = config.maxThumbnailLength ?? 4000;
  const logSource = `${config.logName.toLowerCase()}Thumbnails:`;

  let cachedAsset: BackgroundAsset | null = null;

  function loadAsset(): BackgroundAsset {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidatePaths = [
      path.resolve(currentDir, `logos/${config.svgFileName}`),
      path.resolve(currentDir, `../logos/${config.svgFileName}`),
      path.resolve(currentDir, `../../logos/${config.svgFileName}`),
      path.resolve(process.cwd(), `logos/${config.svgFileName}`)
    ];

    for (const candidate of candidatePaths) {
      try {
        if (fs.existsSync(candidate)) {
          const stat = fs.statSync(candidate);
          const signature = `${candidate}:${stat.mtimeMs}:${stat.size}`;

          if (cachedAsset?.signature === signature) {
            return cachedAsset;
          }

          const fileContents = fs.readFileSync(candidate);
          const extension = path.extname(candidate).toLowerCase();
          const mimeType = extension === ".svg" ? "image/svg+xml" : "image/png";
          const base64 = fileContents.toString("base64");
          const dataUri = `data:${mimeType};base64,${base64}`;
          const svgContent = extension === ".svg" ? fileContents.toString("utf8") : "";
          const pathMatches = [...svgContent.matchAll(/<(path|polygon)[^>]*(?:d|points)=(['"])([\s\S]*?)\2[^>]*>/gi)];
          let logoMarkup = null;
          if (pathMatches.length > 0) {
            const logoPaths = pathMatches
              .map((match) => {
                const tag = match[1].toLowerCase();
                const rawData = match[3] || "";
                const d = tag === "polygon" ? polygonPointsToPath(rawData) : rawData;
                if (!d) return "";
                return `<path ${config.logoPathAttrs} d="${escapeXml(d)}"/>`;
              })
              .filter(Boolean)
              .join("");

            if (logoPaths) {
              logoMarkup = `<g transform="${config.logoTransform}">${logoPaths}</g>`;
            }
          }

          cachedAsset = { dataUri, signature, inlineSafe: dataUri.length <= MAX_INLINE_BACKGROUND_DATA_LENGTH, logoMarkup };
          return cachedAsset;
        }
      } catch (err) {
        log.warn("%s failed to load background asset %s: %s", logSource, candidate, err);
      }
    }

    if (cachedAsset?.signature !== "missing") {
      log.warn("%s background asset not found; falling back to default icon", logSource);
    }

    cachedAsset = { dataUri: null, signature: "missing", inlineSafe: false, logoMarkup: null };
    return cachedAsset;
  }

  function buildBackgroundMarkup(asset: BackgroundAsset): string {
    const markup = [`<rect width="640" height="360" fill="${config.backgroundColor}"/>`];

    if (asset.logoMarkup) {
      markup.push(asset.logoMarkup);
    } else {
      markup.push(`<rect x="205" y="276" width="230" height="42" rx="14" fill="#ffffff" fill-opacity="${config.fallbackBgOpacity}"/>`);
      markup.push(
        `<text x="320" y="304" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700" letter-spacing=".5" fill="${config.fallbackLabelColor}">${config.fallbackLabel}</text>`
      );
    }

    return markup.join("");
  }

  function finalize(svg: string): string {
    const uri = svgToDataUri(svg);
    return uri.length <= maxLength ? uri : config.fallbackIcon;
  }

  function createBackdrop(): string {
    const asset = loadAsset();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">${buildBackgroundMarkup(asset)}</svg>`;
    return finalize(svg);
  }

  function getOrCreateThumbnail(state: ThumbnailCacheState, title: string): string {
    const asset = loadAsset();

    if (state.backgroundSignature !== asset.signature) {
      state.thumbnailByTitle.clear();
      state.backgroundSignature = asset.signature;
    }

    const existing = state.thumbnailByTitle.get(title);
    if (existing) {
      return existing;
    }

    const lines = wrapTitle(title, 14, 4);
    const fontSize = lines.length >= 4 ? 26 : lines.length === 3 ? 32 : lines.length === 2 ? 40 : 48;
    const lineHeight = fontSize + 8;
    const startY = 34 + (156 - lineHeight * lines.length) / 2 + fontSize;
    const text = lines.map((line, index) => `<text x="320" y="${startY + index * lineHeight}">${escapeXml(line)}</text>`).join("");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">${buildBackgroundMarkup(asset)}<g fill="${config.textColor}" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle">${text}</g></svg>`;
    const generated = finalize(svg);
    state.thumbnailByTitle.set(title, generated);
    return generated;
  }

  return { createBackdrop, getOrCreateThumbnail };
}
