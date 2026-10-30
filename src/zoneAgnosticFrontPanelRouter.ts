import * as uc from "@unfoldedcircle/integration-api";
import { detectServiceFromText } from "./serviceDetector.js";
import type { AvrStateApi } from "./types.js";
import type { ZoneAgnosticServiceAdapter } from "./zoneAgnosticServiceAdapters.js";
import type { ZoneAgnosticMediaStateStore } from "./zoneAgnosticMediaState.js";
import type { EiscpDriver } from "./eiscp.js";
import { findTunerPresetByName } from "./tunerPresetStore.js";

type FrontPanelRouterDeps = {
  driver: uc.IntegrationAPI;
  eiscpInstance: EiscpDriver;
  state: AvrStateApi;
  mediaStateStore: ZoneAgnosticMediaStateStore;
  getPhysicalAvrId: (entityId: string) => string;
  getNetZones: (sourceEntityId: string) => string[];
  getServiceAdapter: (service: string) => ZoneAgnosticServiceAdapter | undefined;
  renderZoneMedia: (entityId: string, forceUpdate: boolean) => Promise<void>;
  updateFrontPanelDisplay: (zoneEntityIds: string[], text: string) => void;
  isNowPlayingDisplay: (displayText: string, serviceName: string) => boolean;
  maybeRequestSongInfo: (serviceName: string, zoneCount: number) => Promise<void>;
};

export class ZoneAgnosticFrontPanelRouter {
  private readonly tuneInRenderTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly deps: FrontPanelRouterDeps) {}

  private scheduleTuneInRender(entityId: string): void {
    const existingTimer = this.tuneInRenderTimers.get(entityId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      this.tuneInRenderTimers.delete(entityId);
      void this.deps.renderZoneMedia(entityId, true);
    }, 150);
    this.tuneInRenderTimers.set(entityId, timer);
  }

  async handleFld(sourceEntityId: string, frontPanelText: string, eventZone: string): Promise<void> {
    const physicalAvrId = this.deps.getPhysicalAvrId(sourceEntityId);
    const fmZones = this.deps.state.getEntitiesByPhysicalAvrAndSource(physicalAvrId, "fm");
    const amZones = this.deps.state.getEntitiesByPhysicalAvrAndSource(physicalAvrId, "am");
    for (const [source, zones] of [
      ["fm", fmZones],
      ["am", amZones]
    ] as const) {
      for (const zoneEntityId of zones) {
        this.deps.mediaStateStore.updateNowPlaying(zoneEntityId, source, {
          station: frontPanelText,
          artist: `${source.toUpperCase()} Radio`
        });
        const preset = findTunerPresetByName(physicalAvrId, frontPanelText);
        this.deps.driver.updateEntityAttributes(`${zoneEntityId}_tuner_presets`, {
          [uc.SelectAttributes.CurrentOption]: preset?.name ?? ""
        });
        await this.deps.renderZoneMedia(zoneEntityId, true);
      }
    }
    const tunerZones = [...fmZones, ...amZones];
    if (tunerZones.length > 0) {
      this.deps.updateFrontPanelDisplay(tunerZones, frontPanelText);
    }

    const netZones = this.deps.getNetZones(sourceEntityId);
    if (netZones.length > 0) {
      const detectedService = detectServiceFromText(frontPanelText);

      this.deps.updateFrontPanelDisplay(netZones, frontPanelText);

      if (detectedService) {
        const nextSubSource = detectedService;
        if (!this.deps.isNowPlayingDisplay(frontPanelText, detectedService)) {
          const needsUpdate = netZones.some((zoneEntityId) => this.deps.state.getSubSource(zoneEntityId) !== nextSubSource);
          if (needsUpdate) {
            for (const zoneEntityId of netZones) {
              this.deps.state.setSubSource(zoneEntityId, nextSubSource, this.deps.eiscpInstance, eventZone, this.deps.driver);
            }
          }

          const serviceAdapter = this.deps.getServiceAdapter(nextSubSource);
          if (serviceAdapter?.onServiceDetectedFromFld) {
            await serviceAdapter.onServiceDetectedFromFld(sourceEntityId, netZones);
          }
        }
        await this.deps.maybeRequestSongInfo(nextSubSource, netZones.length);
      }

      return;
    }

    if (tunerZones.length === 0) {
      this.deps.updateFrontPanelDisplay([sourceEntityId], frontPanelText);
    }
  }

  async handleMetadata(sourceEntityId: string, argument: Record<string, string> | null): Promise<void> {
    if (!argument) {
      return;
    }

    const title = argument.title || "unknown";
    const album = argument.album || "unknown";
    const artist = argument.artist || "unknown";

    const affectedZones = this.deps.getNetZones(sourceEntityId);
    for (const zoneEntityId of affectedZones) {
      const service = this.deps.state.getSubSource(zoneEntityId);
      // NAT, NTI and NAL arrive as separate events. Do not render or update
      // browse matching state for partial metadata from music services; the
      // next event carries the completed track information. TuneIn is kept
      // permissive because its station identity is commonly reported in only
      // one metadata field.
      if (service !== "tunein" && (title === "unknown" || artist === "unknown")) {
        continue;
      }

      this.deps.mediaStateStore.updateNowPlaying(zoneEntityId, "net", { title, album, artist });
      const serviceAdapter = this.deps.getServiceAdapter(service);

      if (service === "tunein") {
        // TuneIn commonly sends NAT/NTI/NAL in a burst. Keep browse matching
        // immediate, but collapse the redundant media-widget/artwork renders.
        serviceAdapter?.handleMetadata(zoneEntityId, artist);
        this.scheduleTuneInRender(zoneEntityId);
        continue;
      }

      await this.deps.renderZoneMedia(zoneEntityId, true);
      serviceAdapter?.handleMetadata(zoneEntityId, artist);
      serviceAdapter?.handleTrackMetadata?.(zoneEntityId, title, artist);
    }

    if (affectedZones.length > 0) {
      // Keep logging in the processor for now; this class handles routing only.
    }
  }
}
