import * as uc from "@unfoldedcircle/integration-api";
import log from "./loggers.js";
import { delay, toHex } from "./utils.js";

export type MenuHarvestState = {
  harvestMode: boolean;
  totalListItemCount: number;
  nlsLayerNumber: number;
};

export type MenuSignatureItem = {
  menuIndex: number;
  title: string;
};

export abstract class MenuBrowseHandlerBase {
  protected abstract readonly integrationName: string;
  protected abstract getServiceLabel(): string;
  protected abstract nextListSequence(): string;
  protected abstract getMenuState(entityId: string): MenuHarvestState | null;
  protected abstract listMenuItems(entityId: string): MenuSignatureItem[];
  protected abstract getContiguousItemCount(entityId: string): number;
  protected abstract getMenuDelay(entityId: string): number;
  protected phase2HarvestEnabled = false;

  protected buildMenuSignature(entityId: string): string {
    return this.listMenuItems(entityId).map((item) => `${item.menuIndex}:${item.title}`).join("|");
  }

  protected async waitForMenuStable(entityId: string, beforeSignature: string, menuDelay: number): Promise<void> {
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
        if (current === lastSignature) {
          break;
        }
        lastSignature = current;
      }
    } while (Date.now() < deadline);
  }

  protected async harvestListItems(entityId: string, rawSend: (cmd: string) => Promise<void>): Promise<void> {
    const state = this.getMenuState(entityId);
    if (!state || state.harvestMode) return;
    if (state.totalListItemCount <= 0) return;

    const currentCount = this.listMenuItems(entityId).length;
    if (currentCount >= state.totalListItemCount) return;

    const menuDelay = this.getMenuDelay(entityId);
    const scanDelay = Math.max(150, Math.min(Math.floor(menuDelay / 3), 400));
    const knownLayer = state.nlsLayerNumber;
    const layersToTry = knownLayer > 0 ? [knownLayer, knownLayer - 1, knownLayer + 1].filter((layer) => layer > 0).map((layer) => toHex(layer, 2)) : ["02", "01", "03"];

    log.info("%s [%s] %s NLAL harvest: need %d items, have %d, trying layers %s", this.integrationName, entityId, this.getServiceLabel(), state.totalListItemCount, currentCount, layersToTry.join(","));

    state.harvestMode = true;
    try {
      await this.harvestNlalChunks(entityId, layersToTry, scanDelay, rawSend);
    } catch (error) {
      state.harvestMode = false;
      throw error;
    }

    if (!this.phase2HarvestEnabled) {
      state.harvestMode = false;
      log.info("%s [%s] %s NLAL harvest complete: %d/%d items", this.integrationName, entityId, this.getServiceLabel(), this.listMenuItems(entityId).length, state.totalListItemCount);
      return;
    }

    void (async () => {
      try {
        await delay(scanDelay * 2);
        const collectedAfterPhase1 = this.listMenuItems(entityId).length;
        if (state.totalListItemCount > collectedAfterPhase1) {
          log.info("%s [%s] %s NLAL harvest phase 2: total updated to %d, have %d", this.integrationName, entityId, this.getServiceLabel(), state.totalListItemCount, collectedAfterPhase1);
          await this.harvestNlalChunks(entityId, layersToTry, scanDelay, rawSend);
        }
      } finally {
        state.harvestMode = false;
        log.info("%s [%s] %s NLAL harvest complete: %d/%d items", this.integrationName, entityId, this.getServiceLabel(), this.listMenuItems(entityId).length, state.totalListItemCount);
      }
    })();
  }

  private async harvestNlalChunks(entityId: string, layersToTry: string[], scanDelay: number, rawSend: (cmd: string) => Promise<void>): Promise<void> {
    const state = this.getMenuState(entityId);
    if (!state) return;

    let lastContiguous = -1;
    while (true) {
      const contiguous = this.getContiguousItemCount(entityId);
      if (contiguous >= state.totalListItemCount) break;
      if (contiguous === lastContiguous) break;
      lastContiguous = contiguous;

      for (const layer of layersToTry) {
        const offset = this.getContiguousItemCount(entityId);
        const offsetHex = toHex(offset, 4);
        await rawSend(`NLAL${this.nextListSequence()}${layer}${offsetHex}03E7`);
        await delay(scanDelay);
        if (this.getContiguousItemCount(entityId) >= state.totalListItemCount) return;
      }

      await delay(scanDelay);
    }
  }

}