/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import { browseMedia, isTidalMainMenuRequest, resolveTidalMenuOption, TIDAL_ROOT_ID, TIDAL_ROOT_TYPE } from "./mediaBrowser.js";
import { listTidalMenuOptions, getContiguousItemCount, resetTidalBrowseState, getTidalBrowseState } from "./tidalBrowserStore.js";
import { ConfigManager, AVR_DEFAULTS, buildEntityId } from "./configManager.js";
import log from "./loggers.js";
import { delay, toHex } from "./utils.js";

const integrationName = "tidalBrowseHandler:";

type CmdHandlerFn = (entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }) => Promise<uc.StatusCodes>;
type RawSendFn = (cmd: string) => Promise<void>;

// Encapsulates Tidal browse/harvest logic for a media player entity. One instance shared per EntityRegistrar so the NLAL sequence counter (globally unique per physical AVR session) is managed in a single place.
export class TidalBrowseHandler {
  private tidalListSequence = 0;

  private nextTidalListSequence(): string {
    const seq = this.tidalListSequence & 0xffff;
    this.tidalListSequence = (this.tidalListSequence + 1) & 0xffff;
    return toHex(seq, 4);
  }

  private buildMenuSignature(entityId: string): string {
    const options = listTidalMenuOptions(entityId);
    return options.map((item) => `${item.menuIndex}:${item.title}`).join("|");
  }

  // Wait for the Tidal menu cache to change from beforeSignature and then stabilize, ensuring the full NLS stream is ingested.
  private async waitForMenuStable(entityId: string, beforeSignature: string, menuDelay: number): Promise<void> {
    const tick = Math.max(120, Math.floor(menuDelay / 2));
    const deadline = Date.now() + Math.max(menuDelay * 3, 1800);
    let lastSignature = beforeSignature;
    let changed = false;

    do {
      await delay(tick);
      const current = this.buildMenuSignature(entityId);
      if (!changed) {
        if (current && current !== lastSignature) {
          changed = true;
          lastSignature = current;
        }
      } else {
        // Signature already changed once — wait for it to stop changing
        if (current === lastSignature) {
          break; // stable
        }
        lastSignature = current;
      }
    } while (Date.now() < deadline);
  }

  /**
   * Send NLAL requests for Tidal to retrieve list items as XML.
   *
   * Phase 1 (awaited by caller): collects all items up to the count the AVR initially
   * reported in its first NLT — typically 50. The browse callback awaits this so that
   * the remote sees those items immediately in the first browse response.
   *
   * Phase 2 (background): Tidal uses two-phase NLT loading — the AVR emits a second NLT
   * with the real total once the service finishes buffering. Phase 2 fires in the
   * background after the browse has already returned, fetching any additional items.
   */
  private async harvestListItems(entityId: string, menuDelay: number, rawSend: RawSendFn): Promise<void> {
    // Guard: don't start a second harvest if one is already running.
    const state = getTidalBrowseState(entityId);
    if (!state || state.harvestMode) return;

    if (state.totalListItemCount <= 0) return;

    const currentCount = listTidalMenuOptions(entityId).length;
    if (currentCount >= state.totalListItemCount) return;

    const scanDelay = Math.max(150, Math.min(Math.floor(menuDelay / 3), 400));

    // Use the layer number from the NLT ll field — it's the exact layer NLAL needs. Try that layer first, then neighbours as fallback.
    const knownLayer = state.nlsLayerNumber;
    const layersToTry = knownLayer > 0 ? [knownLayer, knownLayer - 1, knownLayer + 1].filter((l) => l > 0).map((l) => toHex(l, 2)) : ["02", "01", "03"];

    // log.info("%s [%s] Tidal NLAL harvest: need %d items, have %d, trying layers %s", integrationName, entityId, state.totalListItemCount, currentCount, layersToTry.join(","));

    state.harvestMode = true;
    try {
      // Phase 1 (awaited): fetch items up to the initially reported total.
      await this.harvestNlalChunks(entityId, layersToTry, scanDelay, rawSend);
    } catch (e) {
      state.harvestMode = false;
      throw e;
    }

    // Phase 1 done — caller proceeds to return the browse response with these items. Phase 2 runs in the background: wait for a potential second NLT that raises the total (e.g. 50 → 639), then fetch the remaining items chunk by chunk.
    void (async () => {
      try {
        await delay(scanDelay * 2);
        const collectedAfterPhase1 = listTidalMenuOptions(entityId).length;
        if (state.totalListItemCount > collectedAfterPhase1) {
          // log.info("%s [%s] Tidal NLAL harvest phase 2: total updated to %d, have %d", integrationName, entityId, state.totalListItemCount, collectedAfterPhase1);
          await this.harvestNlalChunks(entityId, layersToTry, scanDelay, rawSend);
        }
      } finally {
        state.harvestMode = false;
        // log.info("%s [%s] Tidal NLAL harvest complete: %d/%d items", integrationName, entityId, listTidalMenuOptions(entityId).length, state.totalListItemCount);
      }
    })();
  }

  // Send NLAL requests in a loop until all items up to the current total are collected, or until a pass produces no new items (genuine stuck / wrong layer for every attempt).
  private async harvestNlalChunks(entityId: string, layersToTry: string[], scanDelay: number, rawSend: RawSendFn): Promise<void> {
    const state = getTidalBrowseState(entityId);
    if (!state) return;
    let lastContiguous = -1;
    while (true) {
      const contiguous = getContiguousItemCount(entityId);
      if (contiguous >= state.totalListItemCount) break;
      if (contiguous === lastContiguous) break; // no progress on any layer — give up
      lastContiguous = contiguous;

      for (const layer of layersToTry) {
        const offset = getContiguousItemCount(entityId);
        const offsetHex = toHex(offset, 4);
        await rawSend(`NLAL${this.nextTidalListSequence()}${layer}${offsetHex}03E7`);
        await delay(scanDelay);
        if (getContiguousItemCount(entityId) >= state.totalListItemCount) return;
      }
      // Small extra wait so the last NLA XML from this pass can arrive before we re-check.
      await delay(scanDelay);
    }
  }

  private getMenuDelay(entityId: string): number {
    const cfg = ConfigManager.get();
    const avr = cfg?.avrs?.find((a) => buildEntityId(a.model, a.ip, a.zone) === entityId);
    return avr?.netMenuDelay ?? AVR_DEFAULTS.netMenuDelay;
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
    const tidalSelection = resolveTidalMenuOption(options.media_id, options.media_type);

    if (tidalMainMenu && cmdHandler) {
      // Main Tidal Menu selection
      resetTidalBrowseState(entityId);
      const browseState = getTidalBrowseState(entityId);
      if (browseState) browseState.traceNextSelectionAfterMainMenu = true;
      // log.info("%s [%s] Main Tidal Menu selected; next Tidal selection will be traced", integrationName, entityId);
      await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
        media_id: String(options.media_id),
        media_type: TIDAL_ROOT_TYPE
      });

      const beforeSignature = this.buildMenuSignature(entityId);
      const menuDelay = this.getMenuDelay(entityId);

      await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
      if (browseState) browseState.listModeActive = true;
      if (rawSend) {
        await this.harvestListItems(entityId, menuDelay, rawSend);
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
            await this.harvestListItems(entityId, menuDelay, rawSend);
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
