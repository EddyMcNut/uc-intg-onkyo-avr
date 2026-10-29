import log from "./loggers.js";
import { delay, toHex } from "./utils.js";

export type MenuHarvestState = {
  harvestMode: boolean;
  totalListItemCount: number;
  nlsLayerNumber: number;
  harvestGeneration?: number;
};

export type MenuSignatureItem = {
  menuIndex: number;
  title: string;
};

export abstract class MenuBrowseHandlerBase {
  // Observed in the Onkyo app: NLAL requests are paged in 20-item chunks.
  // Asking for 0x03E7 items makes this AVR stay on its ten-line display
  // window instead of returning the full XML list.
  private static readonly NLAL_PAGE_SIZE = "0014";

  protected abstract readonly logSource: string;
  protected abstract getServiceLabel(): string;
  protected abstract nextListSequence(): string;
  protected abstract getMenuState(entityId: string): MenuHarvestState | null;
  protected abstract listMenuItems(entityId: string): MenuSignatureItem[];
  protected abstract getContiguousItemCount(entityId: string): number;
  protected abstract getMenuDelay(entityId: string): number;
  protected phase2HarvestEnabled = false;

  protected buildMenuSignature(entityId: string): string {
    return this.listMenuItems(entityId)
      .map((item) => `${item.menuIndex}:${item.title}`)
      .join("|");
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

  protected async waitForListMetadata(entityId: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + Math.max(1000, timeoutMs);
    while (Date.now() < deadline) {
      const state = this.getMenuState(entityId);
      if ((state?.totalListItemCount ?? 0) > 0 || this.listMenuItems(entityId).length > 0) return;
      await delay(100);
    }
  }

  protected async waitForMenuItems(entityId: string, requiredCount: number, timeoutMs: number): Promise<void> {
    if (requiredCount <= 0) return;
    const deadline = Date.now() + Math.max(500, timeoutMs);
    while (Date.now() < deadline) {
      if (this.listMenuItems(entityId).length >= requiredCount) return;
      await delay(100);
    }
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
    const harvestGeneration = state.harvestGeneration ?? 0;
    // The layer belongs to the current AVR browse context. The app uses that
    // layer consistently; probing neighbouring layers concurrently can make
    // the AVR restart/replace the pending browse response.
    const layersToTry = knownLayer > 0 ? [toHex(knownLayer, 2)] : ["01"];

    log.info("%s [%s] %s NLAL harvest: need %d items, have %d, trying layers %s", this.logSource, entityId, this.getServiceLabel(), state.totalListItemCount, currentCount, layersToTry.join(","));

    state.harvestMode = true;
    try {
      // Load one correctly-sized page before returning the browse result. The
      // remaining pages are loaded by phase 2 so large NAS folders do not
      // block the first browse response.
      await this.harvestNlalChunks(entityId, layersToTry, scanDelay, rawSend, harvestGeneration, this.phase2HarvestEnabled ? 1 : Number.POSITIVE_INFINITY);
    } catch (error) {
      state.harvestMode = false;
      throw error;
    }

    if (!this.phase2HarvestEnabled) {
      state.harvestMode = false;
      log.info("%s [%s] %s NLAL harvest complete: %d/%d items", this.logSource, entityId, this.getServiceLabel(), this.listMenuItems(entityId).length, state.totalListItemCount);
      return;
    }

    void (async () => {
      try {
        if ((state.harvestGeneration ?? 0) !== harvestGeneration) return;
        await delay(scanDelay * 2);
        if ((state.harvestGeneration ?? 0) !== harvestGeneration) return;
        const collectedAfterPhase1 = this.listMenuItems(entityId).length;
        if (state.totalListItemCount > collectedAfterPhase1) {
          log.info("%s [%s] %s NLAL harvest phase 2: total updated to %d, have %d", this.logSource, entityId, this.getServiceLabel(), state.totalListItemCount, collectedAfterPhase1);
          await this.harvestNlalChunks(entityId, layersToTry, scanDelay, rawSend, harvestGeneration);
        }
      } finally {
        if ((state.harvestGeneration ?? 0) === harvestGeneration) {
          state.harvestMode = false;
          log.info("%s [%s] %s NLAL harvest complete: %d/%d items", this.logSource, entityId, this.getServiceLabel(), this.listMenuItems(entityId).length, state.totalListItemCount);
        }
      }
    })();
  }

  private async harvestNlalChunks(entityId: string, layersToTry: string[], scanDelay: number, rawSend: (cmd: string) => Promise<void>, harvestGeneration: number, maxRequests = Number.POSITIVE_INFINITY): Promise<void> {
    const state = this.getMenuState(entityId);
    if (!state) return;

    let lastContiguous = -1;
    let requestCount = 0;
    while (true) {
      const contiguous = this.getContiguousItemCount(entityId);
      if ((state.harvestGeneration ?? 0) !== harvestGeneration) return;
      if (contiguous >= state.totalListItemCount) break;
      if (contiguous === lastContiguous) break;
      if (requestCount >= maxRequests) break;
      lastContiguous = contiguous;

      for (const layer of layersToTry) {
        if ((state.harvestGeneration ?? 0) !== harvestGeneration) return;
        const offset = this.getContiguousItemCount(entityId);
        const offsetHex = toHex(offset, 4);
        const remaining = Math.max(1, state.totalListItemCount - offset);
        const pageSize = toHex(Math.min(parseInt(MenuBrowseHandlerBase.NLAL_PAGE_SIZE, 16), remaining), 4);
        await rawSend(`NLAL${this.nextListSequence()}${layer}${offsetHex}${pageSize}`);
        requestCount++;
        await delay(scanDelay);
        if ((state.harvestGeneration ?? 0) !== harvestGeneration) return;
        if (this.getContiguousItemCount(entityId) >= state.totalListItemCount) return;
        if (requestCount >= maxRequests) return;
      }

      await delay(scanDelay);
    }
  }
}
