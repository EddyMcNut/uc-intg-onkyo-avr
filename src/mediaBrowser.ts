import * as uc from "@unfoldedcircle/integration-api";
import { MEDIA_BROWSING } from "./constants.js";
import { avrStateManager } from "./avrState.js";
import log from "./loggers.js";
import { looksLikeTuneInDirectory, normalizeTuneInLabel, parseTuneInXmlItems } from "./tuneInFilters.js";
import { addTuneInPreset, getTuneInBrowseState, listTuneInPresets, type TuneInPreset, setTuneInBrowseContextState } from "./tuneInBrowserStore.js";
import { addTidalMenuOption, listTidalMenuOptions, shouldShowTidalMainMenuShortcut, getTidalNowPlayingTitle, getTidalThumbnailForTitle, getTidalNlsCursorOffset, type TidalMenuOption } from "./tidalBrowserStore.js";
import { createTuneInBackdrop, getOrCreateTuneInThumbnail } from "./tuneInThumbnails.js";
import { createTidalBackdrop, getOrCreateTidalThumbnail } from "./tidalThumbnails.js";

const integrationName = "mediaBrowser:";
const DEFAULT_BROWSE_PAGE_SIZE = 500;
const MAX_BROWSE_PAGE_SIZE = 500;

export const TUNEIN_ROOT_ID = "tunein:root";
export const TUNEIN_ROOT_TYPE = "tunein://presets";
export const TIDAL_ROOT_ID = "tidal:root";
export const TIDAL_ROOT_TYPE = "tidal://menu";
export const TIDAL_MAIN_MENU_ID = "tidal:main-menu";

function getTuneInPresets(entityId: string): TuneInPreset[] {
  return listTuneInPresets(entityId);
}

function getTidalMenuOptions(entityId: string): TidalMenuOption[] {
  return listTidalMenuOptions(entityId);
}

export function setTuneInBrowseContext(entityId: string, title: string): void {
  setTuneInBrowseContextState(entityId, title);
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

  const rawTitle = match[2].trim();
  const title = normalizeTuneInLabel(rawTitle);
  if (!title || looksLikeTuneInDirectory(title)) {
    return;
  }

  if (!state.captureMyPresets && state.contextTitle !== "my presets") {
    return;
  }

  addTuneInPreset(entityId, title, getOrCreateTuneInThumbnail);
}

export function ingestTuneInXmlEntries(entityId: string, xmlPayload: string): void {
  const state = getTuneInBrowseState(entityId);
  if (!state || !xmlPayload) {
    return;
  }

  if (!state.captureMyPresets && state.contextTitle !== "my presets") {
    return;
  }

  for (const item of parseTuneInXmlItems(xmlPayload)) {
    if (!item.title || looksLikeTuneInDirectory(item.title, item.iconId)) {
      continue;
    }

    addTuneInPreset(entityId, item.title, getOrCreateTuneInThumbnail);
  }
}

export function ingestTidalXmlEntries(entityId: string, xmlPayload: string): void {
  if (!xmlPayload) return;
  const existingTitles = new Set(listTidalMenuOptions(entityId).map((o) => o.title));
  let nextIndex = listTidalMenuOptions(entityId).length + 1;
  for (const item of parseTuneInXmlItems(xmlPayload)) {
    if (!item.title || existingTitles.has(item.title)) continue;
    addTidalMenuOption(entityId, nextIndex++, item.title, getOrCreateTidalThumbnail);
    existingTitles.add(item.title);
  }
}

const TIDAL_EXCLUDED_MENU_TITLES = new Set(["search", "logout"]);

export function ingestTidalListEntry(entityId: string, entry: string): void {
  const match = entry.match(/^U(\d+)-(.*)$/);
  if (!match) {
    return;
  }

  const parsedIndex = parseInt(match[1], 10);
  if (isNaN(parsedIndex) || parsedIndex < 0) {
    return;
  }

  const title = match[2].replace(/\s+%s$/i, "").trim();
  if (!title) {
    return;
  }

  if (TIDAL_EXCLUDED_MENU_TITLES.has(title.toLowerCase())) {
    return;
  }

  // NLS display lines (0-9) are window-relative. The NLT `cccc` field is the cursor position (0-based),
  // NOT the window start. Window start = max(0, cursor - 9). Absolute 1-based index = windowStart + line + 1.
  const cursorOffset = getTidalNlsCursorOffset(entityId);
  const windowStart = Math.max(0, cursorOffset - 9);
  const absoluteMenuIndex = windowStart + parsedIndex + 1;
  addTidalMenuOption(entityId, absoluteMenuIndex, title, getOrCreateTidalThumbnail);
}

export function getTuneInPresetCount(entityId: string): number {
  return getTuneInPresets(entityId).length;
}

export function hasTuneInPresets(entityId: string): boolean {
  return getTuneInPresetCount(entityId) > 0;
}

export function isMediaBrowsingAvailable(entityId: string, subSource?: string): boolean {
  const source = avrStateManager.getSource(entityId);
  const effectiveSubSource = subSource ?? avrStateManager.getSubSource(entityId);
  return source === "net" && MEDIA_BROWSING.includes(effectiveSubSource);
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
    thumbnail: createTuneInBackdrop()
  };
}

export function resolveTidalMenuOption(mediaId?: string, mediaType?: string): TidalMenuOption | undefined {
  if (!mediaId) {
    return undefined;
  }

  if (mediaType !== undefined && mediaType !== TIDAL_ROOT_TYPE) {
    return undefined;
  }

  const match = mediaId.match(/^tidal:menu:(\d+)(?::(.+))?$/);
  if (!match) {
    return undefined;
  }

  const menuIndex = parseInt(match[1], 10);
  if (isNaN(menuIndex) || menuIndex < 1) {
    return undefined;
  }

  let decodedTitle: string | undefined;
  if (match[2]) {
    try {
      decodedTitle = decodeURIComponent(match[2]);
    } catch {
      decodedTitle = undefined;
    }
  }

  const title = decodedTitle || `Menu ${menuIndex}`;
  return {
    menuIndex,
    title,
    mediaId,
    isBrowsable: !title.includes(" - ")
  };
}

export function isTidalMainMenuRequest(mediaId?: string, mediaType?: string): boolean {
  if (!mediaId) {
    return false;
  }

  if (mediaType !== undefined && mediaType !== TIDAL_ROOT_TYPE) {
    return false;
  }

  return mediaId === TIDAL_MAIN_MENU_ID;
}

function createTuneInPresetItem(preset: TuneInPreset): uc.BrowseMediaItem {
  return new uc.BrowseMediaItem(preset.mediaId, preset.title, {
    can_play: true,
    media_class: uc.KnownMediaClass.Radio,
    media_type: uc.KnownMediaContentType.Radio,
    thumbnail: preset.thumbnail || "icon://uc:radio"
  });
}

function createTidalMenuItem(option: TidalMenuOption, nowPlayingTitle: string): uc.BrowseMediaItem {
  const isNowPlaying =
    !option.isBrowsable &&
    nowPlayingTitle.length > 0 &&
    option.title.toLowerCase() === nowPlayingTitle.toLowerCase();

  return new uc.BrowseMediaItem(option.mediaId, option.title, {
    can_browse: option.isBrowsable,
    can_play: !option.isBrowsable,
    media_class: option.isBrowsable ? uc.KnownMediaClass.Directory : uc.KnownMediaClass.Track,
    media_type: TIDAL_ROOT_TYPE,
    thumbnail: option.thumbnail || "icon://uc:music",
    subtitle: isNowPlaying ? "▶ Now Playing" : undefined
  });
}

function createTidalMainMenuItem(entityId: string): uc.BrowseMediaItem {
  return new uc.BrowseMediaItem(TIDAL_MAIN_MENU_ID, "Main Tidal Menu", {
    can_browse: true,
    media_class: uc.KnownMediaClass.Directory,
    media_type: TIDAL_ROOT_TYPE,
    thumbnail: getTidalThumbnailForTitle(entityId, "Main Tidal Menu", getOrCreateTidalThumbnail) || createTidalBackdrop()
  });
}

function getTuneInRootItemCount(presetCount: number): number {
  return presetCount;
}

function withTuneInPaging(options: uc.BrowseOptions): uc.BrowseOptions {
  return {
    ...options,
    paging: new uc.Paging(options.paging?.page ?? 1, MAX_BROWSE_PAGE_SIZE)
  };
}

function withTidalPaging(options: uc.BrowseOptions): uc.BrowseOptions {
  return {
    ...options,
    paging: new uc.Paging(options.paging?.page ?? 1, MAX_BROWSE_PAGE_SIZE)
  };
}

function createRootItem(entityId: string, paging: uc.Paging): uc.BrowseMediaItem {
  const presets = getTuneInPresets(entityId);
  const items = presets.map((preset) => createTuneInPresetItem(preset)).slice(paging.offset, paging.offset + paging.limit);

  return new uc.BrowseMediaItem(TUNEIN_ROOT_ID, "TuneIn", {
    can_browse: true,
    media_class: uc.KnownMediaClass.Directory,
    media_type: TUNEIN_ROOT_TYPE,
    thumbnail: createTuneInBackdrop(),
    items
  });
}

function createTidalRootItem(entityId: string, paging: uc.Paging): uc.BrowseMediaItem {
  const options = getTidalMenuOptions(entityId);
  const nowPlayingTitle = getTidalNowPlayingTitle(entityId);
  const rootItems = shouldShowTidalMainMenuShortcut(entityId)
    ? [createTidalMainMenuItem(entityId), ...options.map((option) => createTidalMenuItem(option, nowPlayingTitle))]
    : options.map((option) => createTidalMenuItem(option, nowPlayingTitle));
  const items = rootItems.slice(paging.offset, paging.offset + paging.limit);

  return new uc.BrowseMediaItem(TIDAL_ROOT_ID, "Tidal", {
    can_browse: true,
    media_class: uc.KnownMediaClass.Directory,
    media_type: TIDAL_ROOT_TYPE,
    thumbnail: createTidalBackdrop(),
    items
  });
}

export async function browseMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
  const subSource = avrStateManager.getSubSource(entityId);
  if (isMediaBrowsingAvailable(entityId, subSource)) {
    switch (subSource) {
      case "tunein":
        return await browseTuneInMedia(entityId, withTuneInPaging(options));
      case "tidal":
        return await browseTidalMedia(entityId, withTidalPaging(options));
      default:
        log.debug("%s [%s] unsupported media browsing for subSource [%s]", integrationName, entityId, subSource);
        return uc.StatusCodes.NotFound;
    }
  } else {
    log.debug("%s [%s] ignoring browse request outside browsable context", integrationName, entityId);
    return uc.StatusCodes.NotFound;
  }
}

export async function browseTuneInMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
  const tuneInPresets = getTuneInPresets(entityId);
  if (!options.media_id || options.media_id === TUNEIN_ROOT_ID) {
    log.info(
      "%s [%s] browsable TuneIn presets (%d): %s",
      integrationName,
      entityId,
      tuneInPresets.length,
      tuneInPresets.length > 0 ? tuneInPresets.map((preset) => `${preset.presetIndex}:${preset.title}`).join(", ") : "none"
    );
    return uc.BrowseResult.fromPaging(createRootItem(entityId, options.paging), options.paging, getTuneInRootItemCount(tuneInPresets.length));
  }

  const preset = resolveTuneInPreset(options.media_id, options.media_type);
  if (!preset) {
    return uc.StatusCodes.NotFound;
  }

  return new uc.BrowseResult(createTuneInPresetItem(preset), uc.Pagination.fromPaging(options.paging));
}

export async function browseTidalMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
  const tidalMenuOptions = getTidalMenuOptions(entityId);
  const totalCount = tidalMenuOptions.length + (shouldShowTidalMainMenuShortcut(entityId) ? 1 : 0);
  if (!options.media_id || options.media_id === TIDAL_ROOT_ID) {
    log.info(
      "%s [%s] browsable Tidal menu options (%d): %s",
      integrationName,
      entityId,
      tidalMenuOptions.length,
      tidalMenuOptions.length > 0 ? tidalMenuOptions.map((option) => `${option.menuIndex}:${option.title}`).join(", ") : "none"
    );
    return uc.BrowseResult.fromPaging(createTidalRootItem(entityId, options.paging), options.paging, totalCount);
  }

  if (isTidalMainMenuRequest(options.media_id, options.media_type)) {
    return uc.BrowseResult.fromPaging(createTidalRootItem(entityId, options.paging), options.paging, totalCount);
  }

  const option = resolveTidalMenuOption(options.media_id, options.media_type);
  if (!option) {
    return uc.StatusCodes.NotFound;
  }

  // Tidal AVR navigation exposes each list entry as an action that replaces the current list,
  // not as a stable child container with its own retrievable children. When the client reopens
  // browse on a previously selected Tidal item, returning that item directly would render an
  // empty leaf. Instead, always expose the latest known Tidal list as the browsable view.
  return uc.BrowseResult.fromPaging(createTidalRootItem(entityId, options.paging), options.paging, totalCount);
}
