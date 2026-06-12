import * as uc from "@unfoldedcircle/integration-api";
import { EiscpDriver } from "./eiscp.js";
import { ICommandReceiver } from "./types.js";
import log from "./loggers.js";
import { delay } from "./utils.js";
import {
  isTidalMainMenuRequest,
  isTuneInMenuRootRequest,
  resolveTidalMenuOption,
  resolveTuneInMenuOption,
  resolveTuneInPreset,
  TIDAL_BACK_ID,
  TIDAL_ROOT_TYPE,
  TUNEIN_MENU_BACK_ID,
  TUNEIN_MENU_ROOT_TYPE
} from "./mediaBrowser.js";
import { avrStateManager } from "./avrState.js";
import { consumeTidalListModeActive, consumeTraceNextTidalSelectionAfterMainMenu, getTidalBrowseState, listTidalMenuOptions } from "./tidalBrowserStore.js";
import { consumeTuneInListModeActive, setTuneInMenuBrowseFrozen, setTuneInMenuNowPlayingStation } from "./tuneInMenuStore.js";
import { DEFAULT_QUEUE_THRESHOLD } from "./configManager.js";
import {
  getBrowseServiceSelectSourceCommand,
  isBrowseServiceActive,
  TIDAL_SERVICE_ID,
  TUNEIN_SERVICE_ID,
  type BrowseServiceId
} from "./browseServiceContract.js";

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
  preset: any,
  tuneInRootRequest: boolean,
  tuneInMenuOption: any,
  tidalMainMenu: boolean,
  tidalOption: any,
  tuneInBackRequest: boolean,
  tidalBackRequest: boolean
): boolean {
  return !!(preset || tuneInRootRequest || tuneInMenuOption || tidalMainMenu || tidalOption || tuneInBackRequest || tidalBackRequest);
}

export class PlayMediaCommandHandler {
  constructor(
    private readonly eiscp: EiscpDriver,
    private readonly commandReceiver: ICommandReceiver | undefined
  ) {}

  private async selectBrowseService(
    entityId: string,
    serviceId: BrowseServiceId,
    setZonePrefix: ZonePrefixFn,
    netMenuDelay: number,
    options?: { force?: boolean; delayAfterSelect?: boolean }
  ): Promise<void> {
    const currentSource = avrStateManager.getSource(entityId);
    const currentSubSource = avrStateManager.getSubSource(entityId);
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
    const tidalOption = resolveTidalMenuOption(mediaId, mediaType);
    const tuneInBackRequest = isBackRequest(mediaId, mediaType, TUNEIN_MENU_BACK_ID, TUNEIN_MENU_ROOT_TYPE);
    const tidalBackRequest = isBackRequest(mediaId, mediaType, TIDAL_BACK_ID, TIDAL_ROOT_TYPE);

    if (!isValidPlayMediaRequest(preset, tuneInRootRequest, tuneInMenuOption, tidalMainMenu, tidalOption, tuneInBackRequest, tidalBackRequest)) {
      return uc.StatusCodes.NotFound;
    }

    if (tuneInBackRequest || tidalBackRequest) {
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
          const playbackStatus = avrStateManager.getPlaybackStatus(entityId);
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

    if (!tidalOption) {
      return uc.StatusCodes.NotFound;
    }

    const shouldTraceSelection = consumeTraceNextTidalSelectionAfterMainMenu(entityId);

    const requestedTitle = /^Menu \d+$/.test(tidalOption.title) ? listTidalMenuOptions(entityId).find((item) => item.menuIndex === tidalOption.menuIndex)?.title : tidalOption.title;
    if (shouldTraceSelection) {
      const cached = listTidalMenuOptions(entityId)
        .slice(0, 12)
        .map((item) => `${item.menuIndex}:${item.title}`)
        .join(", ");
      log.info("%s [%s] TRACE cached Tidal menu before command: [%s] requestedTitle='%s'", integrationName, entityId, cached, requestedTitle ?? "");
    }

    const currentSource = avrStateManager.getSource(entityId);
    const currentSubSource = avrStateManager.getSubSource(entityId);
    if (!isBrowseServiceActive(currentSource, currentSubSource, TIDAL_SERVICE_ID)) {
      await this.selectBrowseService(entityId, TIDAL_SERVICE_ID, setZonePrefix, netMenuDelay, { delayAfterSelect: true });
    } else if (!tidalOption.isBrowsable) {
      const alreadyInListMode = consumeTidalListModeActive(entityId);
      if (!alreadyInListMode) {
        const playbackStatus = avrStateManager.getPlaybackStatus(entityId);
        if (playbackStatus === "playing" || playbackStatus === "paused" || playbackStatus === "ff" || playbackStatus === "fr") {
          await this.eiscp.command(setZonePrefix("network-usb list"));
          await delay(netMenuDelay);
        }
      }
    }

    let menuIndexToSelect = tidalOption.menuIndex;
    if (requestedTitle) {
      const remapped = listTidalMenuOptions(entityId).find((item) => item.title === requestedTitle);
      if (remapped && remapped.menuIndex !== tidalOption.menuIndex) {
        log.debug("%s [%s] remapped Tidal selection '%s' from index %d to %d", integrationName, entityId, requestedTitle, tidalOption.menuIndex, remapped.menuIndex);
        menuIndexToSelect = remapped.menuIndex;
      }
    }

    if (shouldTraceSelection) {
      log.info("%s [%s] TRACE final Tidal selection index=%d source=%s subsource=%s", integrationName, entityId, menuIndexToSelect, currentSource, currentSubSource);
    }

    const tidalState = getTidalBrowseState(entityId);
    if (tidalState) tidalState.browseListFrozen = !tidalOption.isBrowsable;
    await this.eiscp.raw(`NLSI${String(menuIndexToSelect).padStart(5, "0")}`);
    return uc.StatusCodes.Ok;
  }
}