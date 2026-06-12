import * as uc from "@unfoldedcircle/integration-api";
import log from "./loggers.js";
import { looksLikeTuneInDirectory, normalizeTuneInLabel, extractTuneInStationKey, parseTuneInXmlItems } from "./tuneInFilters.js";
import { addTuneInPreset, getTuneInBrowseState, listTuneInPresets, type TuneInPreset, setTuneInBrowseContextState } from "./tuneInBrowserStore.js";
import { addTuneInMenuOption, listTuneInMenuOptions, getTuneInMenuBrowseState, type TuneInMenuOption } from "./tuneInMenuStore.js";
import { addTidalMenuOption, listTidalMenuOptions, getTidalBrowseState, type TidalMenuOption } from "./tidalBrowserStore.js";
import { createServiceThumbnails } from "./serviceThumbnails.js";

const { createBackdrop: createTuneInBackdrop, getOrCreateThumbnail: getOrCreateTuneInThumbnail } = createServiceThumbnails({
  svgFileName: "tunein.svg",
  logoTransform: "translate(202 228) scale(.38)",
  logoPathAttrs: 'fill="#17245f" fill-rule="evenodd" clip-rule="evenodd"',
  backgroundColor: "rgb(20,216,204)",
  fallbackLabel: "tunein",
  fallbackLabelColor: "#17245f",
  fallbackBgOpacity: ".22",
  textColor: "#17245f",
  fallbackIcon: "icon://uc:radio",
  logName: "TuneIn"
});

const { createBackdrop: createTidalBackdrop, getOrCreateThumbnail: getOrCreateTidalThumbnail } = createServiceThumbnails({
  svgFileName: "tidal.svg",
  logoTransform: "translate(245 248) scale(.103275)",
  logoPathAttrs: 'fill="#ffffff"',
  backgroundColor: "#000000",
  fallbackLabel: "TIDAL",
  fallbackLabelColor: "#00fecc",
  fallbackBgOpacity: ".15",
  textColor: "#00fecc",
  fallbackIcon: "icon://uc:music",
  logName: "Tidal"
});

const { createBackdrop: createTuneInMainMenuBackdrop } = createServiceThumbnails({
  svgFileName: "menu.svg",
  logoTransform: "translate(180 40) scale(5)",
  logoPathAttrs: 'fill="#17245f"',
  backgroundColor: "rgb(20,216,204)",
  fallbackLabel: "menu",
  fallbackLabelColor: "#17245f",
  fallbackBgOpacity: ".22",
  textColor: "#17245f",
  fallbackIcon: "icon://uc:radio",
  logName: "TuneInMainMenu"
});

const { createBackdrop: createTidalMainMenuBackdrop } = createServiceThumbnails({
  svgFileName: "menu.svg",
  logoTransform: "translate(180 40) scale(5)",
  logoPathAttrs: 'fill="#00fecc"',
  backgroundColor: "#000000",
  fallbackLabel: "MENU",
  fallbackLabelColor: "#00fecc",
  fallbackBgOpacity: ".15",
  textColor: "#00fecc",
  fallbackIcon: "icon://uc:music",
  logName: "TidalMainMenu"
});

const { createBackdrop: createTuneInBackBackdrop } = createServiceThumbnails({
  svgFileName: "back.svg",
  logoTransform: "translate(140 1) scale(0.7)",
  logoPathAttrs: 'fill="#17245f"',
  backgroundColor: "rgb(20,216,204)",
  fallbackLabel: "back",
  fallbackLabelColor: "#17245f",
  fallbackBgOpacity: ".22",
  textColor: "#17245f",
  fallbackIcon: "icon://uc:radio",
  logName: "TuneInMenuBack"
});

const { createBackdrop: createTidalBackBackdrop } = createServiceThumbnails({
  svgFileName: "back.svg",
  logoTransform: "translate(140 1) scale(0.7)",
  logoPathAttrs: 'fill="#00fecc"',
  backgroundColor: "#000000",
  fallbackLabel: "BACK",
  fallbackLabelColor: "#00fecc",
  fallbackBgOpacity: ".15",
  textColor: "#00fecc",
  fallbackIcon: "icon://uc:music",
  logName: "TidalMenuBack"
});

const integrationName = "mediaBrowserServices:";
const NOW_PLAYING_LABEL = "▶ Now Playing";

function parseIndexedMenuEntry(entry: string): { menuIndex: number; rawTitle: string } | undefined {
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

function getXmlOffset(xmlPayload: string): number {
  const offsetMatch = xmlPayload.match(/<items\b[^>]*\boffset="(\d+)"/i);
  return offsetMatch ? parseInt(offsetMatch[1], 10) : 0;
}

function slicePagedItems<T>(items: T[], paging: uc.Paging): T[] {
  return items.slice(paging.offset, paging.offset + paging.limit);
}

function isMediaRequest(mediaId: string | undefined, mediaType: string | undefined, expectedId: string, expectedType: string): boolean {
  if (!mediaId) {
    return false;
  }

  if (mediaType !== undefined && mediaType !== expectedType) {
    return false;
  }

  return mediaId === expectedId;
}

export const TUNEIN_ROOT_ID = "tunein:root";
export const TUNEIN_ROOT_TYPE = "tunein://presets";
export const TUNEIN_MENU_ROOT_ID = "tunein:menu-root";
export const TUNEIN_MENU_ROOT_TYPE = "tunein://menu";
export const TIDAL_ROOT_ID = "tidal:root";
export const TIDAL_ROOT_TYPE = "tidal://menu";
export const TIDAL_MENU_ROOT_ID = "tidal:main-menu";
export const TIDAL_BACK_ID = "tidal:menu-back";
export const TUNEIN_MENU_BACK_ID = "tunein:menu-back";

const BASE_EXCLUDED_MENU_TITLES = new Set(["search", "login", "logout", "all stations"]);
const TUNEIN_EXCLUDED_MENU_TITLES = BASE_EXCLUDED_MENU_TITLES;
const TIDAL_EXCLUDED_MENU_TITLES = BASE_EXCLUDED_MENU_TITLES;

export function setTuneInBrowseContext(entityId: string, title: string): void {
  setTuneInBrowseContextState(entityId, title);
}

export function ingestTuneInListEntry(entityId: string, entry: string): void {
  const state = getTuneInBrowseState(entityId);
  if (!state) {
    return;
  }

  const parsed = parseIndexedMenuEntry(entry);
  if (!parsed) {
    return;
  }

  const rawTitle = parsed.rawTitle;
  const title = normalizeTuneInLabel(rawTitle);
  if (!title || looksLikeTuneInDirectory(title)) {
    return;
  }

  if (!state.captureMyPresets && state.contextTitle !== "my presets") {
    return;
  }

  addTuneInPreset(entityId, title, extractTuneInStationKey(rawTitle), rawTitle, getOrCreateTuneInThumbnail);
}

export function ingestTuneInMenuListEntry(entityId: string, entry: string): void {
  const parsed = parseIndexedMenuEntry(entry);
  if (!parsed) {
    return;
  }

  const rawTitle = parsed.rawTitle;
  const title = normalizeTuneInLabel(rawTitle);
  if (!title || TUNEIN_EXCLUDED_MENU_TITLES.has(title.toLowerCase())) {
    return;
  }

  const cursorOffset = getTuneInMenuBrowseState(entityId)?.nlsCursorOffset ?? 0;
  const windowStart = Math.max(0, cursorOffset - 9);
  const absoluteMenuIndex = windowStart + parsed.menuIndex + 1;

  const isStationLike = title.includes("|") || /\(.+\)/.test(title);
  const isBrowsable = looksLikeTuneInDirectory(title) || !isStationLike;
  addTuneInMenuOption(entityId, absoluteMenuIndex, title, isBrowsable, getOrCreateTuneInThumbnail);
}

export function ingestTuneInMenuXmlEntries(entityId: string, xmlPayload: string): void {
  if (!xmlPayload) {
    return;
  }

  const xmlOffset = getXmlOffset(xmlPayload);
  const xmlItems = parseTuneInXmlItems(xmlPayload);
  for (let i = 0; i < xmlItems.length; i++) {
    const item = xmlItems[i];
    if (!item.title || TUNEIN_EXCLUDED_MENU_TITLES.has(item.title.toLowerCase())) continue;

    const menuIndex = xmlOffset + i + 1;
    const isStationLike = item.title.includes("|") || /\(.+\)/.test(item.title);
    const isBrowsable = looksLikeTuneInDirectory(item.title, item.iconId) || !isStationLike;
    addTuneInMenuOption(entityId, menuIndex, item.title, isBrowsable, getOrCreateTuneInThumbnail);
  }
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

    addTuneInPreset(entityId, item.title, item.stationKey, item.rawLabel, getOrCreateTuneInThumbnail);
  }
}

export function ingestTidalXmlEntries(entityId: string, xmlPayload: string): void {
  if (!xmlPayload) return;
  const xmlOffset = getXmlOffset(xmlPayload);
  const xmlItems = parseTuneInXmlItems(xmlPayload);
  for (let i = 0; i < xmlItems.length; i++) {
    const item = xmlItems[i];
    if (!item.title) continue;
    if (TIDAL_EXCLUDED_MENU_TITLES.has(item.title.toLowerCase())) continue;
    const menuIndex = xmlOffset + i + 1;
    addTidalMenuOption(entityId, menuIndex, item.title, getOrCreateTidalThumbnail);
  }
}

export function ingestTidalListEntry(entityId: string, entry: string): void {
  const parsed = parseIndexedMenuEntry(entry);
  if (!parsed) {
    return;
  }

  const title = parsed.rawTitle.trim();
  if (!title) {
    return;
  }

  if (TIDAL_EXCLUDED_MENU_TITLES.has(title.toLowerCase())) {
    return;
  }

  const cursorOffset = getTidalBrowseState(entityId)?.nlsCursorOffset ?? 0;
  const windowStart = Math.max(0, cursorOffset - 9);
  const absoluteMenuIndex = windowStart + parsed.menuIndex + 1;
  addTidalMenuOption(entityId, absoluteMenuIndex, title, getOrCreateTidalThumbnail);
}

export function getTuneInPresetCount(entityId: string): number {
  return listTuneInPresets(entityId).length;
}

export function hasTuneInPresets(entityId: string): boolean {
  return listTuneInPresets(entityId).length > 0;
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
    stationKey: `Preset ${presetIndex}`,
    rawLabel: `Preset ${presetIndex}`,
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
  return isMediaRequest(mediaId, mediaType, TIDAL_MENU_ROOT_ID, TIDAL_ROOT_TYPE);
}

function createTuneInPresetItem(preset: TuneInPreset, nowPlayingStation: string): uc.BrowseMediaItem {
  const lower = nowPlayingStation.toLowerCase();
  const isNowPlaying = lower.length > 0 && (preset.rawLabel.toLowerCase() === lower || preset.stationKey.toLowerCase() === lower || preset.title.toLowerCase() === lower);

  return new uc.BrowseMediaItem(preset.mediaId, preset.title, {
    can_play: true,
    media_class: uc.KnownMediaClass.Radio,
    media_type: uc.KnownMediaContentType.Radio,
    thumbnail: preset.thumbnail || "icon://uc:radio",
    subtitle: isNowPlaying ? NOW_PLAYING_LABEL : undefined
  });
}

function createTidalMenuItem(option: TidalMenuOption, nowPlayingTitle: string): uc.BrowseMediaItem {
  const isNowPlaying = !option.isBrowsable && nowPlayingTitle.length > 0 && option.title.toLowerCase() === nowPlayingTitle.toLowerCase();

  return new uc.BrowseMediaItem(option.mediaId, option.title, {
    can_browse: option.isBrowsable,
    can_play: !option.isBrowsable,
    media_class: option.isBrowsable ? uc.KnownMediaClass.Directory : uc.KnownMediaClass.Track,
    media_type: TIDAL_ROOT_TYPE,
    thumbnail: option.thumbnail || "icon://uc:music",
    subtitle: isNowPlaying ? NOW_PLAYING_LABEL : undefined
  });
}

function createTidalMainMenuItem(_entityId: string): uc.BrowseMediaItem {
  return new uc.BrowseMediaItem(TIDAL_MENU_ROOT_ID, "Tidal Main Menu", {
    can_browse: true,
    media_class: uc.KnownMediaClass.Directory,
    media_type: TIDAL_ROOT_TYPE,
    thumbnail: createTidalMainMenuBackdrop()
  });
}

function createTidalBackItem(): uc.BrowseMediaItem {
  return new uc.BrowseMediaItem(TIDAL_BACK_ID, "Back", {
    can_browse: true,
    media_class: uc.KnownMediaClass.Directory,
    media_type: TIDAL_ROOT_TYPE,
    thumbnail: createTidalBackBackdrop()
  });
}

function createTuneInBackItem(): uc.BrowseMediaItem {
  return new uc.BrowseMediaItem(TUNEIN_MENU_BACK_ID, "Back", {
    can_browse: true,
    media_class: uc.KnownMediaClass.Directory,
    media_type: TUNEIN_MENU_ROOT_TYPE,
    thumbnail: createTuneInBackBackdrop()
  });
}

function getTuneInRootItemCount(presetCount: number): number {
  return presetCount;
}

function createRootItem(entityId: string, paging: uc.Paging): uc.BrowseMediaItem {
  const presets = listTuneInPresets(entityId);
  const nowPlayingStation = getTuneInBrowseState(entityId)?.nowPlayingStation ?? "";
  const items = slicePagedItems(presets.map((preset) => createTuneInPresetItem(preset, nowPlayingStation)), paging);

  return new uc.BrowseMediaItem(TUNEIN_ROOT_ID, "TuneIn", {
    can_browse: true,
    media_class: uc.KnownMediaClass.Directory,
    media_type: TUNEIN_ROOT_TYPE,
    thumbnail: createTuneInBackdrop(),
    items
  });
}

function createTidalRootItem(entityId: string, paging: uc.Paging): uc.BrowseMediaItem {
  const options = listTidalMenuOptions(entityId);
  const nowPlayingTitle = getTidalBrowseState(entityId)?.nowPlayingTitle ?? "";
  const rootItems =
    (getTidalBrowseState(entityId)?.showMainMenuShortcut ?? false)
      ? [createTidalMainMenuItem(entityId), createTidalBackItem(), ...options.map((option) => createTidalMenuItem(option, nowPlayingTitle))]
      : options.map((option) => createTidalMenuItem(option, nowPlayingTitle));
  const items = slicePagedItems(rootItems, paging);

  return new uc.BrowseMediaItem(TIDAL_ROOT_ID, "Tidal", {
    can_browse: true,
    media_class: uc.KnownMediaClass.Directory,
    media_type: TIDAL_ROOT_TYPE,
    thumbnail: createTidalBackdrop(),
    items
  });
}

export async function browseTuneInMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
  const tuneInPresets = listTuneInPresets(entityId);
  if (!options.media_id || options.media_id === TUNEIN_ROOT_ID) {
    log.info("%s [%s] browsable TuneIn presets: %d", integrationName, entityId, tuneInPresets.length);
    return uc.BrowseResult.fromPaging(createRootItem(entityId, options.paging), options.paging, getTuneInRootItemCount(tuneInPresets.length));
  }

  const preset = resolveTuneInPreset(options.media_id, options.media_type);
  if (!preset) {
    return uc.StatusCodes.NotFound;
  }

  return new uc.BrowseResult(createTuneInPresetItem(preset, ""), uc.Pagination.fromPaging(options.paging));
}

function getTuneInMenuRootItemCount(menuCount: number, showMainMenuShortcut: boolean): number {
  return menuCount + (showMainMenuShortcut ? 2 : 0);
}

function createTuneInMenuItem(option: TuneInMenuOption, nowPlayingStation: string): uc.BrowseMediaItem {
  const lower = nowPlayingStation.toLowerCase();
  const isNowPlaying = lower.length > 0 && option.title.toLowerCase() === lower;

  return new uc.BrowseMediaItem(option.mediaId, option.title, {
    can_browse: option.isBrowsable,
    can_play: !option.isBrowsable,
    media_class: option.isBrowsable ? uc.KnownMediaClass.Directory : uc.KnownMediaClass.Radio,
    media_type: TUNEIN_MENU_ROOT_TYPE,
    thumbnail: option.thumbnail || createTuneInBackdrop(),
    subtitle: isNowPlaying ? NOW_PLAYING_LABEL : undefined
  });
}

function createTuneInMenuRootItem(entityId: string, paging: uc.Paging): uc.BrowseMediaItem {
  const options = listTuneInMenuOptions(entityId);
  const nowPlayingTitle = getTuneInMenuBrowseState(entityId)?.nowPlayingTitle ?? "";
  const showMainMenuShortcut = getTuneInMenuBrowseState(entityId)?.showMainMenuShortcut ?? false;
  const rootItems = showMainMenuShortcut
    ? [
        new uc.BrowseMediaItem(TUNEIN_MENU_ROOT_ID, "TuneIn Main Menu", {
          can_browse: true,
          media_class: uc.KnownMediaClass.Directory,
          media_type: TUNEIN_MENU_ROOT_TYPE,
          thumbnail: createTuneInMainMenuBackdrop()
        }),
        createTuneInBackItem(),
        ...options.map((option) => createTuneInMenuItem(option, nowPlayingTitle))
      ]
    : options.map((option) => createTuneInMenuItem(option, nowPlayingTitle));

  const items = slicePagedItems(rootItems, paging);

  return new uc.BrowseMediaItem(TUNEIN_MENU_ROOT_ID, "TuneIn", {
    can_browse: true,
    media_class: uc.KnownMediaClass.Directory,
    media_type: TUNEIN_MENU_ROOT_TYPE,
    thumbnail: createTuneInBackdrop(),
    items
  });
}

export async function browseTuneInMenuMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
  const menuOptions = listTuneInMenuOptions(entityId);
  const showMainMenuShortcut = getTuneInMenuBrowseState(entityId)?.showMainMenuShortcut ?? false;
  const totalCount = getTuneInMenuRootItemCount(menuOptions.length, showMainMenuShortcut);
  log.info("%s [%s] browsable TuneIn full menu options: %d", integrationName, entityId, menuOptions.length);
  return uc.BrowseResult.fromPaging(createTuneInMenuRootItem(entityId, options.paging), options.paging, totalCount);
}

export function isTuneInMenuRootRequest(mediaId?: string, mediaType?: string): boolean {
  return isMediaRequest(mediaId, mediaType, TUNEIN_MENU_ROOT_ID, TUNEIN_MENU_ROOT_TYPE);
}

export function resolveTuneInMenuOption(entityId: string, mediaId?: string, mediaType?: string): TuneInMenuOption | undefined {
  if (!mediaId) return undefined;
  if (mediaType !== TUNEIN_MENU_ROOT_TYPE) return undefined;

  const match = mediaId.match(/^tunein:menu:(\d+):(.+)$/);
  if (!match) return undefined;

  const menuIndex = parseInt(match[1], 10);
  if (isNaN(menuIndex) || menuIndex < 1) return undefined;

  const title = decodeURIComponent(match[2]);
  const option = listTuneInMenuOptions(entityId).find((item) => item.menuIndex === menuIndex);
  return {
    menuIndex,
    title,
    mediaId,
    isBrowsable: option?.isBrowsable ?? looksLikeTuneInDirectory(title)
  };
}

export function isTidalBackRequest(mediaId?: string, mediaType?: string): boolean {
  return isMediaRequest(mediaId, mediaType, TIDAL_BACK_ID, TIDAL_ROOT_TYPE);
}

export function isTuneInBackRequest(mediaId?: string, mediaType?: string): boolean {
  return isMediaRequest(mediaId, mediaType, TUNEIN_MENU_BACK_ID, TUNEIN_MENU_ROOT_TYPE);
}

export async function browseTidalMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
  const tidalMenuOptions = listTidalMenuOptions(entityId);
  const totalCount = tidalMenuOptions.length + ((getTidalBrowseState(entityId)?.showMainMenuShortcut ?? false) ? 2 : 0);
  if (!options.media_id || options.media_id === TIDAL_ROOT_ID || isTidalMainMenuRequest(options.media_id, options.media_type) || isTidalBackRequest(options.media_id, options.media_type)) {
    log.info("%s [%s] browsable Tidal menu options: %d", integrationName, entityId, tidalMenuOptions.length);
    return uc.BrowseResult.fromPaging(createTidalRootItem(entityId, options.paging), options.paging, totalCount);
  }

  const option = resolveTidalMenuOption(options.media_id, options.media_type);
  if (!option) {
    return uc.StatusCodes.NotFound;
  }

  return uc.BrowseResult.fromPaging(createTidalRootItem(entityId, options.paging), options.paging, totalCount);
}
