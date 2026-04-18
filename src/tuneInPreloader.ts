import { EiscpDriver } from "./eiscp.js";
import log from "./loggers.js";
import { delay } from "./utils.js";
import { getTuneInPresetCount, hasTuneInPresets, setTuneInBrowseContext } from "./mediaBrowser.js";

const integrationName = "zoneAgnosticUpdateProcessor:";

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
    return sequence.toString(16).toUpperCase().padStart(4, "0");
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
    const menuDelay = this.eiscpInstance["config"]?.netMenuDelay ?? 2500;
    const myPresetsPosition = String(this.eiscpInstance["config"]?.tuneinPresetPosition ?? 1).padStart(5, "0");
    const scanDelay = Math.max(200, Math.min(menuDelay || 0, 1000));

    try {
      log.info("%s [%s] preloading TuneIn My Presets for media browsing (position %s)", integrationName, entityId, myPresetsPosition);
      setTuneInBrowseContext(entityId, "My Presets");
      await this.eiscpInstance.raw("NTCTOP");
      await delay(menuDelay);
      await this.eiscpInstance.raw("NTCSELECT");
      await delay(menuDelay * 3);
      await this.eiscpInstance.raw(`NLSI${myPresetsPosition}`);
      await delay(scanDelay);
      await this.requestTuneInPresetXml();
      await delay(scanDelay);

      let lastCount = getTuneInPresetCount(entityId);
      let stagnantSteps = 0;
      const minimumScrollSteps = 12;
      const maxStagnantSteps = 12;

      for (let step = 0; step < 40 && (step < minimumScrollSteps || stagnantSteps < maxStagnantSteps); step += 1) {
        await this.eiscpInstance.raw("NTCDOWN");
        await delay(scanDelay);

        if ((step + 1) % 10 === 0) {
          await this.requestTuneInPresetXml();
          await delay(scanDelay);
        }

        const count = getTuneInPresetCount(entityId);
        if (count > lastCount) {
          lastCount = count;
          stagnantSteps = 0;
        } else {
          stagnantSteps += 1;
        }
      }

      if (lastCount > 0) {
        log.info("%s [%s] harvested %d TuneIn preset(s) from paged AVR list updates", integrationName, entityId, lastCount);
      }
    } catch (err) {
      log.warn("%s [%s] failed to preload TuneIn My Presets: %s", integrationName, entityId, err);
    } finally {
      this.tuneInPreloadInFlight.delete(physicalAvrId);
    }
  }
}
