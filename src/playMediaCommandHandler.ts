import type { MediaBrowserServices } from "./mediaBrowserServices.js";
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
  resolveTuneInPreset,
  TIDAL_BACK_ID,
  TIDAL_ROOT_TYPE,
  MUSIC_SERVER_BACK_ID,
  MUSIC_SERVER_ROOT_TYPE,
  TUNEIN_MENU_BACK_ID,
  TUNEIN_MENU_ROOT_TYPE
} from "./mediaBrowser.js";
import { getMenuBrowseService, xmlBrowseSelectCommand } from "./menuBrowseServices.js";
import { consumeTuneInListModeActive, getTuneInMenuBrowseState, resetTuneInMenuBrowseState, setTuneInMenuBrowseFrozen, setTuneInMenuNowPlayingStation } from "./tuneInMenuStore.js";
import type { TuneInPresetStore } from "./tuneInBrowserStore.js";
import type { AvrContextRegistry } from "./avrContext.js";
import { AVR_DEFAULTS, DEFAULT_QUEUE_THRESHOLD } from "./configManager.js";
import {
  DEEZER_SERVICE_ID,
  getBrowseServiceSelectSourceCommand,
  isBrowseServiceActive,
  TIDAL_SERVICE_ID,
  MUSIC_SERVER_SERVICE_ID,
  TUNEIN_SERVICE_ID,
  type BrowseServiceId
} from "./browseServiceContract.js";
import type { NetworkNavigationMode } from "./configConstants.js";

const logSource = "playMediaCommandHandler:";
// Modern (XML/NSV) navigation: opens TuneIn directly. The menu-browse services have theirs in menuBrowseServices.ts.
const TUNEIN_MODERN_SELECT_SOURCE_COMMAND = "NSV0E0";

type ZonePrefixFn = (cmd: string) => string;

export type PlayMediaCommandContext = {
  entityId: string;
  mediaId?: string;
  mediaType?: string;
  netMenuDelay?: number;
  networkNavigationMode?: NetworkNavigationMode;
  tuneinPresetPosition?: number;
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
    private readonly commandReceiver: ICommandReceiver | undefined,
    private readonly avrContexts: AvrContextRegistry,
    private readonly mediaServices: MediaBrowserServices
  ) {}

  private tuneInPresetsOf(entityId: string): TuneInPresetStore | undefined {
    return this.avrContexts.forEntity(entityId)?.tuneInPresets;
  }

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
    // The browse service ids are also the sub-source ids.
    this.avrStateApi.setSubSource(entityId, serviceId);

    const modern = (this.eiscp.eiscpConfig?.networkNavigationMode ?? "modern") !== "legacy";
    const menuService = getMenuBrowseService(serviceId);
    if (modern && serviceId === TUNEIN_SERVICE_ID) {
      await this.eiscp.raw(TUNEIN_MODERN_SELECT_SOURCE_COMMAND);
    } else if (modern && menuService) {
      await this.eiscp.raw(menuService.modernSelectSourceCommand);
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
    const modern = context.networkNavigationMode !== "legacy";

    const preset = resolveTuneInPreset(mediaId, mediaType);
    const tuneInMenuOption = this.mediaServices.resolveTuneInMenuOption(entityId, mediaId, mediaType);
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
      const configuredMode = this.eiscp.eiscpConfig?.networkNavigationMode ?? "modern";
      const cachedPreset = this.tuneInPresetsOf(entityId)?.get(preset.presetIndex);
      const presetMap = (this.tuneInPresetsOf(entityId)?.list("preset-order") ?? []).map((item) => `${item.presetIndex}='${item.title}'`).join(", ");
      log.debug(
        "%s [%s] TuneIn preset selection: mode=%s requested=%s index=%d station='%s' rawLabel='%s' presetMap=[%s]",
        logSource,
        entityId,
        configuredMode,
        mediaId ?? "",
        preset.presetIndex,
        cachedPreset?.title ?? "unknown",
        cachedPreset?.rawLabel ?? "unknown",
        presetMap
      );
      if (!modern) this.tuneInPresetsOf(entityId)?.setFrozen(true);
      const wasPreloading = this.commandReceiver?.abortTuneInPreload?.(entityId) ?? false;
      // Only force select if preload was interrupted; wasPreloading || undefined ensures false becomes undefined
      // so default logic (based on current state) applies when preload was not running
      await this.selectBrowseService(entityId, TUNEIN_SERVICE_ID, setZonePrefix, netMenuDelay, { force: wasPreloading || undefined });

      await this.eiscp.command(setZonePrefix(`tunein-preset ${preset.presetIndex}`));
      return uc.StatusCodes.Ok;
    }

    if (tuneInRootRequest) {
      await this.selectBrowseService(entityId, TUNEIN_SERVICE_ID, setZonePrefix, netMenuDelay, { force: true, delayAfterSelect: true });
      // The legacy NSS workflow already enters TuneIn's root (v0.8.10).
      // Only the modern direct-service path needs these additional steps.
      if (modern) {
        await this.eiscp.raw("NTCTOP");
        await delay(netMenuDelay);
        // NTCTOP reports the NET list. Wait for fresh TuneIn metadata after
        // SELECT instead of harvesting with that intermediate count/layer.
        resetTuneInMenuBrowseState(entityId, this.avrContexts);
        await this.eiscp.raw("NTCSELECT");
      }
      return uc.StatusCodes.Ok;
    }

    if (tuneInMenuOption) {
      await this.selectBrowseService(entityId, TUNEIN_SERVICE_ID, setZonePrefix, netMenuDelay, { delayAfterSelect: true });

      if (!tuneInMenuOption.isBrowsable) {
        if (!modern) this.tuneInPresetsOf(entityId)?.setFrozen(true);
        setTuneInMenuBrowseFrozen(entityId, true, this.avrContexts);
        setTuneInMenuNowPlayingStation(entityId, tuneInMenuOption.title, this.avrContexts);
        const alreadyInListMode = consumeTuneInListModeActive(entityId, this.avrContexts);
        if (!alreadyInListMode) {
          const playbackStatus = this.avrStateApi.getPlaybackStatus(entityId);
          if (playbackStatus === "playing" || playbackStatus === "paused" || playbackStatus === "ff" || playbackStatus === "fr") {
            await this.eiscp.command(setZonePrefix("network-usb list"));
            await delay(netMenuDelay);
          }
        }
      } else {
        if (!modern) this.tuneInPresetsOf(entityId)?.setFrozen(false);
        if (!modern) {
          // Resolve the selected row before clearing the old list: arbitrary
          // folders such as country names cannot be classified by name alone.
          resetTuneInMenuBrowseState(entityId, this.avrContexts);
          const state = getTuneInMenuBrowseState(entityId, this.avrContexts);
          if (state) state.showMainMenuShortcut = true;
        }
        setTuneInMenuBrowseFrozen(entityId, false, this.avrContexts);
      }

      if (!modern) {
        log.info("%s [%s] legacy TuneIn selection '%s': NLSI%s", logSource, entityId, tuneInMenuOption.title, String(tuneInMenuOption.menuIndex).padStart(5, "0"));
        await this.eiscp.raw(`NLSI${String(tuneInMenuOption.menuIndex).padStart(5, "0")}`);
      } else if (tuneInMenuOption.title.trim().toLowerCase() === "my presets") {
        await this.eiscp.raw(`NLSI${String(context.tuneinPresetPosition ?? AVR_DEFAULTS.tuneinPresetPosition).padStart(5, "0")}`);
      } else if (this.tuneInPresetsOf(entityId)?.state().contextTitle === "my presets") {
        // TuneIn's My Presets NLSI positions are one-based, even though the
        // XML browser's NLAI item indexes are zero-based.
        await this.eiscp.raw(`NLSI${String(Math.max(1, tuneInMenuOption.menuIndex)).padStart(5, "0")}`);
      } else {
        const tuneInState = getTuneInMenuBrowseState(entityId, this.avrContexts);
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
    const activeService = activeServiceId ? getMenuBrowseService(activeServiceId) : undefined;

    if (!activeOption || !activeServiceId || !activeService) {
      return uc.StatusCodes.NotFound;
    }
    const activeLabel = activeService.label;
    const activeStore = activeService.store;

    const shouldTraceSelection = activeStore.consumeTraceNextSelectionAfterMainMenu(entityId, this.avrContexts);
    const activeOptions = activeStore.listOptions(entityId, this.avrContexts);

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
    } else if (!modern && !selectedIsBrowsable) {
      const alreadyInListMode = activeStore.consumeListModeActive(entityId, this.avrContexts);
      if (!alreadyInListMode) {
        const playbackStatus = this.avrStateApi.getPlaybackStatus(entityId);
        if (["playing", "paused", "ff", "fr"].includes(playbackStatus)) {
          await this.eiscp.command(setZonePrefix("network-usb list"));
          await delay(netMenuDelay);
        }
      }
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

    const activeState = activeStore.getBrowseState(entityId, this.avrContexts);
    if (activeState) {
      activeState.browseListFrozen = !selectedIsBrowsable;
      if (!selectedIsBrowsable) {
        activeState.nowPlayingTitle = selectedTitle;
      }
    }
    if (modern) {
      log.info("%s [%s] selecting %s menu index=%d layer=%s title='%s'", logSource, entityId, activeLabel, menuIndexToSelect, activeState?.nlsLayerNumber ?? 0, selectedTitle);
      await this.eiscp.raw(xmlBrowseSelectCommand(menuIndexToSelect, activeState?.nlsLayerNumber));
    } else {
      await this.eiscp.raw(`NLSI${String(menuIndexToSelect).padStart(5, "0")}`);
    }
    return uc.StatusCodes.Ok;
  }
}
