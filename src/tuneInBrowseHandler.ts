/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import { browseMedia, TUNEIN_MENU_BACK_ID, TUNEIN_MENU_ROOT_ID, TUNEIN_MENU_ROOT_TYPE } from "./mediaBrowser.js";
import { listTuneInMenuOptions, getTuneInMenuBrowseState, resetTuneInMenuBrowseState } from "./tuneInMenuStore.js";
import { looksLikeTuneInDirectory } from "./tuneInFilters.js";
import { ConfigManager, AVR_DEFAULTS, buildEntityId } from "./configManager.js";
import type { AvrStateApi } from "./types.js";
import log from "./loggers.js";
import { MenuBrowseHandlerBase } from "./menuBrowseHandlerBase.js";

const logSource = "tuneInBrowseHandler:";

type CmdHandlerFn = (entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }) => Promise<uc.StatusCodes>;
type RawSendFn = (cmd: string) => Promise<void>;

type TuneInMenuSelection = {
  menuIndex: number;
  title: string;
  mediaId: string;
  isBrowsable: boolean;
};

function isTuneInFullMenuEntity(entityId: string): boolean {
  const cfg = ConfigManager.get();
  const avr = cfg?.avrs?.find((a) => buildEntityId(a.model, a.ip, a.zone) === entityId);
  return avr?.tuneinMenuStyle === "full";
}

function getMenuDelay(entityId: string): number {
  const cfg = ConfigManager.get();
  const avr = cfg?.avrs?.find((a) => buildEntityId(a.model, a.ip, a.zone) === entityId);
  return avr?.netMenuDelay ?? AVR_DEFAULTS.netMenuDelay;
}

function resolveTuneInMenuSelection(entityId: string, mediaId?: string, mediaType?: string): TuneInMenuSelection | undefined {
  if (!mediaId) {
    return undefined;
  }
  if (mediaType !== undefined && mediaType !== TUNEIN_MENU_ROOT_TYPE) {
    return undefined;
  }

  const match = mediaId.match(/^tunein:menu:(\d+):(.+)$/);
  if (!match) {
    return undefined;
  }

  const menuIndex = parseInt(match[1], 10);
  if (isNaN(menuIndex) || menuIndex < 1) {
    return undefined;
  }

  const decodedTitle = decodeURIComponent(match[2]);
  const option = listTuneInMenuOptions(entityId).find((item) => item.menuIndex === menuIndex);
  return {
    menuIndex,
    title: decodedTitle,
    mediaId,
    isBrowsable: option?.isBrowsable ?? looksLikeTuneInDirectory(decodedTitle)
  };
}

export class TuneInBrowseHandler extends MenuBrowseHandlerBase {
  protected readonly logSource = logSource;
  protected getServiceLabel(): string {
    return "TuneIn";
  }

  private tuneInListSequence = 0;

  constructor(private readonly avrStateApi: AvrStateApi) {
    super();
  }

  protected nextListSequence(): string {
    const seq = this.tuneInListSequence & 0xffff;
    this.tuneInListSequence = (this.tuneInListSequence + 1) & 0xffff;
    return seq.toString(16).padStart(4, "0").toUpperCase();
  }

  protected getMenuState(entityId: string) {
    return getTuneInMenuBrowseState(entityId);
  }

  protected listMenuItems(entityId: string) {
    return listTuneInMenuOptions(entityId);
  }

  protected getMenuDelay(entityId: string): number {
    return getMenuDelay(entityId);
  }

  protected getContiguousItemCount(entityId: string): number {
    const state = getTuneInMenuBrowseState(entityId);
    if (!state || state.optionsByMenuIndex.size === 0) return 0;

    const keys = [...state.optionsByMenuIndex.keys()].sort((a, b) => a - b);
    let expected = 1;
    for (const key of keys) {
      if (key !== expected) break;
      expected++;
    }
    return expected - 1;
  }

  async browse(
    entityId: string,
    options: uc.BrowseOptions,
    mediaPlayerEntity: uc.MediaPlayer,
    cmdHandler: CmdHandlerFn | undefined,
    rawSend: RawSendFn | undefined
  ): Promise<uc.StatusCodes | uc.BrowseResult | undefined> {
    if (!cmdHandler) return undefined;

    if (!isTuneInFullMenuEntity(entityId) || this.avrStateApi.getSubSource(entityId) !== "tunein") {
      return undefined;
    }

    const selection = resolveTuneInMenuSelection(entityId, options.media_id, options.media_type);
    const isBackRequest = options.media_id === TUNEIN_MENU_BACK_ID && (options.media_type === undefined || options.media_type === TUNEIN_MENU_ROOT_TYPE);
    const isExplicitMainMenuSelection = options.media_id === TUNEIN_MENU_ROOT_ID && options.media_type === TUNEIN_MENU_ROOT_TYPE;
    const isRootRequest = !options.media_id || isExplicitMainMenuSelection;
    const menuDelay = getMenuDelay(entityId);

    if (isBackRequest && cmdHandler) {
      const menuDelay = getMenuDelay(entityId);
      log.info("%s [%s] sending TuneIn Back command to AVR", logSource, entityId);
      resetTuneInMenuBrowseState(entityId);
      const backBrowseState = getTuneInMenuBrowseState(entityId);
      if (backBrowseState) {
        backBrowseState.showMainMenuShortcut = true;
        backBrowseState.listModeActive = true;
      }
      await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
        media_id: TUNEIN_MENU_BACK_ID,
        media_type: TUNEIN_MENU_ROOT_TYPE
      });
      await this.waitForListMetadata(entityId, menuDelay);
      if (rawSend) {
        await this.harvestListItems(entityId, rawSend);
      }
      return browseMedia(entityId, {
        ...options,
        media_id: TUNEIN_MENU_ROOT_ID,
        media_type: TUNEIN_MENU_ROOT_TYPE
      });
    }

    if (isRootRequest) {
      if (isExplicitMainMenuSelection) {
        resetTuneInMenuBrowseState(entityId);
      }
      const state = getTuneInMenuBrowseState(entityId);
      if (state) {
        state.browseListFrozen = false;
        if (isExplicitMainMenuSelection) {
          state.showMainMenuShortcut = false;
        }
      }

      if (state && (state.optionsByMenuIndex.size === 0 || isExplicitMainMenuSelection)) {
        log.info("%s [%s] Loading TuneIn full menu root", logSource, entityId);
        await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
          media_id: TUNEIN_MENU_ROOT_ID,
          media_type: TUNEIN_MENU_ROOT_TYPE
        });

        await this.waitForListMetadata(entityId, menuDelay);
        if (rawSend) {
          await this.harvestListItems(entityId, rawSend);
        }
      }
      return browseMedia(entityId, {
        ...options,
        media_id: TUNEIN_MENU_ROOT_ID,
        media_type: TUNEIN_MENU_ROOT_TYPE
      });
    }

    if (selection) {
      if (selection.isBrowsable && (options.paging?.offset ?? 0) === 0) {
        // A new TuneIn folder is a new XML context. Clear the previous
        // folder before harvesting so NLAL starts at offset 0 instead of
        // appending to the old menu.
        resetTuneInMenuBrowseState(entityId);
      }
      const browseState = getTuneInMenuBrowseState(entityId);
      if (browseState) browseState.showMainMenuShortcut = true;

      if ((options.paging?.offset ?? 0) === 0) {
        await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
          media_id: selection.mediaId,
          media_type: TUNEIN_MENU_ROOT_TYPE
        });

        if (selection.isBrowsable) {
          await this.waitForListMetadata(entityId, menuDelay);
          if (browseState) browseState.listModeActive = true;
          if (rawSend) {
            await this.harvestListItems(entityId, rawSend);
          }
        }
      }

      return browseMedia(entityId, {
        ...options,
        media_id: TUNEIN_MENU_ROOT_ID,
        media_type: TUNEIN_MENU_ROOT_TYPE
      });
    }

    return undefined;
  }
}
