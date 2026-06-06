/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import { browseMedia, TUNEIN_MENU_BACK_ID, TUNEIN_MENU_ROOT_ID, TUNEIN_MENU_ROOT_TYPE } from "./mediaBrowser.js";
import { listTuneInMenuOptions, getContiguousTuneInMenuItemCount, getTuneInMenuBrowseState } from "./tuneInMenuStore.js";
import { looksLikeTuneInDirectory } from "./tuneInFilters.js";
import { ConfigManager, AVR_DEFAULTS, buildEntityId } from "./configManager.js";
import { avrStateManager } from "./avrState.js";
import log from "./loggers.js";
import { delay, toHex } from "./utils.js";

const integrationName = "tuneInBrowseHandler:";

type CmdHandlerFn = (entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }) => Promise<uc.StatusCodes>;
type RawSendFn = (cmd: string) => Promise<void>;

type TuneInMenuSelection = {
  menuIndex: number;
  title: string;
  mediaId: string;
  isBrowsable: boolean;
};

function buildMenuSignature(entityId: string): string {
  const options = listTuneInMenuOptions(entityId);
  return options.map((item) => `${item.menuIndex}:${item.title}`).join("|");
}

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

export class TuneInBrowseHandler {
  private tuneInListSequence = 0;

  private nextTuneInListSequence(): string {
    const seq = this.tuneInListSequence & 0xffff;
    this.tuneInListSequence = (this.tuneInListSequence + 1) & 0xffff;
    return toHex(seq, 4);
  }

  private async waitForMenuStable(entityId: string, beforeSignature: string, menuDelay: number): Promise<void> {
    const tick = Math.max(120, Math.floor(menuDelay / 2));
    const deadline = Date.now() + Math.max(menuDelay * 3, 1800);
    let lastSignature = beforeSignature;
    let changed = false;

    do {
      await delay(tick);
      const current = buildMenuSignature(entityId);
      if (!changed) {
        if (current && current !== lastSignature) {
          changed = true;
          lastSignature = current;
        }
      } else {
        if (current === lastSignature) {
          break;
        }
        lastSignature = current;
      }
    } while (Date.now() < deadline);
  }

  private async harvestListItems(entityId: string, menuDelay: number, rawSend: RawSendFn): Promise<void> {
    const state = getTuneInMenuBrowseState(entityId);
    if (!state || state.harvestMode) return;
    if (state.totalListItemCount <= 0) return;

    const currentCount = listTuneInMenuOptions(entityId).length;
    if (currentCount >= state.totalListItemCount) return;

    const scanDelay = Math.max(150, Math.min(Math.floor(menuDelay / 3), 400));
    const knownLayer = state.nlsLayerNumber;
    const layersToTry = knownLayer > 0 ? [knownLayer, knownLayer - 1, knownLayer + 1].filter((l) => l > 0).map((l) => toHex(l, 2)) : ["02", "01", "03"];

    state.harvestMode = true;
    try {
      await this.harvestNlalChunks(entityId, layersToTry, scanDelay, rawSend);
    } finally {
      state.harvestMode = false;
      log.info("%s [%s] TuneIn NLAL harvest complete: %d/%d items", integrationName, entityId, listTuneInMenuOptions(entityId).length, state.totalListItemCount);
    }
  }

  private async harvestNlalChunks(entityId: string, layersToTry: string[], scanDelay: number, rawSend: RawSendFn): Promise<void> {
    const state = getTuneInMenuBrowseState(entityId);
    if (!state) return;
    let lastContiguous = -1;
    while (true) {
      const contiguous = getContiguousTuneInMenuItemCount(entityId);
      if (contiguous >= state.totalListItemCount) break;
      if (contiguous === lastContiguous) break;
      lastContiguous = contiguous;

      for (const layer of layersToTry) {
        const offset = getContiguousTuneInMenuItemCount(entityId);
        const offsetHex = toHex(offset, 4);
        await rawSend(`NLAL${this.nextTuneInListSequence()}${layer}${offsetHex}03E7`);
        await delay(scanDelay);
        if (getContiguousTuneInMenuItemCount(entityId) >= state.totalListItemCount) return;
      }
      await delay(scanDelay);
    }
  }

  async browse(
    entityId: string,
    options: uc.BrowseOptions,
    mediaPlayerEntity: uc.MediaPlayer,
    cmdHandler: CmdHandlerFn | undefined,
    rawSend: RawSendFn | undefined
  ): Promise<uc.StatusCodes | uc.BrowseResult | undefined> {
    if (!cmdHandler) return undefined;

    if (!isTuneInFullMenuEntity(entityId) || avrStateManager.getSubSource(entityId) !== "tunein") {
      return undefined;
    }

    const selection = resolveTuneInMenuSelection(entityId, options.media_id, options.media_type);
    const isBackRequest = options.media_id === TUNEIN_MENU_BACK_ID && (options.media_type === undefined || options.media_type === TUNEIN_MENU_ROOT_TYPE);
    const isExplicitMainMenuSelection = options.media_id === TUNEIN_MENU_ROOT_ID && options.media_type === TUNEIN_MENU_ROOT_TYPE;
    const isRootRequest = !options.media_id || isExplicitMainMenuSelection;
    const menuDelay = getMenuDelay(entityId);

    if (isBackRequest && cmdHandler) {
      const beforeSignature = buildMenuSignature(entityId);
      const menuDelay = getMenuDelay(entityId);
      log.info("%s [%s] sending TuneIn Back command to AVR", integrationName, entityId);
      await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
        media_id: TUNEIN_MENU_BACK_ID,
        media_type: TUNEIN_MENU_ROOT_TYPE
      });
      await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
      if (rawSend) {
        await this.harvestListItems(entityId, menuDelay, rawSend);
      }
      return browseMedia(entityId, {
        ...options,
        media_id: TUNEIN_MENU_ROOT_ID,
        media_type: TUNEIN_MENU_ROOT_TYPE
      });
    }

    if (isRootRequest) {
      const state = getTuneInMenuBrowseState(entityId);
      if (state) {
        state.browseListFrozen = false;
        if (isExplicitMainMenuSelection) {
          state.showMainMenuShortcut = false;
        }
      }

      if (state && (state.optionsByMenuIndex.size === 0 || isExplicitMainMenuSelection)) {
        log.info("%s [%s] Loading TuneIn full menu root", integrationName, entityId);
        await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
          media_id: TUNEIN_MENU_ROOT_ID,
          media_type: TUNEIN_MENU_ROOT_TYPE
        });

        const beforeSignature = buildMenuSignature(entityId);
        await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
        if (rawSend) {
          await this.harvestListItems(entityId, menuDelay, rawSend);
        }
      }
      return browseMedia(entityId, {
        ...options,
        media_id: TUNEIN_MENU_ROOT_ID,
        media_type: TUNEIN_MENU_ROOT_TYPE
      });
    }

    if (selection) {
      const browseState = getTuneInMenuBrowseState(entityId);
      if (browseState) browseState.showMainMenuShortcut = true;

      if ((options.paging?.offset ?? 0) === 0) {
        await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
          media_id: selection.mediaId,
          media_type: TUNEIN_MENU_ROOT_TYPE
        });

        if (selection.isBrowsable) {
          const beforeSignature = buildMenuSignature(entityId);
          await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
          if (browseState) browseState.listModeActive = true;
          if (rawSend) {
            await this.harvestListItems(entityId, menuDelay, rawSend);
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
