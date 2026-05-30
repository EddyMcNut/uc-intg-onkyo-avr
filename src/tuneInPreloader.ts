import { EiscpDriver } from "./eiscp.js";
import log from "./loggers.js";
import { delay, toHex } from "./utils.js";
import { getTuneInPresetCount, hasTuneInPresets, setTuneInBrowseContext } from "./mediaBrowser.js";

const integrationName = "tuneInPreloader:";

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
      // log.info("%s [%s] preloading TuneIn My Presets for media browsing (position %s)", integrationName, entityId, myPresetsPosition);
      setTuneInBrowseContext(entityId, "My Presets");
      await this.eiscpInstance.raw("NTCTOP");
      await delay(menuDelay);
      await this.eiscpInstance.raw("NTCSELECT");
      await delay(menuDelay * 3);
      await this.eiscpInstance.raw(`NLSI${myPresetsPosition}`);
      await delay(scanDelay);
      await this.requestTuneInPresetXml();
      await delay(scanDelay);

      const lastCount = getTuneInPresetCount(entityId);
      if (lastCount > 0) {
        // log.info("%s [%s] harvested %d TuneIn preset(s) from NLAL", integrationName, entityId, lastCount);
      }
    } catch (err) {
      log.warn("%s [%s] failed to preload TuneIn My Presets: %s", integrationName, entityId, err);
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
