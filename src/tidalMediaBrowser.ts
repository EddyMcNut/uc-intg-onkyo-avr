import type { MenuBrowseOption } from "./menuBrowseState.js";
import { tidalStore } from "./tidalBrowserStore.js";
import { createMediaBrowser, type MediaBrowserApi } from "./menuMediaBrowser.js";
import type * as uc from "@unfoldedcircle/integration-api";

export const TIDAL_ROOT_ID = "tidal:root";
export const TIDAL_ROOT_TYPE = "tidal://menu";
export const TIDAL_MENU_ROOT_ID = "tidal:main-menu";
export const TIDAL_BACK_ID = "tidal:menu-back";

function isTidalTrackTitle(title: string): boolean {
  return title.includes(" - ");
}

function titlesMatchExact(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

const browser: MediaBrowserApi = createMediaBrowser({
  providerLabel: "Tidal",
  mediaIdPrefix: "tidal",
  mediaIdPrefixRegex: "tidal",
  rootId: TIDAL_ROOT_ID,
  rootType: TIDAL_ROOT_TYPE,
  menuRootId: TIDAL_MENU_ROOT_ID,
  backId: TIDAL_BACK_ID,
  mainMenuLabel: "Tidal Main Menu",
  rootLabel: "Tidal",
  excludedPrefixes: ["search", "login", "logout", "log out", "all stations"],
  isTrackTitle: isTidalTrackTitle,
  titlesMatch: titlesMatchExact,
  thumbnails: {
    service: {
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
    },
    menu: {
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
    },
    back: {
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
    }
  }
}, tidalStore);

export class TidalMediaBrowser {
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
