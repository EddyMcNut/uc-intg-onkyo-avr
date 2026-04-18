import fs from "fs";
import path from "path";
import * as uc from "@unfoldedcircle/integration-api";
import { fileURLToPath } from "url";
import { MEDIA_BROWSING } from "./constants.js";
import { avrStateManager } from "./avrState.js";
import { buildPhysicalAvrId } from "./configManager.js";
import log from "./loggers.js";

const integrationName = "mediaBrowser:";
const MAX_TUNEIN_THUMBNAIL_LENGTH = 4000;
const MAX_INLINE_BACKGROUND_DATA_LENGTH = 0;

export const TUNEIN_ROOT_ID = "tunein:root";
export const TUNEIN_ROOT_TYPE = "tunein://presets";

type TuneInPreset = {
  presetIndex: number;
  title: string;
  mediaId: string;
  thumbnail?: string;
};

type TuneInBrowseState = {
  contextTitle: string;
  captureMyPresets: boolean;
  presetsByMenuIndex: Map<number, TuneInPreset>;
  thumbnailByTitle: Map<string, string>;
  backgroundSignature: string;
};

type TuneInBackgroundAsset = {
  dataUri: string | null;
  signature: string;
  inlineSafe: boolean;
  logoMarkup: string | null;
};

const tuneInBrowseStateByPhysicalAvr = new Map<string, TuneInBrowseState>();
let cachedTuneInBackgroundAsset: TuneInBackgroundAsset | null = null;

function loadTuneInBackgroundDataUri(): TuneInBackgroundAsset {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(currentDir, "../logos/tunein.svg"),
    path.resolve(currentDir, "../../logos/tunein.svg"),
    path.resolve(process.cwd(), "logos/tunein.svg"),
    path.resolve(currentDir, "../thumbnails/TuneIn.PNG"),
    path.resolve(currentDir, "../thumbnails/TuneIn.png"),
    path.resolve(currentDir, "../../thumbnails/TuneIn.PNG"),
    path.resolve(currentDir, "../../thumbnails/TuneIn.png"),
    path.resolve(process.cwd(), "thumbnails/TuneIn.PNG"),
    path.resolve(process.cwd(), "thumbnails/TuneIn.png")
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
        const pathMatch = svgContent.match(/<path[^>]*d="([^"]+)"[^>]*>/s);
        const logoMarkup = pathMatch
          ? `<g transform="translate(202 228) scale(.38)"><path fill="#17245f" fill-rule="evenodd" clip-rule="evenodd" d="${pathMatch[1]}"/></g>`
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

  const trimmed = lines.slice(0, maxLines).map((line, index, arr) => {
    if (index === arr.length - 1 && (words.join(" ").length > arr.join(" ").length)) {
      return line.length > maxCharsPerLine - 1 ? `${line.slice(0, maxCharsPerLine - 1)}…` : `${line}…`;
    }
    return line;
  });

  return trimmed;
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

function createTuneInBackdrop(backgroundAsset: TuneInBackgroundAsset): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">${buildTuneInBackgroundMarkup(backgroundAsset)}</svg>`;
  return finalizeTuneInThumbnail(svg);
}

function createTuneInThumbnail(title: string, backgroundAsset: TuneInBackgroundAsset): string {
  const lines = wrapStationTitle(title, 16, 4);
  const fontSize = lines.length >= 4 ? 28 : lines.length === 3 ? 34 : lines.length === 2 ? 42 : 50;
  const lineHeight = fontSize + 8;
  const startY = 34 + ((156 - lineHeight * lines.length) / 2) + fontSize;
  const text = lines
    .map((line, index) => `<text x="320" y="${startY + index * lineHeight}">${escapeXml(line)}</text>`)
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">${buildTuneInBackgroundMarkup(backgroundAsset)}<g fill="#17245f" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle">${text}</g></svg>`;
  return finalizeTuneInThumbnail(svg);
}

function getOrCreateTuneInThumbnail(state: TuneInBrowseState, title: string): string {
  const backgroundAsset = loadTuneInBackgroundDataUri();

  if (state.backgroundSignature !== backgroundAsset.signature) {
    state.thumbnailByTitle.clear();
    state.backgroundSignature = backgroundAsset.signature;
  }

  const existing = state.thumbnailByTitle.get(title);
  if (existing) {
    return existing;
  }

  const generated = createTuneInThumbnail(title, backgroundAsset);
  state.thumbnailByTitle.set(title, generated);
  return generated;
}

function parseEntityId(entityId: string): { model: string; host: string } | null {
  const parts = entityId.trim().split(/\s+/);
  if (parts.length < 3) {
    return null;
  }

  const host = parts[parts.length - 2];
  const model = parts.slice(0, -2).join(" ");
  if (!host || !model) {
    return null;
  }

  return { model, host };
}

function getPhysicalAvrId(entityId: string): string | null {
  const parsed = parseEntityId(entityId);
  if (!parsed) {
    return null;
  }

  return buildPhysicalAvrId(parsed.model, parsed.host);
}

function getTuneInBrowseState(entityId: string): TuneInBrowseState | null {
  const physicalAvrId = getPhysicalAvrId(entityId);
  if (!physicalAvrId) {
    return null;
  }

  const existing = tuneInBrowseStateByPhysicalAvr.get(physicalAvrId);
  if (existing) {
    return existing;
  }

  const created: TuneInBrowseState = {
    contextTitle: "",
    captureMyPresets: false,
    presetsByMenuIndex: new Map<number, TuneInPreset>(),
    thumbnailByTitle: new Map<string, string>(),
    backgroundSignature: ""
  };
  tuneInBrowseStateByPhysicalAvr.set(physicalAvrId, created);
  return created;
}

function normalizeTuneInLabel(label: string): string {
  const pipeIndex = label.indexOf("|");
  if (pipeIndex === -1) {
    return label.trim();
  }
  return label.substring(pipeIndex + 1).trim();
}

function looksLikeTuneInDirectory(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return [
    "search",
    "browse",
    "my presets",
    "my favorites",
    "recent",
    "location",
    "local radio",
    "genre",
    "music",
    "sports",
    "podcast",
    "podcasts",
    "talk",
    "news",
    "recommended",
    "trending"
  ].some((prefix) => normalized.startsWith(prefix));
}

export function setTuneInBrowseContext(entityId: string, title: string): void {
  const state = getTuneInBrowseState(entityId);
  if (!state) {
    return;
  }

  const normalized = title.trim().toLowerCase();
  state.contextTitle = normalized;
  state.captureMyPresets = normalized === "my presets";
}

export function ingestTuneInListEntry(entityId: string, entry: string): void {
  const state = getTuneInBrowseState(entityId);
  if (!state) {
    return;
  }

  const match = entry.match(/^U(\d+)-(.*)$/);
  if (!match) {
    return;
  }

  const menuIndex = parseInt(match[1], 10);
  if (isNaN(menuIndex) || menuIndex < 0) {
    return;
  }

  const presetIndex = menuIndex + 1;
  const rawTitle = match[2].trim();
  const title = normalizeTuneInLabel(rawTitle);
  if (!title) {
    return;
  }

  const shouldInferPresets = !state.contextTitle && !looksLikeTuneInDirectory(title);
  if (!state.captureMyPresets && !shouldInferPresets) {
    return;
  }

  if (menuIndex === 0) {
    state.presetsByMenuIndex.clear();
  }

  if (!state.captureMyPresets && shouldInferPresets) {
    state.captureMyPresets = true;
    log.info("%s [%s] inferring TuneIn preset collection from list entry payload", integrationName, entityId);
  }

  state.presetsByMenuIndex.set(menuIndex, {
    presetIndex,
    title,
    mediaId: `tunein:preset:${presetIndex}`,
    thumbnail: getOrCreateTuneInThumbnail(state, title)
  });
}

function getTuneInPresets(entityId: string): TuneInPreset[] {
  const state = getTuneInBrowseState(entityId);
  if (!state) {
    return [];
  }

  return [...state.presetsByMenuIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, preset]) => preset);
}

export function hasTuneInPresets(entityId: string): boolean {
  return getTuneInPresets(entityId).length > 0;
}

export function isMediaBrowsingAvailable(entityId: string): boolean {
  const source = avrStateManager.getSource(entityId);
  const subSource = avrStateManager.getSubSource(entityId);

  return source === "net" && MEDIA_BROWSING.includes(subSource);
}

export function resolveTuneInPreset(mediaId?: string, mediaType?: string): TuneInPreset | undefined {
  if (!mediaId) {
    return undefined;
  }

  if (mediaType !== undefined && mediaType !== uc.KnownMediaContentType.Radio) {
    return undefined;
  }

  const match = mediaId.match(/^tunein:preset:(\d+)$/);
  if (!match) {
    return undefined;
  }

  const presetIndex = parseInt(match[1], 10);
  if (isNaN(presetIndex) || presetIndex < 1) {
    return undefined;
  }

  return {
    presetIndex,
    title: `Preset ${presetIndex}`,
    mediaId,
    thumbnail: createTuneInBackdrop(loadTuneInBackgroundDataUri())
  };
}

function createTuneInPresetItem(preset: TuneInPreset): uc.BrowseMediaItem {
  return new uc.BrowseMediaItem(preset.mediaId, preset.title, {
    can_play: true,
    media_class: uc.KnownMediaClass.Radio,
    media_type: uc.KnownMediaContentType.Radio,
    thumbnail: preset.thumbnail || "icon://uc:radio"
  });
}

function createRootItem(entityId: string, paging: uc.Paging): uc.BrowseMediaItem {
  const items = getTuneInPresets(entityId)
    .slice(paging.offset, paging.offset + paging.limit)
    .map((preset) => createTuneInPresetItem(preset));

  return new uc.BrowseMediaItem(TUNEIN_ROOT_ID, "TuneIn", {
    can_browse: true,
    media_class: uc.KnownMediaClass.Directory,
    media_type: TUNEIN_ROOT_TYPE,
    thumbnail: createTuneInBackdrop(loadTuneInBackgroundDataUri()),
    items
  });
}

export async function browseTuneInMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
  if (!isMediaBrowsingAvailable(entityId)) {
    return uc.StatusCodes.NotFound;
  }

  const tuneInPresets = getTuneInPresets(entityId);
  if (!options.media_id || options.media_id === TUNEIN_ROOT_ID) {
    log.info(
      "%s [%s] browsable TuneIn presets (%d): %s",
      integrationName,
      entityId,
      tuneInPresets.length,
      tuneInPresets.length > 0
        ? tuneInPresets.map((preset) => `${preset.presetIndex}:${preset.title}`).join(", ")
        : "none"
    );
    return uc.BrowseResult.fromPaging(createRootItem(entityId, options.paging), options.paging, tuneInPresets.length);
  }

  const preset = resolveTuneInPreset(options.media_id, options.media_type);
  if (!preset) {
    return uc.StatusCodes.NotFound;
  }

  return new uc.BrowseResult(createTuneInPresetItem(preset), uc.Pagination.fromPaging(options.paging));
}
