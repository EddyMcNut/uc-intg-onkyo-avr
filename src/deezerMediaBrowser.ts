// Focused responsibility: Deezer service browsing and ingestion
import * as uc from "@unfoldedcircle/integration-api";
import log from "./loggers.js";
import { addDeezerMenuOption, listDeezerMenuOptions, getDeezerBrowseState, type DeezerMenuOption } from "./deezerBrowserStore.js";
import { createServiceThumbnails } from "./serviceThumbnails.js";
import { parseIndexedMenuEntry, getXmlOffset, parseXmlItems } from "./menuEntryParser.js";

const integrationName = "deezerMediaBrowser:";
const NOW_PLAYING_LABEL = "▶ Now Playing";

const { createBackdrop: createDeezerBackdrop, getOrCreateThumbnail: getOrCreateDeezerThumbnail } = createServiceThumbnails({
  svgFileName: "deezer.svg",
  logoTransform: "translate(245 248) scale(1)",
  logoPathAttrs: 'fill="#A238FF"',
  backgroundColor: "#000000",
  fallbackLabel: "DEEZER",
  fallbackLabelColor: "#A238FF",
  fallbackBgOpacity: ".15",
  textColor: "#A238FF",
  fallbackIcon: "icon://uc:music",
  logName: "Deezer"
});

const { createBackdrop: createDeezerMainMenuBackdrop } = createServiceThumbnails({
  svgFileName: "menu.svg",
  logoTransform: "translate(180 40) scale(5)",
  logoPathAttrs: 'fill="#A238FF"',
  backgroundColor: "#000000",
  fallbackLabel: "MENU",
  fallbackLabelColor: "#A238FF",
  fallbackBgOpacity: ".15",
  textColor: "#A238FF",
  fallbackIcon: "icon://uc:music",
  logName: "DeezerMainMenu"
});

const { createBackdrop: createDeezerBackBackdrop } = createServiceThumbnails({
  svgFileName: "back.svg",
  logoTransform: "translate(140 1) scale(0.7)",
  logoPathAttrs: 'fill="#A238FF"',
  backgroundColor: "#000000",
  fallbackLabel: "BACK",
  fallbackLabelColor: "#A238FF",
  fallbackBgOpacity: ".15",
  textColor: "#A238FF",
  fallbackIcon: "icon://uc:music",
  logName: "DeezerMenuBack"
});

export const DEEZER_ROOT_ID = "deezer:root";
export const DEEZER_ROOT_TYPE = "deezer://menu";
export const DEEZER_MENU_ROOT_ID = "deezer:main-menu";
export const DEEZER_BACK_ID = "deezer:menu-back";

const DEEZER_EXCLUDED_MENU_TITLES = new Set(["search", "login", "logout", "all stations"]);

function isLikelyDeezerTrackTitle(title: string): boolean {
  return title.includes(" / ") || title.includes(" - ");
}

export class DeezerMediaBrowser {
  ingestXmlEntries(entityId: string, xmlPayload: string): void {
    if (!xmlPayload) return;
    const xmlOffset = getXmlOffset(xmlPayload);
    const xmlItems = parseXmlItems(xmlPayload);
    for (let i = 0; i < xmlItems.length; i++) {
      const item = xmlItems[i];
      if (!item.title) continue;
      if (DEEZER_EXCLUDED_MENU_TITLES.has(item.title.toLowerCase())) continue;
      const menuIndex = xmlOffset + i + 1;
      addDeezerMenuOption(entityId, menuIndex, item.title, getOrCreateDeezerThumbnail);
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

    if (DEEZER_EXCLUDED_MENU_TITLES.has(title.toLowerCase())) {
      return;
    }

    const cursorOffset = getDeezerBrowseState(entityId)?.nlsCursorOffset ?? 0;
    const windowStart = Math.max(0, cursorOffset - 9);
    const absoluteMenuIndex = windowStart + parsed.menuIndex + 1;
    addDeezerMenuOption(entityId, absoluteMenuIndex, title, getOrCreateDeezerThumbnail);
  }

  resolveMenuOption(mediaId?: string, mediaType?: string): DeezerMenuOption | undefined {
    if (!mediaId) {
      return undefined;
    }

    if (mediaType !== undefined && mediaType !== DEEZER_ROOT_TYPE) {
      return undefined;
    }

    const match = mediaId.match(/^deezer:menu:(\d+)(?::(.+))?$/);
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
      isBrowsable: !isLikelyDeezerTrackTitle(title)
    };
  }

  isMainMenuRequest(mediaId?: string, mediaType?: string): boolean {
    return this.isMediaRequest(mediaId, mediaType, DEEZER_MENU_ROOT_ID, DEEZER_ROOT_TYPE);
  }

  isBackRequest(mediaId?: string, mediaType?: string): boolean {
    return this.isMediaRequest(mediaId, mediaType, DEEZER_BACK_ID, DEEZER_ROOT_TYPE);
  }

  async browse(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    const deezerMenuOptions = listDeezerMenuOptions(entityId);
    const totalCount = deezerMenuOptions.length + ((getDeezerBrowseState(entityId)?.showMainMenuShortcut ?? false) ? 2 : 0);
    if (!options.media_id || options.media_id === DEEZER_ROOT_ID || this.isMainMenuRequest(options.media_id, options.media_type) || this.isBackRequest(options.media_id, options.media_type)) {
      log.info("%s [%s] browsable Deezer menu options: %d", integrationName, entityId, deezerMenuOptions.length);
      return uc.BrowseResult.fromPaging(this.createRootItem(entityId, options.paging), options.paging, totalCount);
    }

    const option = this.resolveMenuOption(options.media_id, options.media_type);
    if (!option) {
      return uc.StatusCodes.NotFound;
    }

    return uc.BrowseResult.fromPaging(this.createRootItem(entityId, options.paging), options.paging, totalCount);
  }

  private createMenuItem(option: DeezerMenuOption, nowPlayingTitle: string): uc.BrowseMediaItem {
    const isNowPlaying = !option.isBrowsable && nowPlayingTitle.length > 0 && option.title.toLowerCase() === nowPlayingTitle.toLowerCase();

    return new uc.BrowseMediaItem(option.mediaId, option.title, {
      can_browse: option.isBrowsable,
      can_play: !option.isBrowsable,
      media_class: option.isBrowsable ? uc.KnownMediaClass.Directory : uc.KnownMediaClass.Track,
      media_type: DEEZER_ROOT_TYPE,
      thumbnail: option.thumbnail || "icon://uc:music",
      subtitle: isNowPlaying ? NOW_PLAYING_LABEL : undefined
    });
  }

  private createMainMenuItem(_entityId: string): uc.BrowseMediaItem {
    return new uc.BrowseMediaItem(DEEZER_MENU_ROOT_ID, "Deezer Main Menu", {
      can_browse: true,
      media_class: uc.KnownMediaClass.Directory,
      media_type: DEEZER_ROOT_TYPE,
      thumbnail: createDeezerMainMenuBackdrop()
    });
  }

  private createBackItem(): uc.BrowseMediaItem {
    return new uc.BrowseMediaItem(DEEZER_BACK_ID, "Back", {
      can_browse: true,
      media_class: uc.KnownMediaClass.Directory,
      media_type: DEEZER_ROOT_TYPE,
      thumbnail: createDeezerBackBackdrop()
    });
  }

  private createRootItem(entityId: string, paging: uc.Paging): uc.BrowseMediaItem {
    const options = listDeezerMenuOptions(entityId);
    const nowPlayingTitle = getDeezerBrowseState(entityId)?.nowPlayingTitle ?? "";
    const rootItems =
      (getDeezerBrowseState(entityId)?.showMainMenuShortcut ?? false)
        ? [this.createMainMenuItem(entityId), this.createBackItem(), ...options.map((option) => this.createMenuItem(option, nowPlayingTitle))]
        : options.map((option) => this.createMenuItem(option, nowPlayingTitle));
    const items = this.slicePagedItems(rootItems, paging);

    return new uc.BrowseMediaItem(DEEZER_ROOT_ID, "Deezer", {
      can_browse: true,
      media_class: uc.KnownMediaClass.Directory,
      media_type: DEEZER_ROOT_TYPE,
      thumbnail: createDeezerBackdrop(),
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
