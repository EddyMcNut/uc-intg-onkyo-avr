import * as uc from "@unfoldedcircle/integration-api";
import log from "./loggers.js";
import { createServiceThumbnails } from "./serviceThumbnails.js";
import { parseIndexedMenuEntry, getXmlOffset, parseXmlItems } from "./menuEntryParser.js";
import { type MenuBrowseOption, type MenuBrowseState } from "./menuBrowseState.js";
import { type MenuBrowseStore } from "./menuBrowseStore.js";

const NOW_PLAYING_LABEL = "▶ Now Playing";

export type MediaBrowserConfig = {
  providerLabel: string;
  mediaIdPrefix: string;
  mediaIdPrefixRegex: string;
  rootId: string;
  rootType: string;
  menuRootId: string;
  backId: string;
  mainMenuLabel: string;
  rootLabel: string;
  excludedPrefixes: string[];
  isTrackTitle: (title: string) => boolean;
  titlesMatch: (titleA: string, titleB: string) => boolean;
  thumbnails: {
    service: { svgFileName: string; logoTransform: string; logoPathAttrs: string; backgroundColor: string; fallbackLabel: string; fallbackLabelColor: string; fallbackBgOpacity: string; textColor: string; fallbackIcon: string; logName: string };
    menu: { svgFileName: string; logoTransform: string; logoPathAttrs: string; backgroundColor: string; fallbackLabel: string; fallbackLabelColor: string; fallbackBgOpacity: string; textColor: string; fallbackIcon: string; logName: string };
    back: { svgFileName: string; logoTransform: string; logoPathAttrs: string; backgroundColor: string; fallbackLabel: string; fallbackLabelColor: string; fallbackBgOpacity: string; textColor: string; fallbackIcon: string; logName: string };
  };
};

export type MediaBrowserApi = {
  ingestXmlEntries(entityId: string, xmlPayload: string): void;
  ingestListEntry(entityId: string, entry: string): void;
  browse(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult>;
  resolveMenuOption(mediaId?: string, mediaType?: string): MenuBrowseOption | undefined;
  isMainMenuRequest(mediaId?: string, mediaType?: string): boolean;
  isBackRequest(mediaId?: string, mediaType?: string): boolean;
};

function createExcludedTitleChecker(excludedPrefixes: string[]): (title: string) => boolean {
  return (title: string): boolean => {
    const lower = title.toLowerCase();
    return excludedPrefixes.some((prefix) => {
      if (lower === prefix) return true;
      if (!lower.startsWith(prefix)) return false;
      const next = lower[prefix.length];
      return next === undefined || next === " " || next === "(";
    });
  };
}

export function createMediaBrowser(cfg: MediaBrowserConfig, store: MenuBrowseStore): MediaBrowserApi {
  const integrationName = `${cfg.providerLabel.toLowerCase().replace(/\s+/g, "")}MediaBrowser:`;
  const isExcludedTitle = createExcludedTitleChecker(cfg.excludedPrefixes);

  const { createBackdrop, getOrCreateThumbnail } = createServiceThumbnails(cfg.thumbnails.service);
  const { createBackdrop: createMainMenuBackdrop } = createServiceThumbnails(cfg.thumbnails.menu);
  const { createBackdrop: createBackBackdrop } = createServiceThumbnails(cfg.thumbnails.back);

  function ingestXmlEntries(entityId: string, xmlPayload: string): void {
    if (!xmlPayload) return;
    const xmlOffset = getXmlOffset(xmlPayload);
    const xmlItems = parseXmlItems(xmlPayload);
    for (let i = 0; i < xmlItems.length; i++) {
      const item = xmlItems[i];
      if (!item.title) continue;
      if (isExcludedTitle(item.title)) continue;
      const menuIndex = xmlOffset + i + 1;
      store.addMenuOption(entityId, menuIndex, item.title, getOrCreateThumbnail);
    }
  }

  function ingestListEntry(entityId: string, entry: string): void {
    const parsed = parseIndexedMenuEntry(entry);
    if (!parsed) {
      return;
    }

    const title = parsed.rawTitle.trim();
    if (!title) {
      return;
    }

    if (isExcludedTitle(title)) {
      return;
    }

    const browseState = store.getBrowseState(entityId);
    const cursorOffset = browseState?.nlsCursorOffset ?? 0;
    const windowStart = Math.max(0, cursorOffset - 9);
    const absoluteMenuIndex = windowStart + parsed.menuIndex + 1;
    store.addMenuOption(entityId, absoluteMenuIndex, title, getOrCreateThumbnail);
  }

  function resolveMenuOption(mediaId?: string, mediaType?: string): MenuBrowseOption | undefined {
    if (!mediaId) {
      return undefined;
    }

    if (mediaType !== undefined && mediaType !== cfg.rootType) {
      return undefined;
    }

    const match = mediaId.match(new RegExp(`^${cfg.mediaIdPrefixRegex}:menu:(\\d+)(?::(.+))?$`));
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
      isBrowsable: !cfg.isTrackTitle(title)
    };
  }

  function isMainMenuRequest(mediaId?: string, mediaType?: string): boolean {
    return isMediaRequest(mediaId, mediaType, cfg.menuRootId, cfg.rootType);
  }

  function isBackRequest(mediaId?: string, mediaType?: string): boolean {
    return isMediaRequest(mediaId, mediaType, cfg.backId, cfg.rootType);
  }

  async function browse(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    const menuOptions = store.listOptions(entityId);
    const browseState = store.getBrowseState(entityId);
    const totalCount = menuOptions.length + ((browseState?.showMainMenuShortcut ?? false) ? 2 : 0);
    if (!options.media_id || options.media_id === cfg.rootId || isMainMenuRequest(options.media_id, options.media_type) || isBackRequest(options.media_id, options.media_type)) {
      log.info("%s [%s] browsable %s menu options: %d", integrationName, entityId, cfg.providerLabel, menuOptions.length);
      return uc.BrowseResult.fromPaging(createRootItem(entityId, options.paging), options.paging, totalCount);
    }

    const option = resolveMenuOption(options.media_id, options.media_type);
    if (!option) {
      return uc.StatusCodes.NotFound;
    }

    return uc.BrowseResult.fromPaging(createRootItem(entityId, options.paging), options.paging, totalCount);
  }

  function createMenuItem(option: MenuBrowseOption, nowPlayingTitle: string): uc.BrowseMediaItem {
    const isNowPlaying = !option.isBrowsable && nowPlayingTitle.length > 0 && cfg.titlesMatch(option.title, nowPlayingTitle);

    return new uc.BrowseMediaItem(option.mediaId, option.title, {
      can_browse: option.isBrowsable,
      can_play: !option.isBrowsable,
      media_class: option.isBrowsable ? uc.KnownMediaClass.Directory : uc.KnownMediaClass.Track,
      media_type: cfg.rootType,
      thumbnail: option.thumbnail || "icon://uc:music",
      subtitle: isNowPlaying ? NOW_PLAYING_LABEL : undefined
    });
  }

  function createMainMenuItem(_entityId: string): uc.BrowseMediaItem {
    return new uc.BrowseMediaItem(cfg.menuRootId, cfg.mainMenuLabel, {
      can_browse: true,
      media_class: uc.KnownMediaClass.Directory,
      media_type: cfg.rootType,
      thumbnail: createMainMenuBackdrop()
    });
  }

  function createBackItem(): uc.BrowseMediaItem {
    return new uc.BrowseMediaItem(cfg.backId, "Back", {
      can_browse: true,
      media_class: uc.KnownMediaClass.Directory,
      media_type: cfg.rootType,
      thumbnail: createBackBackdrop()
    });
  }

  function createRootItem(entityId: string, paging: uc.Paging): uc.BrowseMediaItem {
    const options = store.listOptions(entityId);
    const browseState = store.getBrowseState(entityId);
    const nowPlayingTitle = browseState?.nowPlayingTitle ?? "";
    const rootItems =
      (browseState?.showMainMenuShortcut ?? false)
        ? [createMainMenuItem(entityId), createBackItem(), ...options.map((option) => createMenuItem(option, nowPlayingTitle))]
        : options.map((option) => createMenuItem(option, nowPlayingTitle));
    const items = slicePagedItems(rootItems, paging);

    return new uc.BrowseMediaItem(cfg.rootId, cfg.rootLabel, {
      can_browse: true,
      media_class: uc.KnownMediaClass.Directory,
      media_type: cfg.rootType,
      thumbnail: createBackdrop(),
      items
    });
  }

  return {
    ingestXmlEntries,
    ingestListEntry,
    browse,
    resolveMenuOption,
    isMainMenuRequest,
    isBackRequest
  };
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
