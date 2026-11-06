import { EiscpDriver } from "./eiscp.js";
import log from "./loggers.js";
import { delay, toHex } from "./utils.js";
import { getTuneInPresetCount, hasTuneInPresets, setTuneInBrowseContext } from "./mediaBrowser.js";
import { getTuneInMenuBrowseState } from "./tuneInMenuStore.js";

const logSource = "tuneInPreloader:";

type PhysicalAvrIdResolver = (entityId: string) => string;

export class TuneInPreloader {
  private readonly tuneInPreloadInFlight = new Set<string>();
  private tuneInListSequence = 0;

  constructor(
    private readonly eiscpInstance: EiscpDriver,
    private readonly resolvePhysicalAvrId: PhysicalAvrIdResolver
  ) {}

  private nextTuneInListSequence(): string {
    const sequence = this.tuneInListSequence & 0xffff;
    this.tuneInListSequence = (this.tuneInListSequence + 1) & 0xffff;
    return toHex(sequence, 4);
  }

  private async requestTuneInPresetXml(): Promise<void> {
    for (const layer of ["02", "01", "03"]) {
      await this.eiscpInstance.raw(`NLAL${this.nextTuneInListSequence()}${layer}00000040`);
      await delay(150);
    }
  }

  private async requestLegacyTuneInPresetXml(entityId: string, scanDelay: number): Promise<void> {
    const state = getTuneInMenuBrowseState(entityId);
    if (!state) return;

    const knownLayer = state.nlsLayerNumber;
    const layers = knownLayer > 0 ? [knownLayer, knownLayer - 1, knownLayer + 1].filter((layer) => layer > 0).map((layer) => toHex(layer, 2)) : ["02", "01", "03"];
    let previousCount = -1;

    // Legacy NLS only contains the ten visible rows. Continue with NLAL from
    // the number already collected, just like the legacy full-menu browser.
    for (let attempt = 0; attempt < 10; attempt++) {
      const count = getTuneInPresetCount(entityId);
      if (count === previousCount) break;
      previousCount = count;

      for (const layer of layers) {
        await this.eiscpInstance.raw(`NLAL${this.nextTuneInListSequence()}${layer}${toHex(count, 4)}03E7`);
        await delay(scanDelay);
        const updatedCount = getTuneInPresetCount(entityId);
        if (updatedCount > count) break;
      }
    }
  }

  async preloadTuneInPresets(entityId: string): Promise<void> {
    const physicalAvrId = this.resolvePhysicalAvrId(entityId);
    if (this.tuneInPreloadInFlight.has(physicalAvrId) || hasTuneInPresets(entityId)) {
      return;
    }

    this.tuneInPreloadInFlight.add(physicalAvrId);
    const menuDelay = this.eiscpInstance.eiscpConfig?.netMenuDelay ?? 2500;
    const myPresetsPosition = String(this.eiscpInstance.eiscpConfig?.tuneinPresetPosition ?? 1).padStart(5, "0");
    const scanDelay = Math.max(200, Math.min(menuDelay || 0, 1000));

    try {
      log.info("%s [%s] preloading TuneIn My Presets for media browsing (position %s)", logSource, entityId, myPresetsPosition);
      setTuneInBrowseContext(entityId, "My Presets");
       const legacy = this.eiscpInstance.eiscpConfig?.networkNavigationMode === "legacy";
       if (!legacy) {
         await this.eiscpInstance.raw("NTCTOP");
         await delay(menuDelay);
         await this.eiscpInstance.raw("NTCSELECT");
         await delay(menuDelay * 3);
       } else {
         // Legacy receivers need time to finish entering the NET/TuneIn menu
         // after source selection. The modern TOP/SELECT sequence used to
         // provide this delay implicitly.
         await delay(Math.max(scanDelay, menuDelay * 3));
       }
       await this.eiscpInstance.raw(`NLSI${myPresetsPosition}`);
       await delay(legacy ? Math.max(scanDelay, menuDelay * 3) : scanDelay);
       if (legacy) await this.requestLegacyTuneInPresetXml(entityId, scanDelay);
       else await this.requestTuneInPresetXml();
      await delay(scanDelay);

      const lastCount = getTuneInPresetCount(entityId);
      if (lastCount > 0) {
        log.info("%s [%s] harvested %d TuneIn preset(s) from NLAL", logSource, entityId, lastCount);
      }
    } catch (err) {
      log.warn("%s [%s] failed to preload TuneIn My Presets: %s", logSource, entityId, err);
    } finally {
      this.tuneInPreloadInFlight.delete(physicalAvrId);
    }
  }

  // Aborts an in-flight preload for this AVR. Returns true if a preload was actually running (and has been flagged to stop), false if nothing was in flight.
  abortPreload(entityId: string): boolean {
    const physicalAvrId = this.resolvePhysicalAvrId(entityId);
    if (this.tuneInPreloadInFlight.has(physicalAvrId)) {
      return true;
    }
    return false;
  }
}
