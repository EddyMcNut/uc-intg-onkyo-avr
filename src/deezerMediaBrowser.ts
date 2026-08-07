import type { MenuBrowseOption } from "./menuBrowseState.js";
import { deezerStore } from "./deezerBrowserStore.js";
import { createMediaBrowser, type MediaBrowserApi } from "./menuMediaBrowser.js";
import type * as uc from "@unfoldedcircle/integration-api";

export const DEEZER_ROOT_ID = "deezer:root";
export const DEEZER_ROOT_TYPE = "deezer://menu";
export const DEEZER_MENU_ROOT_ID = "deezer:main-menu";
export const DEEZER_BACK_ID = "deezer:menu-back";

function isDeezerTrackTitle(title: string): boolean {
  return title.includes(" / ") || title.includes(" - ");
}

function titlesMatchExact(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

const browser: MediaBrowserApi = createMediaBrowser(
  {
    providerLabel: "Deezer",
    mediaIdPrefix: "deezer",
    mediaIdPrefixRegex: "deezer",
    rootId: DEEZER_ROOT_ID,
    rootType: DEEZER_ROOT_TYPE,
    menuRootId: DEEZER_MENU_ROOT_ID,
    backId: DEEZER_BACK_ID,
    mainMenuLabel: "Deezer Main Menu",
    rootLabel: "Deezer",
    excludedPrefixes: ["search", "login", "logout", "log out", "all stations"],
    isTrackTitle: isDeezerTrackTitle,
    titlesMatch: titlesMatchExact,
    thumbnails: {
      service: {
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
      },
      menu: {
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
      },
      back: {
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
      }
    }
  },
  deezerStore
);

export class DeezerMediaBrowser {
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
