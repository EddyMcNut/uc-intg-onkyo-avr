// Focused responsibility: Tidal service browsing and ingestion
import * as uc from "@unfoldedcircle/integration-api";
import log from "./loggers.js";
import { addTidalMenuOption, listTidalMenuOptions, getTidalBrowseState, type TidalMenuOption } from "./tidalBrowserStore.js";
import { createServiceThumbnails } from "./serviceThumbnails.js";
import { parseIndexedMenuEntry, getXmlOffset, parseXmlItems } from "./menuEntryParser.js";

const integrationName = "tidalMediaBrowser:";
const NOW_PLAYING_LABEL = "▶ Now Playing";

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

export const TIDAL_ROOT_ID = "tidal:root";
export const TIDAL_ROOT_TYPE = "tidal://menu";
export const TIDAL_MENU_ROOT_ID = "tidal:main-menu";
export const TIDAL_BACK_ID = "tidal:menu-back";

const TIDAL_EXCLUDED_MENU_TITLES = new Set(["search", "login", "logout", "all stations"]);

export class TidalMediaBrowser {
  ingestXmlEntries(entityId: string, xmlPayload: string): void {
    if (!xmlPayload) return;
    const xmlOffset = getXmlOffset(xmlPayload);
    const xmlItems = parseXmlItems(xmlPayload);
    for (let i = 0; i < xmlItems.length; i++) {
      const item = xmlItems[i];
      if (!item.title) continue;
      if (TIDAL_EXCLUDED_MENU_TITLES.has(item.title.toLowerCase())) continue;
      const menuIndex = xmlOffset + i + 1;
      addTidalMenuOption(entityId, menuIndex, item.title, getOrCreateTidalThumbnail);
    }
  }

  ingestListEntry(entityId: string, entry: string): void {
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

  resolveMenuOption(mediaId?: string, mediaType?: string): TidalMenuOption | undefined {
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

  isMainMenuRequest(mediaId?: string, mediaType?: string): boolean {
    return this.isMediaRequest(mediaId, mediaType, TIDAL_MENU_ROOT_ID, TIDAL_ROOT_TYPE);
  }

  isBackRequest(mediaId?: string, mediaType?: string): boolean {
    return this.isMediaRequest(mediaId, mediaType, TIDAL_BACK_ID, TIDAL_ROOT_TYPE);
  }

  async browse(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    const tidalMenuOptions = listTidalMenuOptions(entityId);
    const totalCount = tidalMenuOptions.length + ((getTidalBrowseState(entityId)?.showMainMenuShortcut ?? false) ? 2 : 0);
    if (!options.media_id || options.media_id === TIDAL_ROOT_ID || this.isMainMenuRequest(options.media_id, options.media_type) || this.isBackRequest(options.media_id, options.media_type)) {
      log.info("%s [%s] browsable Tidal menu options: %d", integrationName, entityId, tidalMenuOptions.length);
      return uc.BrowseResult.fromPaging(this.createRootItem(entityId, options.paging), options.paging, totalCount);
    }

    const option = this.resolveMenuOption(options.media_id, options.media_type);
    if (!option) {
      return uc.StatusCodes.NotFound;
    }

    return uc.BrowseResult.fromPaging(this.createRootItem(entityId, options.paging), options.paging, totalCount);
  }

  private createMenuItem(option: TidalMenuOption, nowPlayingTitle: string): uc.BrowseMediaItem {
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

  private createMainMenuItem(_entityId: string): uc.BrowseMediaItem {
    return new uc.BrowseMediaItem(TIDAL_MENU_ROOT_ID, "Tidal Main Menu", {
      can_browse: true,
      media_class: uc.KnownMediaClass.Directory,
      media_type: TIDAL_ROOT_TYPE,
      thumbnail: createTidalMainMenuBackdrop()
    });
  }

  private createBackItem(): uc.BrowseMediaItem {
    return new uc.BrowseMediaItem(TIDAL_BACK_ID, "Back", {
      can_browse: true,
      media_class: uc.KnownMediaClass.Directory,
      media_type: TIDAL_ROOT_TYPE,
      thumbnail: createTidalBackBackdrop()
    });
  }

  private createRootItem(entityId: string, paging: uc.Paging): uc.BrowseMediaItem {
    const options = listTidalMenuOptions(entityId);
    const nowPlayingTitle = getTidalBrowseState(entityId)?.nowPlayingTitle ?? "";
    const rootItems =
      (getTidalBrowseState(entityId)?.showMainMenuShortcut ?? false)
        ? [this.createMainMenuItem(entityId), this.createBackItem(), ...options.map((option) => this.createMenuItem(option, nowPlayingTitle))]
        : options.map((option) => this.createMenuItem(option, nowPlayingTitle));
    const items = this.slicePagedItems(rootItems, paging);

    return new uc.BrowseMediaItem(TIDAL_ROOT_ID, "Tidal", {
      can_browse: true,
      media_class: uc.KnownMediaClass.Directory,
      media_type: TIDAL_ROOT_TYPE,
      thumbnail: createTidalBackdrop(),
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
