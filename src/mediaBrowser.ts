import * as uc from "@unfoldedcircle/integration-api";
import { MEDIA_BROWSING } from "./constants.js";
import { avrStateManager } from "./avrState.js";
import type { AvrStateApi } from "./types.js";
import log from "./loggers.js";
import {
  browseTidalMedia,
  browseTuneInMedia,
  browseTuneInMenuMedia,
  TIDAL_BACK_ID,
  TIDAL_MENU_ROOT_ID,
  TIDAL_ROOT_ID,
  TIDAL_ROOT_TYPE,
  TUNEIN_MENU_BACK_ID,
  TUNEIN_MENU_ROOT_ID,
  TUNEIN_MENU_ROOT_TYPE,
  TUNEIN_ROOT_ID,
  TUNEIN_ROOT_TYPE,
  getTuneInPresetCount,
  hasTuneInPresets,
  ingestTidalListEntry,
  ingestTidalXmlEntries,
  ingestTuneInListEntry,
  ingestTuneInMenuListEntry,
  ingestTuneInMenuXmlEntries,
  ingestTuneInXmlEntries,
  isTidalBackRequest,
  isTidalMainMenuRequest,
  isTuneInBackRequest,
  isTuneInMenuRootRequest,
  resolveTidalMenuOption,
  resolveTuneInMenuOption,
  resolveTuneInPreset,
  setTuneInBrowseContext
} from "./mediaBrowserServices.js";

const integrationName = "mediaBrowser:";
const DEFAULT_BROWSE_PAGE_SIZE = 25;

export {
  browseTidalMedia,
  browseTuneInMedia,
  browseTuneInMenuMedia,
  getTuneInPresetCount,
  hasTuneInPresets,
  ingestTidalListEntry,
  ingestTidalXmlEntries,
  ingestTuneInListEntry,
  ingestTuneInMenuListEntry,
  ingestTuneInMenuXmlEntries,
  ingestTuneInXmlEntries,
  isTidalBackRequest,
  isTidalMainMenuRequest,
  isTuneInBackRequest,
  isTuneInMenuRootRequest,
  resolveTidalMenuOption,
  resolveTuneInMenuOption,
  resolveTuneInPreset,
  setTuneInBrowseContext,
  TIDAL_BACK_ID,
  TIDAL_MENU_ROOT_ID,
  TIDAL_ROOT_ID,
  TIDAL_ROOT_TYPE,
  TUNEIN_MENU_BACK_ID,
  TUNEIN_MENU_ROOT_ID,
  TUNEIN_MENU_ROOT_TYPE,
  TUNEIN_ROOT_ID,
  TUNEIN_ROOT_TYPE
};

function withPaging(options: uc.BrowseOptions): uc.BrowseOptions {
  if (options.paging) return options;
  return { ...options, paging: new uc.Paging(1, DEFAULT_BROWSE_PAGE_SIZE) };
}

export function createMediaBrowser(avrStateApi: AvrStateApi) {
  return {
    isMediaBrowsingAvailable(entityId: string, subSource?: string): boolean {
      const source = avrStateApi.getSource(entityId);
      const effectiveSubSource = subSource ?? avrStateApi.getSubSource(entityId);
      return source === "net" && MEDIA_BROWSING.includes(effectiveSubSource);
    },

    async browseMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
      const subSource = avrStateApi.getSubSource(entityId);
      if (!this.isMediaBrowsingAvailable(entityId, subSource)) {
        log.debug("%s [%s] ignoring browse request outside browsable context", integrationName, entityId);
        return uc.StatusCodes.NotFound;
      }

      switch (subSource) {
        case "tunein":
          if (options.media_type === TUNEIN_MENU_ROOT_TYPE) {
            return browseTuneInMenuMedia(entityId, withPaging(options));
          }
          return browseTuneInMedia(entityId, withPaging(options));
        case "tidal":
          return browseTidalMedia(entityId, withPaging(options));
        default:
          log.debug("%s [%s] unsupported media browsing for subSource [%s]", integrationName, entityId, subSource);
          return uc.StatusCodes.NotFound;
      }
    }
  };
}

// Singleton instance created in driver.ts
let mediaBrowser: ReturnType<typeof createMediaBrowser>;

function getMediaBrowser(): ReturnType<typeof createMediaBrowser> {
  if (!mediaBrowser) {
    mediaBrowser = createMediaBrowser(avrStateManager);
  }
  return mediaBrowser;
}

export function initMediaBrowser(avrStateApi: AvrStateApi): void {
  mediaBrowser = createMediaBrowser(avrStateApi);
}

export function isMediaBrowsingAvailable(entityId: string, subSource?: string): boolean {
  return getMediaBrowser().isMediaBrowsingAvailable(entityId, subSource);
}

export async function browseMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
  return getMediaBrowser().browseMedia(entityId, options);
}
