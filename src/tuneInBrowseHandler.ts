/*jslint node:true nomen:true*/
"use strict";
import type { MediaBrowser } from "./mediaBrowser.js";
import type { AvrContextRegistry } from "./avrContext.js";
import * as uc from "@unfoldedcircle/integration-api";
import { TUNEIN_MENU_BACK_ID, TUNEIN_MENU_ROOT_ID, TUNEIN_MENU_ROOT_TYPE } from "./mediaBrowser.js";
import { listTuneInMenuOptions, getTuneInMenuBrowseState, resetTuneInMenuBrowseState } from "./tuneInMenuStore.js";
import { looksLikeTuneInDirectory } from "./tuneInFilters.js";
import { AVR_DEFAULTS, findAvrConfig, type ConfigSource } from "./configManager.js";
import type { AvrStateApi } from "./types.js";
import log from "./loggers.js";
import { MenuBrowseHandlerBase } from "./menuBrowseHandlerBase.js";
import { delay, toHex } from "./utils.js";

const logSource = "tuneInBrowseHandler:";

type CmdHandlerFn = (entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }) => Promise<uc.StatusCodes>;
type RawSendFn = (cmd: string) => Promise<void>;

type TuneInMenuSelection = {
  menuIndex: number;
  title: string;
  mediaId: string;
  isBrowsable: boolean;
};

function resolveTuneInMenuSelection(entityId: string, mediaId: string | undefined, mediaType: string | undefined, contexts: AvrContextRegistry): TuneInMenuSelection | undefined {
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
  const option = listTuneInMenuOptions(entityId, contexts).find((item) => item.menuIndex === menuIndex);
  return {
    menuIndex,
    title: decodedTitle,
    mediaId,
    isBrowsable: option?.isBrowsable ?? looksLikeTuneInDirectory(decodedTitle)
  };
}

export class TuneInBrowseHandler extends MenuBrowseHandlerBase {
  protected readonly logSource = logSource;
  // Modern Full Menu has no NLS fallback: wait for the XML response rather
  // than returning an empty list after the short transport pacing delay.
  protected waitForXmlResponse = true;
  protected getServiceLabel(): string {
    return "TuneIn";
  }

  private tuneInListSequence = 0;

  private isLegacyNavigation(entityId: string): boolean {
    return findAvrConfig(this.configSource, entityId)?.networkNavigationMode === "legacy";
  }

  private isTuneInFullMenuEntity(entityId: string): boolean {
    return String(findAvrConfig(this.configSource, entityId)?.tuneinMenuStyle ?? "").toLowerCase() === "full";
  }

  private async waitForTuneInMenu(entityId: string, menuDelay: number): Promise<void> {
    if (this.isLegacyNavigation(entityId)) {
      await this.waitForMenuStable(entityId, "", menuDelay);
    } else {
      await this.waitForListMetadata(entityId, menuDelay);
    }
  }

  protected async harvestListItems(entityId: string, rawSend: RawSendFn): Promise<void> {
    if (!this.isLegacyNavigation(entityId)) return super.harvestListItems(entityId, rawSend);

    // v0.8.10: NLS supplies the first display window, then NLAL fills the
    // remaining rows, probing adjacent layers on older receivers.
    const state = getTuneInMenuBrowseState(entityId, this.avrContexts);
    if (!state || state.harvestMode || state.totalListItemCount <= this.getContiguousItemCount(entityId)) return;
    const menuDelay = this.getMenuDelay(entityId);
    const scanDelay = Math.max(150, Math.min(Math.floor(menuDelay / 3), 400));
    const knownLayer = state.nlsLayerNumber;
    const layers = knownLayer > 0 ? [knownLayer, knownLayer - 1, knownLayer + 1].filter((layer) => layer > 0).map((layer) => toHex(layer, 2)) : ["02", "01", "03"];
    const generation = state.harvestGeneration;
    state.harvestMode = true;
    try {
      let lastContiguous = -1;
      while (state.harvestGeneration === generation) {
        const contiguous = this.getContiguousItemCount(entityId);
        if (contiguous >= state.totalListItemCount || contiguous === lastContiguous) break;
        lastContiguous = contiguous;
        for (const layer of layers) {
          if (state.harvestGeneration !== generation) return;
          await rawSend(`NLAL${this.nextListSequence()}${layer}${toHex(this.getContiguousItemCount(entityId), 4)}03E7`);
          await delay(scanDelay);
          if (this.getContiguousItemCount(entityId) >= state.totalListItemCount) return;
        }
        await delay(scanDelay);
      }
    } finally {
      if (state.harvestGeneration === generation) state.harvestMode = false;
      log.info("%s [%s] legacy TuneIn NLAL harvest complete: %d/%d items", logSource, entityId, this.getContiguousItemCount(entityId), state.totalListItemCount);
    }
  }

  constructor(
    private readonly avrStateApi: AvrStateApi,
    private readonly avrContexts: AvrContextRegistry,
    private readonly mediaBrowser: MediaBrowser,
    private readonly configSource: ConfigSource
  ) {
    super();
  }

  protected nextListSequence(): string {
    const seq = this.tuneInListSequence & 0xffff;
    this.tuneInListSequence = (this.tuneInListSequence + 1) & 0xffff;
    return seq.toString(16).padStart(4, "0").toUpperCase();
  }

  protected getMenuState(entityId: string) {
    return getTuneInMenuBrowseState(entityId, this.avrContexts);
  }

  protected listMenuItems(entityId: string) {
    return listTuneInMenuOptions(entityId, this.avrContexts);
  }

  protected getMenuDelay(entityId: string): number {
    return findAvrConfig(this.configSource, entityId)?.netMenuDelay ?? AVR_DEFAULTS.netMenuDelay;
  }

  protected getContiguousItemCount(entityId: string): number {
    const state = getTuneInMenuBrowseState(entityId, this.avrContexts);
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

    if (!this.isTuneInFullMenuEntity(entityId) || this.avrStateApi.getSubSource(entityId) !== "tunein") {
      return undefined;
    }

    const selection = resolveTuneInMenuSelection(entityId, options.media_id, options.media_type, this.avrContexts);
    const isBackRequest = options.media_id === TUNEIN_MENU_BACK_ID && (options.media_type === undefined || options.media_type === TUNEIN_MENU_ROOT_TYPE);
    const isExplicitMainMenuSelection = options.media_id === TUNEIN_MENU_ROOT_ID && options.media_type === TUNEIN_MENU_ROOT_TYPE;
    const isRootRequest = !options.media_id || isExplicitMainMenuSelection;
    const menuDelay = this.getMenuDelay(entityId);

    if (isBackRequest && cmdHandler) {
      const menuDelay = this.getMenuDelay(entityId);
      log.info("%s [%s] sending TuneIn Back command to AVR", logSource, entityId);
      resetTuneInMenuBrowseState(entityId, this.avrContexts);
      const backBrowseState = getTuneInMenuBrowseState(entityId, this.avrContexts);
      if (backBrowseState) {
        backBrowseState.showMainMenuShortcut = true;
        backBrowseState.listModeActive = true;
      }
      await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
        media_id: TUNEIN_MENU_BACK_ID,
        media_type: TUNEIN_MENU_ROOT_TYPE
      });
      await this.waitForTuneInMenu(entityId, menuDelay);
      if (rawSend) {
        await this.harvestListItems(entityId, rawSend);
      }
      return this.mediaBrowser.browseMedia(entityId, {
        ...options,
        media_id: TUNEIN_MENU_ROOT_ID,
        media_type: TUNEIN_MENU_ROOT_TYPE
      });
    }

    if (isRootRequest) {
      if (isExplicitMainMenuSelection) {
        resetTuneInMenuBrowseState(entityId, this.avrContexts);
      }
      const state = getTuneInMenuBrowseState(entityId, this.avrContexts);
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

        await this.waitForTuneInMenu(entityId, menuDelay);
        if (rawSend) {
          await this.harvestListItems(entityId, rawSend);
        }
      }
      return this.mediaBrowser.browseMedia(entityId, {
        ...options,
        media_id: TUNEIN_MENU_ROOT_ID,
        media_type: TUNEIN_MENU_ROOT_TYPE
      });
    }

    if (selection) {
      if (!this.isLegacyNavigation(entityId) && selection.isBrowsable && (options.paging?.offset ?? 0) === 0) {
        // A new TuneIn folder is a new XML context. Clear the previous
        // folder before harvesting so NLAL starts at offset 0 instead of
        // appending to the old menu.
        resetTuneInMenuBrowseState(entityId, this.avrContexts);
      }
      const browseState = getTuneInMenuBrowseState(entityId, this.avrContexts);
      if (browseState) browseState.showMainMenuShortcut = true;

      if ((options.paging?.offset ?? 0) === 0) {
        await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
          media_id: selection.mediaId,
          media_type: TUNEIN_MENU_ROOT_TYPE
        });

        if (selection.isBrowsable) {
          await this.waitForTuneInMenu(entityId, menuDelay);
          if (browseState) browseState.listModeActive = true;
          if (rawSend) {
            await this.harvestListItems(entityId, rawSend);
          }
        }
      }

      return this.mediaBrowser.browseMedia(entityId, {
        ...options,
        media_id: TUNEIN_MENU_ROOT_ID,
        media_type: TUNEIN_MENU_ROOT_TYPE
      });
    }

    return undefined;
  }
}
