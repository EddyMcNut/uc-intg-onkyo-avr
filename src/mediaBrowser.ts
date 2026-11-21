import * as uc from "@unfoldedcircle/integration-api";
import { MEDIA_BROWSING } from "./constants.js";
import type { AvrStateApi } from "./types.js";
import log from "./loggers.js";
import {
  DEEZER_BACK_ID,
  DEEZER_MENU_ROOT_ID,
  DEEZER_ROOT_ID,
  DEEZER_ROOT_TYPE,
  MUSIC_SERVER_BACK_ID,
  MUSIC_SERVER_MENU_ROOT_ID,
  MUSIC_SERVER_ROOT_ID,
  MUSIC_SERVER_ROOT_TYPE,
  TIDAL_BACK_ID,
  TIDAL_MENU_ROOT_ID,
  TIDAL_ROOT_ID,
  TIDAL_ROOT_TYPE,
  TUNEIN_MENU_BACK_ID,
  TUNEIN_MENU_ROOT_ID,
  TUNEIN_MENU_ROOT_TYPE,
  TUNEIN_ROOT_ID,
  TUNEIN_ROOT_TYPE,
  isDeezerBackRequest,
  isDeezerMainMenuRequest,
  isMusicServerBackRequest,
  isMusicServerMainMenuRequest,
  isTidalBackRequest,
  isTidalMainMenuRequest,
  isTuneInBackRequest,
  isTuneInMenuRootRequest,
  resolveDeezerMenuOption,
  resolveMusicServerMenuOption,
  resolveTidalMenuOption,
  resolveTuneInPreset,
  type MediaBrowserServices
} from "./mediaBrowserServices.js";

const logSource = "mediaBrowser:";
const DEFAULT_BROWSE_PAGE_SIZE = 25;

export {
  DEEZER_BACK_ID,
  DEEZER_MENU_ROOT_ID,
  DEEZER_ROOT_ID,
  DEEZER_ROOT_TYPE,
  isDeezerBackRequest,
  isDeezerMainMenuRequest,
  isMusicServerBackRequest,
  isMusicServerMainMenuRequest,
  isTidalBackRequest,
  isTidalMainMenuRequest,
  isTuneInBackRequest,
  isTuneInMenuRootRequest,
  resolveDeezerMenuOption,
  resolveMusicServerMenuOption,
  resolveTidalMenuOption,
  resolveTuneInPreset,
  MUSIC_SERVER_BACK_ID,
  MUSIC_SERVER_MENU_ROOT_ID,
  MUSIC_SERVER_ROOT_ID,
  MUSIC_SERVER_ROOT_TYPE,
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

// Routes a browse request to the service browser of the zone's current sub-source. One instance is created by the
// driver and passed to the components that browse; `services` gives them the per-service browsers.
export class MediaBrowser {
  constructor(
    // Only source and sub-source are read.
    private readonly avrStateApi: Pick<AvrStateApi, "getSource" | "getSubSource">,
    readonly services: MediaBrowserServices
  ) {}

  isMediaBrowsingAvailable(entityId: string, subSource?: string): boolean {
    const source = this.avrStateApi.getSource(entityId);
    const effectiveSubSource = subSource ?? this.avrStateApi.getSubSource(entityId);
    return source === "net" && MEDIA_BROWSING.includes(effectiveSubSource);
  }

  async browseMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    const subSource = this.avrStateApi.getSubSource(entityId);
    if (!this.isMediaBrowsingAvailable(entityId, subSource)) {
      log.debug("%s [%s] ignoring browse request outside browsable context", logSource, entityId);
      return uc.StatusCodes.NotFound;
    }

    switch (subSource) {
      case "tunein":
        if (options.media_type === TUNEIN_MENU_ROOT_TYPE) {
          return this.services.browseTuneInMenuMedia(entityId, withPaging(options));
        }
        return this.services.browseTuneInMedia(entityId, withPaging(options));
      case "tidal":
        return this.services.browseTidalMedia(entityId, withPaging(options));
      case "deezer":
        return this.services.browseDeezerMedia(entityId, withPaging(options));
      case "music-server":
        return this.services.browseMusicServerMedia(entityId, withPaging(options));
      default:
        log.debug("%s [%s] unsupported media browsing for subSource [%s]", logSource, entityId, subSource);
        return uc.StatusCodes.NotFound;
    }
  }
}
