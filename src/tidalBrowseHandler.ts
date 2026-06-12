/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import { browseMedia, isTidalMainMenuRequest, isTidalBackRequest, resolveTidalMenuOption, TIDAL_BACK_ID, TIDAL_ROOT_ID, TIDAL_ROOT_TYPE } from "./mediaBrowser.js";
import { listTidalMenuOptions, resetTidalBrowseState, getTidalBrowseState } from "./tidalBrowserStore.js";
import { ConfigManager, AVR_DEFAULTS, buildEntityId } from "./configManager.js";
import log from "./loggers.js";
import { MenuBrowseHandlerBase } from "./menuBrowseHandlerBase.js";

const integrationName = "tidalBrowseHandler:";

type CmdHandlerFn = (entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }) => Promise<uc.StatusCodes>;
type RawSendFn = (cmd: string) => Promise<void>;

// Encapsulates Tidal browse/harvest logic for a media player entity. One instance shared per EntityRegistrar so the NLAL sequence counter (globally unique per physical AVR session) is managed in a single place.
export class TidalBrowseHandler extends MenuBrowseHandlerBase {
  protected readonly integrationName = integrationName;
  protected phase2HarvestEnabled = true;

  protected getServiceLabel(): string {
    return "Tidal";
  }

  private tidalListSequence = 0;

  protected nextListSequence(): string {
    const seq = this.tidalListSequence & 0xffff;
    this.tidalListSequence = (this.tidalListSequence + 1) & 0xffff;
    return seq.toString(16).padStart(4, "0").toUpperCase();
  }

  protected getMenuState(entityId: string) {
    return getTidalBrowseState(entityId);
  }

  protected listMenuItems(entityId: string) {
    return listTidalMenuOptions(entityId);
  }

  protected getMenuDelay(entityId: string): number {
    const cfg = ConfigManager.get();
    const avr = cfg?.avrs?.find((a) => buildEntityId(a.model, a.ip, a.zone) === entityId);
    return avr?.netMenuDelay ?? AVR_DEFAULTS.netMenuDelay;
  }

  protected getContiguousItemCount(entityId: string): number {
    const state = getTidalBrowseState(entityId);
    if (!state || state.optionsByMenuIndex.size === 0) return 0;

    const keys = [...state.optionsByMenuIndex.keys()].sort((a, b) => a - b);
    let expected = 1;
    for (const key of keys) {
      if (key !== expected) break;
      expected++;
    }
    return expected - 1;
  }

  // Handle a browse request. Returns a result for Tidal requests, or `undefined` when the request is not Tidal-related (caller should delegate to browseMedia).
  async browse(
    entityId: string,
    options: uc.BrowseOptions,
    mediaPlayerEntity: uc.MediaPlayer,
    cmdHandler: CmdHandlerFn | undefined,
    rawSend: RawSendFn | undefined
  ): Promise<uc.StatusCodes | uc.BrowseResult | undefined> {
    const tidalMainMenu = isTidalMainMenuRequest(options.media_id, options.media_type);
    const tidalBackRequest = isTidalBackRequest(options.media_id, options.media_type);
    const tidalSelection = resolveTidalMenuOption(options.media_id, options.media_type);

    if (tidalBackRequest && cmdHandler) {
      const beforeSignature = this.buildMenuSignature(entityId);
      const menuDelay = this.getMenuDelay(entityId);
      log.info("%s [%s] sending Tidal Back command to AVR", integrationName, entityId);
      await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
        media_id: TIDAL_BACK_ID,
        media_type: TIDAL_ROOT_TYPE
      });
      await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
      if (rawSend) {
        const browseState = getTidalBrowseState(entityId);
        if (browseState) {
          browseState.browseListFrozen = false;
          browseState.listModeActive = true;
        }
        await this.harvestListItems(entityId, rawSend);
      }
      return browseMedia(entityId, {
        ...options,
        media_id: TIDAL_ROOT_ID,
        media_type: TIDAL_ROOT_TYPE
      });
    }

    if (tidalMainMenu && cmdHandler) {
      // Tidal Main Menu selection
      resetTidalBrowseState(entityId);
      const browseState = getTidalBrowseState(entityId);
      if (browseState) browseState.traceNextSelectionAfterMainMenu = true;
      log.info("%s [%s] Tidal Main Menu selected; next Tidal selection will be traced", integrationName, entityId);
      await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
        media_id: String(options.media_id),
        media_type: TIDAL_ROOT_TYPE
      });

      const beforeSignature = this.buildMenuSignature(entityId);
      const menuDelay = this.getMenuDelay(entityId);

      await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
      if (browseState) browseState.listModeActive = true;
      if (rawSend) {
        await this.harvestListItems(entityId, rawSend);
      }

      return browseMedia(entityId, {
        ...options,
        media_id: TIDAL_ROOT_ID,
        media_type: TIDAL_ROOT_TYPE
      });
    }

    if (tidalSelection && cmdHandler) {
      const browseState = getTidalBrowseState(entityId);
      if (browseState) browseState.showMainMenuShortcut = true;

      // Only navigate on fresh selections (offset=0); skip re-navigation on paging scrolls.
      if ((options.paging?.offset ?? 0) === 0) {
        await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
          media_id: tidalSelection.mediaId,
          media_type: TIDAL_ROOT_TYPE
        });

        if (tidalSelection.isBrowsable) {
          const beforeSignature = this.buildMenuSignature(entityId);
          const menuDelay = this.getMenuDelay(entityId);

          await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
          if (browseState) browseState.listModeActive = true;
          if (rawSend) {
            await this.harvestListItems(entityId, rawSend);
          }
        }
      }

      return browseMedia(entityId, {
        ...options,
        media_id: TIDAL_ROOT_ID,
        media_type: TIDAL_ROOT_TYPE
      });
    }

    return undefined;
  }
}
