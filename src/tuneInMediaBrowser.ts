// Focused responsibility: TuneIn service browsing and ingestion
import * as uc from "@unfoldedcircle/integration-api";
import log from "./loggers.js";
import { looksLikeTuneInDirectory, normalizeTuneInLabel, extractTuneInStationKey, parseTuneInXmlItems } from "./tuneInFilters.js";
import { addTuneInPreset, getTuneInBrowseState, listTuneInPresets, type TuneInPreset, setTuneInBrowseContextState } from "./tuneInBrowserStore.js";
import { addTuneInMenuOption, listTuneInMenuOptions, getTuneInMenuBrowseState, type TuneInMenuOption } from "./tuneInMenuStore.js";
import { createServiceThumbnails } from "./serviceThumbnails.js";
import { parseIndexedMenuEntry, getXmlOffset } from "./menuEntryParser.js";

const integrationName = "tuneInMediaBrowser:";
const NOW_PLAYING_LABEL = "▶ Now Playing";

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

export const TUNEIN_ROOT_ID = "tunein:root";
export const TUNEIN_ROOT_TYPE = "tunein://presets";
export const TUNEIN_MENU_ROOT_ID = "tunein:menu-root";
export const TUNEIN_MENU_ROOT_TYPE = "tunein://menu";
export const TUNEIN_MENU_BACK_ID = "tunein:menu-back";

const TUNEIN_EXCLUDED_MENU_TITLES = new Set(["search", "login", "logout", "log out", "all stations"]);

export class TuneInMediaBrowser {
  setBrowseContext(entityId: string, title: string): void {
    setTuneInBrowseContextState(entityId, title);
  }

  ingestListEntry(entityId: string, entry: string): void {
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

  ingestMenuListEntry(entityId: string, entry: string): void {
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

  ingestMenuXmlEntries(entityId: string, xmlPayload: string): void {
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

  ingestXmlEntries(entityId: string, xmlPayload: string): void {
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

  getPresetCount(entityId: string): number {
    return listTuneInPresets(entityId).length;
  }

  hasPresets(entityId: string): boolean {
    return listTuneInPresets(entityId).length > 0;
  }

  resolvePreset(mediaId?: string, mediaType?: string): TuneInPreset | undefined {
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

  async browse(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    const tuneInPresets = listTuneInPresets(entityId);
    if (!options.media_id || options.media_id === TUNEIN_ROOT_ID) {
      log.info("%s [%s] browsable TuneIn presets: %d", integrationName, entityId, tuneInPresets.length);
      return uc.BrowseResult.fromPaging(this.createRootItem(entityId, options.paging), options.paging, tuneInPresets.length);
    }

    const preset = this.resolvePreset(options.media_id, options.media_type);
    if (!preset) {
      return uc.StatusCodes.NotFound;
    }

    return new uc.BrowseResult(this.createPresetItem(preset, ""), uc.Pagination.fromPaging(options.paging));
  }

  async browseMenu(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    const menuOptions = listTuneInMenuOptions(entityId);
    const showMainMenuShortcut = getTuneInMenuBrowseState(entityId)?.showMainMenuShortcut ?? false;
    const totalCount = menuOptions.length + (showMainMenuShortcut ? 2 : 0);
    log.info("%s [%s] browsable TuneIn full menu options: %d", integrationName, entityId, menuOptions.length);
    return uc.BrowseResult.fromPaging(this.createMenuRootItem(entityId, options.paging), options.paging, totalCount);
  }

  isMenuRootRequest(mediaId?: string, mediaType?: string): boolean {
    return this.isMediaRequest(mediaId, mediaType, TUNEIN_MENU_ROOT_ID, TUNEIN_MENU_ROOT_TYPE);
  }

  isBackRequest(mediaId?: string, mediaType?: string): boolean {
    return this.isMediaRequest(mediaId, mediaType, TUNEIN_MENU_BACK_ID, TUNEIN_MENU_ROOT_TYPE);
  }

  resolveMenuOption(entityId: string, mediaId?: string, mediaType?: string): TuneInMenuOption | undefined {
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

  private createPresetItem(preset: TuneInPreset, nowPlayingStation: string): uc.BrowseMediaItem {
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

  private createMenuItem(option: TuneInMenuOption, nowPlayingStation: string): uc.BrowseMediaItem {
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

  private createRootItem(entityId: string, paging: uc.Paging): uc.BrowseMediaItem {
    const presets = listTuneInPresets(entityId);
    const nowPlayingStation = getTuneInBrowseState(entityId)?.nowPlayingStation ?? "";
    const items = this.slicePagedItems(
      presets.map((preset) => this.createPresetItem(preset, nowPlayingStation)),
      paging
    );

    return new uc.BrowseMediaItem(TUNEIN_ROOT_ID, "TuneIn", {
      can_browse: true,
      media_class: uc.KnownMediaClass.Directory,
      media_type: TUNEIN_ROOT_TYPE,
      thumbnail: createTuneInBackdrop(),
      items
    });
  }

  private createMenuRootItem(entityId: string, paging: uc.Paging): uc.BrowseMediaItem {
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
          new uc.BrowseMediaItem(TUNEIN_MENU_BACK_ID, "Back", {
            can_browse: true,
            media_class: uc.KnownMediaClass.Directory,
            media_type: TUNEIN_MENU_ROOT_TYPE,
            thumbnail: createTuneInBackBackdrop()
          }),
          ...options.map((option) => this.createMenuItem(option, nowPlayingTitle))
        ]
      : options.map((option) => this.createMenuItem(option, nowPlayingTitle));

    const items = this.slicePagedItems(rootItems, paging);

    return new uc.BrowseMediaItem(TUNEIN_MENU_ROOT_ID, "TuneIn", {
      can_browse: true,
      media_class: uc.KnownMediaClass.Directory,
      media_type: TUNEIN_MENU_ROOT_TYPE,
      thumbnail: createTuneInBackdrop(),
      items
    });
  }

  private slicePagedItems<T>(items: T[], paging: uc.Paging): T[] {
    return items.slice(paging.offset, paging.offset + paging.limit);
  }

  private isMediaRequest(mediaId: string | undefined, mediaType: string | undefined, expectedId: string, expectedType: string): boolean {
    if (!mediaId) {
      return false;
    }

    if (mediaType !== undefined && mediaType !== expectedType) {
      return false;
    }

    return mediaId === expectedId;
  }
}
