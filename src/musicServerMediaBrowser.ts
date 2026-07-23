// Focused responsibility: Music Server service browsing and ingestion
import * as uc from "@unfoldedcircle/integration-api";
import log from "./loggers.js";
import { addMusicServerMenuOption, listMusicServerMenuOptions, getMusicServerBrowseState, type MusicServerMenuOption } from "./musicServerBrowserStore.js";
import { createServiceThumbnails } from "./serviceThumbnails.js";
import { parseIndexedMenuEntry, getXmlOffset, parseXmlItems } from "./menuEntryParser.js";

const integrationName = "musicServerMediaBrowser:";
const NOW_PLAYING_LABEL = "▶ Now Playing";

const { createBackdrop: createMusicServerBackdrop, getOrCreateThumbnail: getOrCreateMusicServerThumbnail } = createServiceThumbnails({
  svgFileName: "music-server.svg",
  logoTransform: "translate(180 240) scale(5)",
  logoPathAttrs: 'fill="#ffffff"',
  backgroundColor: "#00bfff",
  fallbackLabel: "MUSIC SERVER",
  fallbackLabelColor: "#ffffff",
  fallbackBgOpacity: ".15",
  textColor: "#ffffff",
  fallbackIcon: "icon://uc:music",
  logName: "MusicServer"
});

const { createBackdrop: createMusicServerMainMenuBackdrop } = createServiceThumbnails({
  svgFileName: "menu.svg",
  logoTransform: "translate(180 40) scale(5)",
  logoPathAttrs: 'fill="#ffffff"',
  backgroundColor: "#00bfff",
  fallbackLabel: "MENU",
  fallbackLabelColor: "#ffffff",
  fallbackBgOpacity: ".15",
  textColor: "#ffffff",
  fallbackIcon: "icon://uc:music",
  logName: "MusicServerMainMenu"
});

const { createBackdrop: createMusicServerBackBackdrop } = createServiceThumbnails({
  svgFileName: "back.svg",
  logoTransform: "translate(140 1) scale(0.7)",
  logoPathAttrs: 'fill="#ffffff"',
  backgroundColor: "#00bfff",
  fallbackLabel: "BACK",
  fallbackLabelColor: "#ffffff",
  fallbackBgOpacity: ".15",
  textColor: "#ffffff",
  fallbackIcon: "icon://uc:music",
  logName: "MusicServerMenuBack"
});

export const MUSIC_SERVER_ROOT_ID = "music-server:root";
export const MUSIC_SERVER_ROOT_TYPE = "music-server://menu";
export const MUSIC_SERVER_MENU_ROOT_ID = "music-server:main-menu";
export const MUSIC_SERVER_BACK_ID = "music-server:menu-back";

const MUSIC_SERVER_EXCLUDED_MENU_PREFIXES = ["search", "login", "logout", "log out"];

function isExcludedMusicServerTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return MUSIC_SERVER_EXCLUDED_MENU_PREFIXES.some((prefix) => {
    if (lower === prefix) return true;
    if (!lower.startsWith(prefix)) return false;
    const next = lower[prefix.length];
    return next === undefined || next === " " || next === "(";
  });
}

export class MusicServerMediaBrowser {
  ingestXmlEntries(entityId: string, xmlPayload: string): void {
    if (!xmlPayload) return;
    const xmlOffset = getXmlOffset(xmlPayload);
    const xmlItems = parseXmlItems(xmlPayload);
    for (let i = 0; i < xmlItems.length; i++) {
      const item = xmlItems[i];
      if (!item.title) continue;
      if (isExcludedMusicServerTitle(item.title)) continue;
      const menuIndex = xmlOffset + i + 1;
      addMusicServerMenuOption(entityId, menuIndex, item.title, getOrCreateMusicServerThumbnail);
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

    if (isExcludedMusicServerTitle(title)) {
      return;
    }

    const cursorOffset = getMusicServerBrowseState(entityId)?.nlsCursorOffset ?? 0;
    const windowStart = Math.max(0, cursorOffset - 9);
    const absoluteMenuIndex = windowStart + parsed.menuIndex + 1;
    addMusicServerMenuOption(entityId, absoluteMenuIndex, title, getOrCreateMusicServerThumbnail);
  }

  resolveMenuOption(mediaId?: string, mediaType?: string): MusicServerMenuOption | undefined {
    if (!mediaId) {
      return undefined;
    }

    if (mediaType !== undefined && mediaType !== MUSIC_SERVER_ROOT_TYPE) {
      return undefined;
    }

    const match = mediaId.match(/^music-server:menu:(\d+)(?::(.+))?$/);
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
    return this.isMediaRequest(mediaId, mediaType, MUSIC_SERVER_MENU_ROOT_ID, MUSIC_SERVER_ROOT_TYPE);
  }

  isBackRequest(mediaId?: string, mediaType?: string): boolean {
    return this.isMediaRequest(mediaId, mediaType, MUSIC_SERVER_BACK_ID, MUSIC_SERVER_ROOT_TYPE);
  }

  async browse(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    const musicServerMenuOptions = listMusicServerMenuOptions(entityId);
    const totalCount = musicServerMenuOptions.length + ((getMusicServerBrowseState(entityId)?.showMainMenuShortcut ?? false) ? 2 : 0);
    if (!options.media_id || options.media_id === MUSIC_SERVER_ROOT_ID || this.isMainMenuRequest(options.media_id, options.media_type) || this.isBackRequest(options.media_id, options.media_type)) {
      log.info("%s [%s] browsable Music Server menu options: %d", integrationName, entityId, musicServerMenuOptions.length);
      return uc.BrowseResult.fromPaging(this.createRootItem(entityId, options.paging), options.paging, totalCount);
    }

    const option = this.resolveMenuOption(options.media_id, options.media_type);
    if (!option) {
      return uc.StatusCodes.NotFound;
    }

    return uc.BrowseResult.fromPaging(this.createRootItem(entityId, options.paging), options.paging, totalCount);
  }

  private normalizeForComparison(title: string): string {
    return title
      .replace(/^\d+\.\s*/, "")
      .replace(/^\d+\s*-\s*/, "")
      .toLowerCase()
      .trim();
  }

  private titlesMatch(titleA: string, titleB: string): boolean {
    const a = this.normalizeForComparison(titleA);
    const b = this.normalizeForComparison(titleB);
    return a.length > 0 && b.length > 0 && (a === b || a.startsWith(b) || b.startsWith(a));
  }

  private createMenuItem(option: MusicServerMenuOption, nowPlayingTitle: string): uc.BrowseMediaItem {
    const isNowPlaying = !option.isBrowsable && nowPlayingTitle.length > 0 && this.titlesMatch(option.title, nowPlayingTitle);

    return new uc.BrowseMediaItem(option.mediaId, option.title, {
      can_browse: option.isBrowsable,
      can_play: !option.isBrowsable,
      media_class: option.isBrowsable ? uc.KnownMediaClass.Directory : uc.KnownMediaClass.Track,
      media_type: MUSIC_SERVER_ROOT_TYPE,
      thumbnail: option.thumbnail || "icon://uc:music",
      subtitle: isNowPlaying ? NOW_PLAYING_LABEL : undefined
    });
  }

  private createMainMenuItem(_entityId: string): uc.BrowseMediaItem {
    return new uc.BrowseMediaItem(MUSIC_SERVER_MENU_ROOT_ID, "Music Server Main Menu", {
      can_browse: true,
      media_class: uc.KnownMediaClass.Directory,
      media_type: MUSIC_SERVER_ROOT_TYPE,
      thumbnail: createMusicServerMainMenuBackdrop()
    });
  }

  private createBackItem(): uc.BrowseMediaItem {
    return new uc.BrowseMediaItem(MUSIC_SERVER_BACK_ID, "Back", {
      can_browse: true,
      media_class: uc.KnownMediaClass.Directory,
      media_type: MUSIC_SERVER_ROOT_TYPE,
      thumbnail: createMusicServerBackBackdrop()
    });
  }

  private createRootItem(entityId: string, paging: uc.Paging): uc.BrowseMediaItem {
    const options = listMusicServerMenuOptions(entityId);
    const nowPlayingTitle = getMusicServerBrowseState(entityId)?.nowPlayingTitle ?? "";
    const rootItems =
      (getMusicServerBrowseState(entityId)?.showMainMenuShortcut ?? false)
        ? [this.createMainMenuItem(entityId), this.createBackItem(), ...options.map((option) => this.createMenuItem(option, nowPlayingTitle))]
        : options.map((option) => this.createMenuItem(option, nowPlayingTitle));
    const items = this.slicePagedItems(rootItems, paging);

    return new uc.BrowseMediaItem(MUSIC_SERVER_ROOT_ID, "Music Server", {
      can_browse: true,
      media_class: uc.KnownMediaClass.Directory,
      media_type: MUSIC_SERVER_ROOT_TYPE,
      thumbnail: createMusicServerBackdrop(),
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
