import * as uc from "@unfoldedcircle/integration-api";
import { SONG_INFO } from "./constants.js";
import { detectServiceFromText } from "./serviceDetector.js";
import type { AvrStateApi } from "./types.js";
import type { ZoneAgnosticServiceAdapter } from "./zoneAgnosticServiceAdapters.js";
import type { ZoneAgnosticMediaStateStore } from "./zoneAgnosticMediaState.js";
import type { EiscpDriver } from "./eiscp.js";

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
  constructor(private readonly deps: FrontPanelRouterDeps) {}

  async handleFld(sourceEntityId: string, frontPanelText: string, eventZone: string): Promise<void> {
    const physicalAvrId = this.deps.getPhysicalAvrId(sourceEntityId);
    const fmZones = this.deps.state.getEntitiesByPhysicalAvrAndSource(physicalAvrId, "fm");
    for (const zoneEntityId of fmZones) {
      this.deps.mediaStateStore.updateNowPlaying(zoneEntityId, "fm", {
        station: frontPanelText,
        artist: "FM Radio"
      });
      await this.deps.renderZoneMedia(zoneEntityId, true);
    }
    if (fmZones.length > 0) {
      this.deps.updateFrontPanelDisplay(fmZones, frontPanelText);
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

    if (fmZones.length === 0) {
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
      this.deps.mediaStateStore.updateNowPlaying(zoneEntityId, "net", { title, album, artist });
      await this.deps.renderZoneMedia(zoneEntityId, true);

      const serviceAdapter = this.deps.getServiceAdapter(this.deps.state.getSubSource(zoneEntityId));
      serviceAdapter?.handleMetadata(zoneEntityId, artist);
    }

    if (affectedZones.length > 0) {
      // Keep logging in the processor for now; this class handles routing only.
    }
  }

  static hasSongInfo(serviceName: string): boolean {
    return SONG_INFO.some((name) => serviceName.includes(name));
  }
}