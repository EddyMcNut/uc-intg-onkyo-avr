/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import { browseMedia, isDeezerMainMenuRequest, isDeezerBackRequest, resolveDeezerMenuOption, DEEZER_BACK_ID, DEEZER_ROOT_ID, DEEZER_ROOT_TYPE } from "./mediaBrowser.js";
import { listDeezerMenuOptions, resetDeezerBrowseState, getDeezerBrowseState } from "./deezerBrowserStore.js";
import { ConfigManager, AVR_DEFAULTS, buildEntityId } from "./configManager.js";
import log from "./loggers.js";
import { MenuBrowseHandlerBase } from "./menuBrowseHandlerBase.js";

const integrationName = "deezerBrowseHandler:";

type CmdHandlerFn = (entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }) => Promise<uc.StatusCodes>;
type RawSendFn = (cmd: string) => Promise<void>;

export class DeezerBrowseHandler extends MenuBrowseHandlerBase {
  protected readonly integrationName = integrationName;
  protected phase2HarvestEnabled = true;

  protected getServiceLabel(): string {
    return "Deezer";
  }

  private deezerListSequence = 0;

  protected nextListSequence(): string {
    const seq = this.deezerListSequence & 0xffff;
    this.deezerListSequence = (this.deezerListSequence + 1) & 0xffff;
    return seq.toString(16).padStart(4, "0").toUpperCase();
  }

  protected getMenuState(entityId: string) {
    return getDeezerBrowseState(entityId);
  }

  protected listMenuItems(entityId: string) {
    return listDeezerMenuOptions(entityId);
  }

  protected getMenuDelay(entityId: string): number {
    const cfg = ConfigManager.get();
    const avr = cfg?.avrs?.find((a) => buildEntityId(a.model, a.ip, a.zone) === entityId);
    return avr?.netMenuDelay ?? AVR_DEFAULTS.netMenuDelay;
  }

  protected getContiguousItemCount(entityId: string): number {
    const state = getDeezerBrowseState(entityId);
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
    const deezerMainMenu = isDeezerMainMenuRequest(options.media_id, options.media_type);
    const deezerBackRequest = isDeezerBackRequest(options.media_id, options.media_type);
    const deezerSelection = resolveDeezerMenuOption(options.media_id, options.media_type);

    if (deezerBackRequest && cmdHandler) {
      const beforeSignature = this.buildMenuSignature(entityId);
      const menuDelay = this.getMenuDelay(entityId);
      log.info("%s [%s] sending Deezer Back command to AVR", integrationName, entityId);
      await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
        media_id: DEEZER_BACK_ID,
        media_type: DEEZER_ROOT_TYPE
      });
      await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
      if (rawSend) {
        const browseState = getDeezerBrowseState(entityId);
        if (browseState) {
          browseState.browseListFrozen = false;
          browseState.listModeActive = true;
        }
        await this.harvestListItems(entityId, rawSend);
      }
      return browseMedia(entityId, {
        ...options,
        media_id: DEEZER_ROOT_ID,
        media_type: DEEZER_ROOT_TYPE
      });
    }

    if (deezerMainMenu && cmdHandler) {
      resetDeezerBrowseState(entityId);
      const browseState = getDeezerBrowseState(entityId);
      if (browseState) browseState.traceNextSelectionAfterMainMenu = true;
      log.info("%s [%s] Deezer Main Menu selected; next Deezer selection will be traced", integrationName, entityId);
      await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
        media_id: String(options.media_id),
        media_type: DEEZER_ROOT_TYPE
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
        media_id: DEEZER_ROOT_ID,
        media_type: DEEZER_ROOT_TYPE
      });
    }

    if (deezerSelection && cmdHandler) {
      const browseState = getDeezerBrowseState(entityId);
      if (browseState) browseState.showMainMenuShortcut = true;

      if ((options.paging?.offset ?? 0) === 0) {
        await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
          media_id: deezerSelection.mediaId,
          media_type: DEEZER_ROOT_TYPE
        });

        if (deezerSelection.isBrowsable) {
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
        media_id: DEEZER_ROOT_ID,
        media_type: DEEZER_ROOT_TYPE
      });
    }

    return undefined;
  }
}
