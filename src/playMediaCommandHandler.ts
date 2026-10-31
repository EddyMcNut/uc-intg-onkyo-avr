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
  isMusicServerMainMenuRequest,
  isTuneInMenuRootRequest,
  resolveDeezerMenuOption,
  resolveMusicServerMenuOption,
  resolveTidalMenuOption,
  resolveTuneInMenuOption,
  resolveTuneInPreset,
  TIDAL_BACK_ID,
  TIDAL_ROOT_TYPE,
  MUSIC_SERVER_BACK_ID,
  MUSIC_SERVER_ROOT_TYPE,
  TUNEIN_MENU_BACK_ID,
  TUNEIN_MENU_ROOT_TYPE
} from "./mediaBrowser.js";
import { consumeTraceNextTidalSelectionAfterMainMenu, getTidalBrowseState, listTidalMenuOptions } from "./tidalBrowserStore.js";
import { consumeTraceNextDeezerSelectionAfterMainMenu, getDeezerBrowseState, listDeezerMenuOptions } from "./deezerBrowserStore.js";
import { consumeTraceNextMusicServerSelectionAfterMainMenu, getMusicServerBrowseState, listMusicServerMenuOptions } from "./musicServerBrowserStore.js";
import { consumeTuneInListModeActive, getTuneInMenuBrowseState, setTuneInMenuBrowseFrozen, setTuneInMenuNowPlayingStation } from "./tuneInMenuStore.js";
import { getTuneInBrowseState } from "./tuneInBrowserStore.js";
import { AVR_DEFAULTS, ConfigManager, DEFAULT_QUEUE_THRESHOLD, buildEntityId } from "./configManager.js";
import {
  DEEZER_SERVICE_ID,
  getBrowseServiceSelectSourceCommand,
  isBrowseServiceActive,
  TIDAL_SERVICE_ID,
  MUSIC_SERVER_SERVICE_ID,
  TUNEIN_SERVICE_ID,
  type BrowseServiceId
} from "./browseServiceContract.js";

const logSource = "playMediaCommandHandler:";

// The AVR's XML music-server browser uses NLAI to select an item.  The
// older NLSI command selects an item in the ten-line display list and is not
// equivalent: it can appear to work for the first page, but does not follow
// the object/layer selected by the NLA/NLAL browser.  NLAI uses a zero-based
// item index, while our media IDs and store use one-based menu indices.
function musicServerSelectCommand(menuIndex: number, layerNumber: number | undefined): string {
  const layer = Math.max(1, layerNumber ?? 1)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  const index = Math.max(0, menuIndex - 1)
    .toString(16)
    .padStart(4, "0")
    .toUpperCase();
  return `NLAI${layer}${index}----`;
}

function xmlBrowseSelectCommand(menuIndex: number, layerNumber: number | undefined): string {
  const layer = Math.max(1, layerNumber ?? 1)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  const index = Math.max(0, menuIndex - 1)
    .toString(16)
    .padStart(4, "0")
    .toUpperCase();
  return `NLAI${layer}${index}----`;
}

type ZonePrefixFn = (cmd: string) => string;

function getTuneInPresetPosition(entityId: string): number {
  const cfg = ConfigManager.get();
  const avr = cfg?.avrs?.find((candidate) => buildEntityId(candidate.model, candidate.ip, candidate.zone) === entityId);
  return avr?.tuneinPresetPosition ?? AVR_DEFAULTS.tuneinPresetPosition;
}

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
  musicServerMainMenu: boolean,
  tidalOption: unknown,
  deezerOption: unknown,
  musicServerOption: unknown,
  tuneInBackRequest: boolean,
  tidalBackRequest: boolean,
  deezerBackRequest: boolean,
  musicServerBackRequest: boolean
): boolean {
  return !!(
    preset ||
    tuneInRootRequest ||
    tuneInMenuOption ||
    tidalMainMenu ||
    deezerMainMenu ||
    musicServerMainMenu ||
    tidalOption ||
    deezerOption ||
    musicServerOption ||
    tuneInBackRequest ||
    tidalBackRequest ||
    deezerBackRequest ||
    musicServerBackRequest
  );
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

    // Do not wait for the AVR's asynchronous NLT notification before routing
    // browse requests. A remote may ask for the root immediately after NSV;
    // keep that request from being handled by the previous service.
    const pendingSubSource =
      serviceId === TUNEIN_SERVICE_ID
        ? "tunein"
        : serviceId === MUSIC_SERVER_SERVICE_ID
          ? "music-server"
          : serviceId === TIDAL_SERVICE_ID
            ? "tidal"
            : serviceId === DEEZER_SERVICE_ID
              ? "deezer"
              : undefined;
    if (pendingSubSource) this.avrStateApi.setSubSource(entityId, pendingSubSource);

    if (serviceId === TUNEIN_SERVICE_ID) {
      await this.eiscp.raw("NSV0E0");
    } else if (serviceId === MUSIC_SERVER_SERVICE_ID) {
      await this.eiscp.raw("NSV000");
    } else if (serviceId === TIDAL_SERVICE_ID) {
      await this.eiscp.raw("NSV1B0");
    } else if (serviceId === DEEZER_SERVICE_ID) {
      await this.eiscp.raw("NSV120");
    } else {
      await this.eiscp.command(setZonePrefix(getBrowseServiceSelectSourceCommand(serviceId)));
    }
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
    const musicServerMainMenu = isMusicServerMainMenuRequest(mediaId, mediaType);
    const tidalOption = resolveTidalMenuOption(mediaId, mediaType);
    const deezerOption = resolveDeezerMenuOption(mediaId, mediaType);
    const musicServerOption = resolveMusicServerMenuOption(mediaId, mediaType);
    const tuneInBackRequest = isBackRequest(mediaId, mediaType, TUNEIN_MENU_BACK_ID, TUNEIN_MENU_ROOT_TYPE);
    const tidalBackRequest = isBackRequest(mediaId, mediaType, TIDAL_BACK_ID, TIDAL_ROOT_TYPE);
    const deezerBackRequest = isBackRequest(mediaId, mediaType, DEEZER_BACK_ID, DEEZER_ROOT_TYPE);
    const musicServerBackRequest = isBackRequest(mediaId, mediaType, MUSIC_SERVER_BACK_ID, MUSIC_SERVER_ROOT_TYPE);

    if (
      !isValidPlayMediaRequest(
        preset,
        tuneInRootRequest,
        tuneInMenuOption,
        tidalMainMenu,
        deezerMainMenu,
        musicServerMainMenu,
        tidalOption,
        deezerOption,
        musicServerOption,
        tuneInBackRequest,
        tidalBackRequest,
        deezerBackRequest,
        musicServerBackRequest
      )
    ) {
      return uc.StatusCodes.NotFound;
    }

    if (tuneInBackRequest || tidalBackRequest || deezerBackRequest || musicServerBackRequest) {
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
      await this.eiscp.raw("NTCTOP");
      await delay(netMenuDelay);
      await this.eiscp.raw("NTCSELECT");
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

      if (tuneInMenuOption.title.trim().toLowerCase() === "my presets") {
        await this.eiscp.raw(`NLSI${String(getTuneInPresetPosition(entityId)).padStart(5, "0")}`);
      } else if (getTuneInBrowseState(entityId)?.contextTitle === "my presets") {
        // TuneIn's My Presets NLSI positions are one-based, even though the
        // XML browser's NLAI item indexes are zero-based.
        await this.eiscp.raw(`NLSI${String(Math.max(1, tuneInMenuOption.menuIndex)).padStart(5, "0")}`);
      } else {
        const tuneInState = getTuneInMenuBrowseState(entityId);
        await this.eiscp.raw(xmlBrowseSelectCommand(tuneInMenuOption.menuIndex, tuneInState?.nlsLayerNumber));
      }
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

    if (musicServerMainMenu) {
      await this.selectBrowseService(entityId, MUSIC_SERVER_SERVICE_ID, setZonePrefix, netMenuDelay, { force: true });
      return uc.StatusCodes.Ok;
    }

    const activeServiceId = tidalOption ? TIDAL_SERVICE_ID : deezerOption ? DEEZER_SERVICE_ID : musicServerOption ? MUSIC_SERVER_SERVICE_ID : undefined;
    const activeOption = tidalOption ?? deezerOption ?? musicServerOption;
    const activeLabel = activeServiceId === TIDAL_SERVICE_ID ? "Tidal" : activeServiceId === DEEZER_SERVICE_ID ? "Deezer" : "Music Server";

    if (!activeOption || !activeServiceId) {
      return uc.StatusCodes.NotFound;
    }

    const shouldTraceSelection =
      activeServiceId === TIDAL_SERVICE_ID
        ? consumeTraceNextTidalSelectionAfterMainMenu(entityId)
        : activeServiceId === DEEZER_SERVICE_ID
          ? consumeTraceNextDeezerSelectionAfterMainMenu(entityId)
          : consumeTraceNextMusicServerSelectionAfterMainMenu(entityId);
    const activeOptions =
      activeServiceId === TIDAL_SERVICE_ID ? listTidalMenuOptions(entityId) : activeServiceId === DEEZER_SERVICE_ID ? listDeezerMenuOptions(entityId) : listMusicServerMenuOptions(entityId);

    const requestedTitle = /^Menu \d+$/.test(activeOption.title) ? activeOptions.find((item) => item.menuIndex === activeOption.menuIndex)?.title : activeOption.title;
    if (shouldTraceSelection) {
      const cached = activeOptions
        .slice(0, 12)
        .map((item) => `${item.menuIndex}:${item.title}`)
        .join(", ");
      log.info("%s [%s] TRACE cached %s menu before command: [%s] requestedTitle='%s'", logSource, entityId, activeLabel, cached, requestedTitle ?? "");
    }

    const cachedOption = activeOptions.find((item) => item.menuIndex === activeOption.menuIndex) ?? (requestedTitle ? activeOptions.find((item) => item.title === requestedTitle) : undefined);
    const selectedIsBrowsable = cachedOption?.isBrowsable ?? activeOption.isBrowsable;
    const selectedTitle = cachedOption?.title ?? requestedTitle ?? activeOption.title;

    const currentSource = this.avrStateApi.getSource(entityId);
    const currentSubSource = this.avrStateApi.getSubSource(entityId);
    if (!isBrowseServiceActive(currentSource, currentSubSource, activeServiceId)) {
      await this.selectBrowseService(entityId, activeServiceId, setZonePrefix, netMenuDelay, { delayAfterSelect: true });
    }

    let menuIndexToSelect = activeOption.menuIndex;
    if (requestedTitle) {
      const remapped = activeOptions.find((item) => item.title === requestedTitle);
      if (remapped && remapped.menuIndex !== activeOption.menuIndex) {
        log.debug("%s [%s] remapped %s selection '%s' from index %d to %d", logSource, entityId, activeLabel, requestedTitle, activeOption.menuIndex, remapped.menuIndex);
        menuIndexToSelect = remapped.menuIndex;
      }
    }

    if (shouldTraceSelection) {
      log.info("%s [%s] TRACE final %s selection index=%d source=%s subsource=%s", logSource, entityId, activeLabel, menuIndexToSelect, currentSource, currentSubSource);
    }

    if (activeServiceId === TIDAL_SERVICE_ID) {
      const tidalState = getTidalBrowseState(entityId);
      if (tidalState) {
        tidalState.browseListFrozen = !selectedIsBrowsable;
        if (!selectedIsBrowsable) {
          tidalState.nowPlayingTitle = selectedTitle;
        }
      }
    } else if (activeServiceId === DEEZER_SERVICE_ID) {
      const deezerState = getDeezerBrowseState(entityId);
      if (deezerState) {
        deezerState.browseListFrozen = !selectedIsBrowsable;
        if (!selectedIsBrowsable) {
          deezerState.nowPlayingTitle = selectedTitle;
        }
      }
    } else {
      const musicServerState = getMusicServerBrowseState(entityId);
      if (musicServerState) {
        musicServerState.browseListFrozen = !selectedIsBrowsable;
        if (!selectedIsBrowsable) {
          musicServerState.nowPlayingTitle = selectedTitle;
        }
      }
    }
    if (activeServiceId === MUSIC_SERVER_SERVICE_ID) {
      const musicServerState = getMusicServerBrowseState(entityId);
      log.info("%s [%s] selecting %s menu index=%d layer=%s title='%s'", logSource, entityId, activeLabel, menuIndexToSelect, musicServerState?.nlsLayerNumber ?? 0, selectedTitle);
      await this.eiscp.raw(musicServerSelectCommand(menuIndexToSelect, musicServerState?.nlsLayerNumber));
    } else if (activeServiceId === TIDAL_SERVICE_ID) {
      const tidalState = getTidalBrowseState(entityId);
      log.info("%s [%s] selecting %s menu index=%d layer=%s title='%s'", logSource, entityId, activeLabel, menuIndexToSelect, tidalState?.nlsLayerNumber ?? 0, selectedTitle);
      await this.eiscp.raw(xmlBrowseSelectCommand(menuIndexToSelect, tidalState?.nlsLayerNumber));
    } else if (activeServiceId === DEEZER_SERVICE_ID) {
      const deezerState = getDeezerBrowseState(entityId);
      log.info("%s [%s] selecting %s menu index=%d layer=%s title='%s'", logSource, entityId, activeLabel, menuIndexToSelect, deezerState?.nlsLayerNumber ?? 0, selectedTitle);
      await this.eiscp.raw(xmlBrowseSelectCommand(menuIndexToSelect, deezerState?.nlsLayerNumber));
    } else {
      await this.eiscp.raw(`NLSI${String(menuIndexToSelect).padStart(5, "0")}`);
    }
    return uc.StatusCodes.Ok;
  }
}
