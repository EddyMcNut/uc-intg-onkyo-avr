import * as uc from "@unfoldedcircle/integration-api";
import { avrStateManager } from "./avrState.js";
import { OnkyoConfig } from "./configManager.js";
import { EiscpDriver } from "./eiscp.js";
import log from "./loggers.js";
import { NETWORK_SERVICES, SONG_INFO } from "./constants.js";
import { hasTuneInPresets, ingestTuneInListEntry, ingestTuneInXmlEntries, setTuneInBrowseContext } from "./mediaBrowser.js";
import { TuneInPreloader } from "./tuneInPreloader.js";
import { ZoneAgnosticMediaStateStore } from "./zoneAgnosticMediaState.js";
import { ZoneMediaRenderer } from "./zoneMediaRenderer.js";

const integrationName = "zoneAgnosticUpdateProcessor:";

export class ZoneAgnosticUpdateProcessor {
  public static readonly ZONE_AGNOSTIC_COMMANDS = new Set<string>(["IFA", "DSN", "NST", "NLT", "NLT_CONTEXT", "NLS", "NLA", "FLD", "NTM", "metadata"]);

  private readonly mediaStateStore = new ZoneAgnosticMediaStateStore();
  private readonly tuneInPreloader: TuneInPreloader;
  private readonly mediaRenderer: ZoneMediaRenderer;

  constructor(
    private readonly driver: uc.IntegrationAPI,
    private readonly config: OnkyoConfig,
    private readonly eiscpInstance: EiscpDriver
  ) {
    this.tuneInPreloader = new TuneInPreloader(eiscpInstance, (entityId) => this.mediaStateStore.getPhysicalAvrId(entityId));
    this.mediaRenderer = new ZoneMediaRenderer(driver, config, this.mediaStateStore);
  }

  public static isZoneAgnosticCommand(command: string): boolean {
    return ZoneAgnosticUpdateProcessor.ZONE_AGNOSTIC_COMMANDS.has(command);
  }

  private getPhysicalAvrId(entityId: string): string {
    return this.mediaStateStore.getPhysicalAvrId(entityId);
  }

  private getNetZones(sourceEntityId: string): string[] {
    return avrStateManager.getEntitiesByPhysicalAvrAndSource(this.getPhysicalAvrId(sourceEntityId), "net");
  }

  private getTuneInZones(sourceEntityId: string): string[] {
    return this.getNetZones(sourceEntityId).filter((zoneEntityId) => avrStateManager.getSubSource(zoneEntityId) === "tunein");
  }

  private updateFrontPanelDisplay(zoneEntityIds: string[], text: string): void {
    for (const zoneEntityId of zoneEntityIds) {
      const frontPanelDisplaySensorId = `${zoneEntityId}_front_panel_display_sensor`;
      this.driver.updateEntityAttributes(frontPanelDisplaySensorId, {
        [uc.SensorAttributes.State]: uc.SensorStates.On,
        [uc.SensorAttributes.Value]: text
      });
    }
  }

  private async maybePreloadTuneIn(sourceEntityId: string, zoneEntityIds: string[]): Promise<void> {
    if (zoneEntityIds.some((zoneEntityId) => !hasTuneInPresets(zoneEntityId))) {
      await this.preloadTuneInPresets(sourceEntityId);
    }
  }

  private async maybeRequestSongInfo(serviceName: string, zoneCount: number): Promise<void> {
    if (zoneCount === 0) {
      return;
    }

    const hasSongInfo = SONG_INFO.some((name) => serviceName.includes(name));
    if (!hasSongInfo) {
      return;
    }

    await this.eiscpInstance.raw("NATQSTN");
    await this.eiscpInstance.raw("NTIQSTN");
    await this.eiscpInstance.raw("NALQSTN");
  }

  resetZone(entityId: string): void {
    this.mediaStateStore.resetZone(entityId);
  }

  async maybeUpdateImage(entityId: string, force: boolean = false): Promise<void> {
    await this.mediaRenderer.maybeUpdateImage(entityId, force);
  }

  private async preloadTuneInPresets(entityId: string): Promise<void> {
    await this.tuneInPreloader.preloadTuneInPresets(entityId);
  }

  async handleIfa(
    sourceEntityId: string,
    eventZone: string,
    argument: Record<string, string> | undefined,
    onAudioFormatChanged: (zoneEntityId: string, audioInputValue: string) => Promise<void>
  ): Promise<void> {
    const audioInputValue = argument?.audioInputValue ?? "";
    const audioOutputValue = argument?.audioOutputValue ?? "";
    const source = avrStateManager.getSource(sourceEntityId);
    const affectedZones = avrStateManager.getEntitiesBySource(source);
    const targetZones = affectedZones.length > 0 ? affectedZones : [sourceEntityId];

    for (const zoneEntityId of targetZones) {
      const audioInputSensorId = `${zoneEntityId}_audio_input_sensor`;
      const audioOutputSensorId = `${zoneEntityId}_audio_output_sensor`;

      if (audioInputValue) {
        this.driver.updateEntityAttributes(audioInputSensorId, {
          [uc.SensorAttributes.State]: uc.SensorStates.On,
          [uc.SensorAttributes.Value]: audioInputValue
        });
        await onAudioFormatChanged(zoneEntityId, audioInputValue);
      }

      if (audioOutputValue) {
        this.driver.updateEntityAttributes(audioOutputSensorId, {
          [uc.SensorAttributes.State]: uc.SensorStates.On,
          [uc.SensorAttributes.Value]: audioOutputValue
        });
      }

      // log.debug("%s IFA sync for [%s] (event zone %s)", integrationName, zoneEntityId, eventZone);
    }
  }

  async handleDsn(sourceEntityId: string, stationName: string, eventZone: string): Promise<void> {
    avrStateManager.setSource(sourceEntityId, "dab", this.eiscpInstance, eventZone, this.driver);

    const affectedZones = avrStateManager.getEntitiesByPhysicalAvrAndSource(this.getPhysicalAvrId(sourceEntityId), "dab");
    for (const zoneEntityId of affectedZones) {
      this.mediaStateStore.updateNowPlaying(zoneEntityId, "dab", {
        station: stationName,
        artist: "DAB Radio"
      });
      await this.renderZoneMedia(zoneEntityId, true);
    }

    log.info("%s DAB station set to %s (updated %d zone(s))", integrationName, stationName, affectedZones.length);
  }

  async handleNlt(sourceEntityId: string, serviceName: string, eventZone: string): Promise<void> {
    const affectedZones = this.getNetZones(sourceEntityId);
    const normalizedService = serviceName.toLowerCase();

    for (const zoneEntityId of affectedZones) {
      avrStateManager.setSubSource(zoneEntityId, serviceName, this.eiscpInstance, eventZone, this.driver);
    }
    this.updateFrontPanelDisplay(affectedZones, serviceName);

    if (normalizedService === "tunein") {
      await this.maybePreloadTuneIn(sourceEntityId, affectedZones);
    }

    await this.maybeRequestSongInfo(normalizedService, affectedZones.length);
  }

  async handleNst(sourceEntityId: string, playbackStatus: string): Promise<void> {
    for (const zoneEntityId of this.getNetZones(sourceEntityId)) {
      avrStateManager.setPlaybackStatus(zoneEntityId, playbackStatus, this.driver);
    }
  }

  async handleNltContext(sourceEntityId: string, title: string): Promise<void> {
    for (const zoneEntityId of this.getTuneInZones(sourceEntityId)) {
      setTuneInBrowseContext(zoneEntityId, title);
    }
  }

  async handleNls(sourceEntityId: string, entry: string): Promise<void> {
    for (const zoneEntityId of this.getTuneInZones(sourceEntityId)) {
      ingestTuneInListEntry(zoneEntityId, entry);
    }
  }

  async handleNla(sourceEntityId: string, xmlPayload: string): Promise<void> {
    for (const zoneEntityId of this.getTuneInZones(sourceEntityId)) {
      ingestTuneInXmlEntries(zoneEntityId, xmlPayload);
    }
  }

  async handleFld(sourceEntityId: string, frontPanelText: string, eventZone: string): Promise<void> {
    const physicalAvrId = this.getPhysicalAvrId(sourceEntityId);
    const fmZones = avrStateManager.getEntitiesByPhysicalAvrAndSource(physicalAvrId, "fm");
    for (const zoneEntityId of fmZones) {
      this.mediaStateStore.updateNowPlaying(zoneEntityId, "fm", {
        station: frontPanelText,
        artist: "FM Radio"
      });
      await this.renderZoneMedia(zoneEntityId, true);
    }

    const netZones = this.getNetZones(sourceEntityId);
    if (netZones.length > 0) {
      const normalizedText = frontPanelText.toLowerCase();
      const detectedService = NETWORK_SERVICES.find((service) => normalizedText.includes(service.toLowerCase()));

      this.updateFrontPanelDisplay(netZones, frontPanelText);

      if (detectedService) {
        const nextSubSource = detectedService.toLowerCase();
        const needsUpdate = netZones.some((zoneEntityId) => avrStateManager.getSubSource(zoneEntityId) !== nextSubSource);
        if (needsUpdate) {
          for (const zoneEntityId of netZones) {
            avrStateManager.setSubSource(zoneEntityId, nextSubSource, this.eiscpInstance, eventZone, this.driver);
          }
        }

        if (nextSubSource === "tunein") {
          await this.maybePreloadTuneIn(sourceEntityId, netZones);
        }

        await this.maybeRequestSongInfo(nextSubSource, netZones.length);
      }

      return;
    }

    if (fmZones.length === 0) {
      this.updateFrontPanelDisplay([sourceEntityId], frontPanelText);
    }
  }

  async handleNtm(sourceEntityId: string, argument: string): Promise<void> {
    const [position, duration] = argument.split("/");
    const affectedZones = this.getNetZones(sourceEntityId);

    for (const zoneEntityId of affectedZones) {
      this.driver.updateEntityAttributes(zoneEntityId, {
        [uc.MediaPlayerAttributes.MediaPosition]: position || 0,
        [uc.MediaPlayerAttributes.MediaDuration]: duration || 0
      });
    }
  }

  async handleMetadata(sourceEntityId: string, argument: Record<string, string> | null): Promise<void> {
    if (!argument) {
      return;
    }

    const title = argument.title || "unknown";
    const album = argument.album || "unknown";
    const artist = argument.artist || "unknown";

    const affectedZones = this.getNetZones(sourceEntityId);
    for (const zoneEntityId of affectedZones) {
      this.mediaStateStore.updateNowPlaying(zoneEntityId, "net", { title, album, artist });
      await this.renderZoneMedia(zoneEntityId, true);
    }

    if (affectedZones.length > 0) {
      log.info("%s metadata updated: %s - %s (updated %d zone(s))", integrationName, artist, title, affectedZones.length);
    }
  }

  async renderEntity(entityId: string, forceUpdate: boolean = false): Promise<void> {
    await this.renderZoneMedia(entityId, forceUpdate);
  }

  private async renderZoneMedia(entityId: string, forceUpdate: boolean): Promise<void> {
    await this.mediaRenderer.renderZoneMedia(entityId, forceUpdate);
  }
}
