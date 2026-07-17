/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import {
  browseMedia,
  isMusicServerMainMenuRequest,
  isMusicServerBackRequest,
  resolveMusicServerMenuOption,
  MUSIC_SERVER_BACK_ID,
  MUSIC_SERVER_ROOT_ID,
  MUSIC_SERVER_ROOT_TYPE
} from "./mediaBrowser.js";
import { listMusicServerMenuOptions, resetMusicServerBrowseState, getMusicServerBrowseState } from "./musicServerBrowserStore.js";
import { ConfigManager, AVR_DEFAULTS, buildEntityId } from "./configManager.js";
import log from "./loggers.js";
import { delay } from "./utils.js";
import { MenuBrowseHandlerBase } from "./menuBrowseHandlerBase.js";

const integrationName = "musicServerBrowseHandler:";
const NLA_INGEST_POLL_INTERVAL_MS = 300;
const NLA_INGEST_TIMEOUT_MS = 3000;

type CmdHandlerFn = (entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }) => Promise<uc.StatusCodes>;
type RawSendFn = (cmd: string) => Promise<void>;

// Encapsulates Music Server browse/harvest logic for a media player entity. One instance shared per EntityRegistrar so the NLAL sequence counter (globally unique per physical AVR session) is managed in a single place.
export class MusicServerBrowseHandler extends MenuBrowseHandlerBase {
  protected readonly integrationName = integrationName;
  protected phase2HarvestEnabled = true;

  protected getServiceLabel(): string {
    return "Music Server";
  }

  private musicServerListSequence = 0;

  protected nextListSequence(): string {
    const seq = this.musicServerListSequence & 0xffff;
    this.musicServerListSequence = (this.musicServerListSequence + 1) & 0xffff;
    return seq.toString(16).padStart(4, "0").toUpperCase();
  }

  protected getMenuState(entityId: string) {
    return getMusicServerBrowseState(entityId);
  }

  protected listMenuItems(entityId: string) {
    return listMusicServerMenuOptions(entityId);
  }

  protected getMenuDelay(entityId: string): number {
    const cfg = ConfigManager.get();
    const avr = cfg?.avrs?.find((a) => buildEntityId(a.model, a.ip, a.zone) === entityId);
    return avr?.netMenuDelay ?? AVR_DEFAULTS.netMenuDelay;
  }

  protected getContiguousItemCount(entityId: string): number {
    const state = getMusicServerBrowseState(entityId);
    if (!state || state.optionsByMenuIndex.size === 0) return 0;

    const keys = [...state.optionsByMenuIndex.keys()].sort((a, b) => a - b);
    let expected = 1;
    for (const key of keys) {
      if (key !== expected) break;
      expected++;
    }
    return expected - 1;
  }

  // After NLAL harvest completes, wait for NLA XML data to arrive via the zone-agnostic adapter.
  // Music Server NLAL commands typically fail ("required data have not found"), so the full item list
  // arrives asynchronously via NLA XML responses. Poll until items increase or timeout.
  // Skip the wait when the visible items already cover the total (short lists).
  private async waitForNlaIngestion(entityId: string, itemCountBefore: number): Promise<void> {
    const state = getMusicServerBrowseState(entityId);
    const totalExpected = state?.totalListItemCount ?? 0;
    const currentCount = listMusicServerMenuOptions(entityId).length;
    if (totalExpected > 0 && currentCount >= totalExpected) {
      log.debug("%s [%s] NLA wait skipped: %d items already covers total %d", integrationName, entityId, currentCount, totalExpected);
      return;
    }

    const deadline = Date.now() + NLA_INGEST_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const count = listMusicServerMenuOptions(entityId).length;
      if (count > itemCountBefore) {
        log.info("%s [%s] NLA XML ingested: %d items (was %d)", integrationName, entityId, count, itemCountBefore);
        return;
      }
      await delay(NLA_INGEST_POLL_INTERVAL_MS);
    }
    log.debug("%s [%s] NLA XML ingestion wait timed out (%d items)", integrationName, entityId, listMusicServerMenuOptions(entityId).length);
  }

  // Handle a browse request. Returns a result for Music Server requests, or `undefined` when the request is not Music Server-related (caller should delegate to browseMedia).
  async browse(
    entityId: string,
    options: uc.BrowseOptions,
    mediaPlayerEntity: uc.MediaPlayer,
    cmdHandler: CmdHandlerFn | undefined,
    rawSend: RawSendFn | undefined
  ): Promise<uc.StatusCodes | uc.BrowseResult | undefined> {
    const musicServerMainMenu = isMusicServerMainMenuRequest(options.media_id, options.media_type);
    const musicServerBackRequest = isMusicServerBackRequest(options.media_id, options.media_type);
    const musicServerSelection = resolveMusicServerMenuOption(options.media_id, options.media_type);

    if (musicServerBackRequest && cmdHandler) {
      const beforeSignature = this.buildMenuSignature(entityId);
      const menuDelay = this.getMenuDelay(entityId);
      log.info("%s [%s] sending Music Server Back command to AVR", integrationName, entityId);
      await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
        media_id: MUSIC_SERVER_BACK_ID,
        media_type: MUSIC_SERVER_ROOT_TYPE
      });
      await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
      if (rawSend) {
        const browseState = getMusicServerBrowseState(entityId);
        if (browseState) {
          browseState.browseListFrozen = false;
          browseState.listModeActive = true;
        }
        const countBefore = listMusicServerMenuOptions(entityId).length;
        await this.harvestListItems(entityId, rawSend);
        await this.waitForNlaIngestion(entityId, countBefore);
      }
      return browseMedia(entityId, {
        ...options,
        media_id: MUSIC_SERVER_ROOT_ID,
        media_type: MUSIC_SERVER_ROOT_TYPE
      });
    }

    if (musicServerMainMenu && cmdHandler) {
      // Music Server Main Menu selection
      resetMusicServerBrowseState(entityId);
      const browseState = getMusicServerBrowseState(entityId);
      if (browseState) browseState.traceNextSelectionAfterMainMenu = true;
      log.info("%s [%s] Music Server Main Menu selected; next Music Server selection will be traced", integrationName, entityId);
      await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
        media_id: String(options.media_id),
        media_type: MUSIC_SERVER_ROOT_TYPE
      });

      const beforeSignature = this.buildMenuSignature(entityId);
      const menuDelay = this.getMenuDelay(entityId);

      await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
      if (browseState) browseState.listModeActive = true;
      if (rawSend) {
        const countBefore = listMusicServerMenuOptions(entityId).length;
        await this.harvestListItems(entityId, rawSend);
        await this.waitForNlaIngestion(entityId, countBefore);
      }

      return browseMedia(entityId, {
        ...options,
        media_id: MUSIC_SERVER_ROOT_ID,
        media_type: MUSIC_SERVER_ROOT_TYPE
      });
    }

    if (musicServerSelection && cmdHandler) {
      const browseState = getMusicServerBrowseState(entityId);
      if (browseState) browseState.showMainMenuShortcut = true;

      // Only navigate on fresh selections (offset=0); skip re-navigation on paging scrolls.
      if ((options.paging?.offset ?? 0) === 0) {
        await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
          media_id: musicServerSelection.mediaId,
          media_type: MUSIC_SERVER_ROOT_TYPE
        });

        if (musicServerSelection.isBrowsable) {
          const beforeSignature = this.buildMenuSignature(entityId);
          const menuDelay = this.getMenuDelay(entityId);

          await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
          if (browseState) browseState.listModeActive = true;
          if (rawSend) {
            const countBefore = listMusicServerMenuOptions(entityId).length;
            await this.harvestListItems(entityId, rawSend);
            await this.waitForNlaIngestion(entityId, countBefore);
          }
        }
      }

      return browseMedia(entityId, {
        ...options,
        media_id: MUSIC_SERVER_ROOT_ID,
        media_type: MUSIC_SERVER_ROOT_TYPE
      });
    }

    return undefined;
  }
}
