import type { MenuBrowseOption } from "./menuBrowseState.js";
import { musicServerStore } from "./musicServerBrowserStore.js";
import { createMediaBrowser, type MediaBrowserApi } from "./menuMediaBrowser.js";
import type * as uc from "@unfoldedcircle/integration-api";

export const MUSIC_SERVER_ROOT_ID = "music-server:root";
export const MUSIC_SERVER_ROOT_TYPE = "music-server://menu";
export const MUSIC_SERVER_MENU_ROOT_ID = "music-server:main-menu";
export const MUSIC_SERVER_BACK_ID = "music-server:menu-back";

function normalizeForComparison(title: string): string {
  return title
    .replace(/^\d+\.\s*/, "")
    .replace(/^\d+\s*-\s*/, "")
    .toLowerCase()
    .trim();
}

function titlesMatchFuzzy(titleA: string, titleB: string): boolean {
  const a = normalizeForComparison(titleA);
  const b = normalizeForComparison(titleB);
  return a.length > 0 && b.length > 0 && (a === b || a.startsWith(b) || b.startsWith(a));
}

function isMusicServerTrackTitle(title: string): boolean {
  return title.includes(" - ");
}

const browser: MediaBrowserApi = createMediaBrowser({
  providerLabel: "Music Server",
  mediaIdPrefix: "music-server",
  mediaIdPrefixRegex: "music-server",
  rootId: MUSIC_SERVER_ROOT_ID,
  rootType: MUSIC_SERVER_ROOT_TYPE,
  menuRootId: MUSIC_SERVER_MENU_ROOT_ID,
  backId: MUSIC_SERVER_BACK_ID,
  mainMenuLabel: "Music Server Main Menu",
  rootLabel: "Music Server",
  excludedPrefixes: ["search", "login", "logout", "log out"],
  isTrackTitle: isMusicServerTrackTitle,
  titlesMatch: titlesMatchFuzzy,
  thumbnails: {
    service: {
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
    },
    menu: {
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
    },
    back: {
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
    }
  }
}, musicServerStore);

export class MusicServerMediaBrowser {
  ingestXmlEntries(entityId: string, xmlPayload: string): void {
    browser.ingestXmlEntries(entityId, xmlPayload);
  }

  ingestListEntry(entityId: string, entry: string): void {
    browser.ingestListEntry(entityId, entry);
  }

  resolveMenuOption(mediaId?: string, mediaType?: string): MenuBrowseOption | undefined {
    return browser.resolveMenuOption(mediaId, mediaType);
  }

  isMainMenuRequest(mediaId?: string, mediaType?: string): boolean {
    return browser.isMainMenuRequest(mediaId, mediaType);
  }

  isBackRequest(mediaId?: string, mediaType?: string): boolean {
    return browser.isBackRequest(mediaId, mediaType);
  }

  async browse(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    return browser.browse(entityId, options);
  }
}
