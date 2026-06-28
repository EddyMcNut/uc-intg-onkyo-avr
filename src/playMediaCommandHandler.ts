import * as uc from "@unfoldedcircle/integration-api";
import { EiscpDriver } from "./eiscp.js";
import { ICommandReceiver, AvrStateApi } from "./types.js";
import log from "./loggers.js";
import { delay } from "./utils.js";
import {
  DEEZER_BACK_ID,
  DEEZER_ROOT_TYPE,
  isTidalMainMenuRequest,
  isDeezerMainMenuRequest,
  isTuneInMenuRootRequest,
  resolveDeezerMenuOption,
  resolveTidalMenuOption,
  resolveTuneInMenuOption,
  resolveTuneInPreset,
  TIDAL_BACK_ID,
  TIDAL_ROOT_TYPE,
  TUNEIN_MENU_BACK_ID,
  TUNEIN_MENU_ROOT_TYPE
} from "./mediaBrowser.js";
import { consumeTidalListModeActive, consumeTraceNextTidalSelectionAfterMainMenu, getTidalBrowseState, listTidalMenuOptions } from "./tidalBrowserStore.js";
import { consumeDeezerListModeActive, consumeTraceNextDeezerSelectionAfterMainMenu, getDeezerBrowseState, listDeezerMenuOptions } from "./deezerBrowserStore.js";
import { consumeTuneInListModeActive, setTuneInMenuBrowseFrozen, setTuneInMenuNowPlayingStation } from "./tuneInMenuStore.js";
import { DEFAULT_QUEUE_THRESHOLD } from "./configManager.js";
import { DEEZER_SERVICE_ID, getBrowseServiceSelectSourceCommand, isBrowseServiceActive, TIDAL_SERVICE_ID, TUNEIN_SERVICE_ID, type BrowseServiceId } from "./browseServiceContract.js";

const integrationName = "playMediaCommandHandler:";

type ZonePrefixFn = (cmd: string) => string;

export type PlayMediaCommandContext = {
  entityId: string;
  mediaId?: string;
  mediaType?: string;
  netMenuDelay?: number;
  setZonePrefix: ZonePrefixFn;
};

// Predicate helpers for media request type detection
function isBackRequest(mediaId: string | undefined, mediaType: string | undefined, backId: string, rootType: string): boolean {
  return mediaId === backId && (mediaType === undefined || mediaType === rootType);
}

function isValidPlayMediaRequest(
  preset: unknown,
  tuneInRootRequest: boolean,
  tuneInMenuOption: unknown,
  tidalMainMenu: boolean,
  deezerMainMenu: boolean,
  tidalOption: unknown,
  deezerOption: unknown,
  tuneInBackRequest: boolean,
  tidalBackRequest: boolean,
  deezerBackRequest: boolean
): boolean {
  return !!(preset || tuneInRootRequest || tuneInMenuOption || tidalMainMenu || deezerMainMenu || tidalOption || deezerOption || tuneInBackRequest || tidalBackRequest || deezerBackRequest);
}

export class PlayMediaCommandHandler {
  constructor(
    private readonly eiscp: EiscpDriver,
    private readonly avrStateApi: AvrStateApi,
    private readonly commandReceiver: ICommandReceiver | undefined
  ) {}

  private async selectBrowseService(
    entityId: string,
    serviceId: BrowseServiceId,
    setZonePrefix: ZonePrefixFn,
    netMenuDelay: number,
    options?: { force?: boolean; delayAfterSelect?: boolean }
  ): Promise<void> {
    const currentSource = this.avrStateApi.getSource(entityId);
    const currentSubSource = this.avrStateApi.getSubSource(entityId);
    const mustSelect = options?.force ?? !isBrowseServiceActive(currentSource, currentSubSource, serviceId);
    if (!mustSelect) {
      return;
    }

    await this.eiscp.command(setZonePrefix(getBrowseServiceSelectSourceCommand(serviceId)));
    if (options?.delayAfterSelect) {
      await delay(netMenuDelay);
    }
  }

  async handle(context: PlayMediaCommandContext): Promise<uc.StatusCodes> {
    const { entityId, mediaId, mediaType, setZonePrefix } = context;
    const netMenuDelay = context.netMenuDelay ?? DEFAULT_QUEUE_THRESHOLD;

    const preset = resolveTuneInPreset(mediaId, mediaType);
    const tuneInMenuOption = resolveTuneInMenuOption(entityId, mediaId, mediaType);
    const tuneInRootRequest = isTuneInMenuRootRequest(mediaId, mediaType);
    const tidalMainMenu = isTidalMainMenuRequest(mediaId, mediaType);
    const deezerMainMenu = isDeezerMainMenuRequest(mediaId, mediaType);
    const tidalOption = resolveTidalMenuOption(mediaId, mediaType);
    const deezerOption = resolveDeezerMenuOption(mediaId, mediaType);
    const tuneInBackRequest = isBackRequest(mediaId, mediaType, TUNEIN_MENU_BACK_ID, TUNEIN_MENU_ROOT_TYPE);
    const tidalBackRequest = isBackRequest(mediaId, mediaType, TIDAL_BACK_ID, TIDAL_ROOT_TYPE);
    const deezerBackRequest = isBackRequest(mediaId, mediaType, DEEZER_BACK_ID, DEEZER_ROOT_TYPE);

    if (!isValidPlayMediaRequest(preset, tuneInRootRequest, tuneInMenuOption, tidalMainMenu, deezerMainMenu, tidalOption, deezerOption, tuneInBackRequest, tidalBackRequest, deezerBackRequest)) {
      return uc.StatusCodes.NotFound;
    }

    if (tuneInBackRequest || tidalBackRequest || deezerBackRequest) {
      await this.eiscp.raw("NTCRETURN");
      return uc.StatusCodes.Ok;
    }

    if (preset) {
      const wasPreloading = this.commandReceiver?.abortTuneInPreload?.(entityId) ?? false;
      // Only force select if preload was interrupted; wasPreloading || undefined ensures false becomes undefined
      // so default logic (based on current state) applies when preload was not running
      await this.selectBrowseService(entityId, TUNEIN_SERVICE_ID, setZonePrefix, netMenuDelay, { force: wasPreloading || undefined });

      await this.eiscp.command(setZonePrefix(`tunein-preset ${preset.presetIndex}`));
      return uc.StatusCodes.Ok;
    }

    if (tuneInRootRequest) {
      await this.selectBrowseService(entityId, TUNEIN_SERVICE_ID, setZonePrefix, netMenuDelay, { force: true, delayAfterSelect: true });
      return uc.StatusCodes.Ok;
    }

    if (tuneInMenuOption) {
      await this.selectBrowseService(entityId, TUNEIN_SERVICE_ID, setZonePrefix, netMenuDelay, { delayAfterSelect: true });

      if (!tuneInMenuOption.isBrowsable) {
        setTuneInMenuBrowseFrozen(entityId, true);
        setTuneInMenuNowPlayingStation(entityId, tuneInMenuOption.title);
        const alreadyInListMode = consumeTuneInListModeActive(entityId);
        if (!alreadyInListMode) {
          const playbackStatus = this.avrStateApi.getPlaybackStatus(entityId);
          if (playbackStatus === "playing" || playbackStatus === "paused" || playbackStatus === "ff" || playbackStatus === "fr") {
            await this.eiscp.command(setZonePrefix("network-usb list"));
            await delay(netMenuDelay);
          }
        }
      } else {
        setTuneInMenuBrowseFrozen(entityId, false);
      }

      await this.eiscp.raw(`NLSI${String(tuneInMenuOption.menuIndex).padStart(5, "0")}`);
      return uc.StatusCodes.Ok;
    }

    if (tidalMainMenu) {
      await this.selectBrowseService(entityId, TIDAL_SERVICE_ID, setZonePrefix, netMenuDelay, { force: true });
      return uc.StatusCodes.Ok;
    }

    if (deezerMainMenu) {
      await this.selectBrowseService(entityId, DEEZER_SERVICE_ID, setZonePrefix, netMenuDelay, { force: true });
      return uc.StatusCodes.Ok;
    }

    const activeServiceId = tidalOption ? TIDAL_SERVICE_ID : deezerOption ? DEEZER_SERVICE_ID : undefined;
    const activeOption = tidalOption ?? deezerOption;
    const activeLabel = activeServiceId === TIDAL_SERVICE_ID ? "Tidal" : "Deezer";

    if (!activeOption || !activeServiceId) {
      return uc.StatusCodes.NotFound;
    }

    const shouldTraceSelection = activeServiceId === TIDAL_SERVICE_ID ? consumeTraceNextTidalSelectionAfterMainMenu(entityId) : consumeTraceNextDeezerSelectionAfterMainMenu(entityId);
    const activeOptions = activeServiceId === TIDAL_SERVICE_ID ? listTidalMenuOptions(entityId) : listDeezerMenuOptions(entityId);

    const requestedTitle = /^Menu \d+$/.test(activeOption.title) ? activeOptions.find((item) => item.menuIndex === activeOption.menuIndex)?.title : activeOption.title;
    if (shouldTraceSelection) {
      const cached = activeOptions
        .slice(0, 12)
        .map((item) => `${item.menuIndex}:${item.title}`)
        .join(", ");
      log.info("%s [%s] TRACE cached %s menu before command: [%s] requestedTitle='%s'", integrationName, entityId, activeLabel, cached, requestedTitle ?? "");
    }

    const cachedOption = activeOptions.find((item) => item.menuIndex === activeOption.menuIndex) ?? (requestedTitle ? activeOptions.find((item) => item.title === requestedTitle) : undefined);
    const selectedIsBrowsable = cachedOption?.isBrowsable ?? activeOption.isBrowsable;
    const selectedTitle = cachedOption?.title ?? requestedTitle ?? activeOption.title;

    const currentSource = this.avrStateApi.getSource(entityId);
    const currentSubSource = this.avrStateApi.getSubSource(entityId);
    if (!isBrowseServiceActive(currentSource, currentSubSource, activeServiceId)) {
      await this.selectBrowseService(entityId, activeServiceId, setZonePrefix, netMenuDelay, { delayAfterSelect: true });
    } else if (!selectedIsBrowsable) {
      const alreadyInListMode = activeServiceId === TIDAL_SERVICE_ID ? consumeTidalListModeActive(entityId) : consumeDeezerListModeActive(entityId);
      if (!alreadyInListMode) {
        const playbackStatus = this.avrStateApi.getPlaybackStatus(entityId);
        if (playbackStatus === "playing" || playbackStatus === "paused" || playbackStatus === "ff" || playbackStatus === "fr") {
          await this.eiscp.command(setZonePrefix("network-usb list"));
          await delay(netMenuDelay);
        }
      }
    }

    let menuIndexToSelect = activeOption.menuIndex;
    if (requestedTitle) {
      const remapped = activeOptions.find((item) => item.title === requestedTitle);
      if (remapped && remapped.menuIndex !== activeOption.menuIndex) {
        log.debug("%s [%s] remapped %s selection '%s' from index %d to %d", integrationName, entityId, activeLabel, requestedTitle, activeOption.menuIndex, remapped.menuIndex);
        menuIndexToSelect = remapped.menuIndex;
      }
    }

    if (shouldTraceSelection) {
      log.info("%s [%s] TRACE final %s selection index=%d source=%s subsource=%s", integrationName, entityId, activeLabel, menuIndexToSelect, currentSource, currentSubSource);
    }

    if (activeServiceId === TIDAL_SERVICE_ID) {
      const tidalState = getTidalBrowseState(entityId);
      if (tidalState) {
        tidalState.browseListFrozen = !selectedIsBrowsable;
        if (!selectedIsBrowsable) {
          tidalState.nowPlayingTitle = selectedTitle;
        }
      }
    } else {
      const deezerState = getDeezerBrowseState(entityId);
      if (deezerState) {
        deezerState.browseListFrozen = !selectedIsBrowsable;
        if (!selectedIsBrowsable) {
          deezerState.nowPlayingTitle = selectedTitle;
        }
      }
    }
    await this.eiscp.raw(`NLSI${String(menuIndexToSelect).padStart(5, "0")}`);
    return uc.StatusCodes.Ok;
  }
}
