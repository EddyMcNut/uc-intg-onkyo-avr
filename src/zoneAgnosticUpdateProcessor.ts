import * as uc from "@unfoldedcircle/integration-api";
import { ConfigManager, OnkyoConfig, buildEntityId } from "./configManager.js";
import { EiscpDriver } from "./eiscp.js";
import log from "./loggers.js";
import { NETWORK_SERVICES, SONG_INFO } from "./constants.js";
import { TuneInPreloader } from "./tuneInPreloader.js";
import { ZoneAgnosticMediaStateStore } from "./zoneAgnosticMediaState.js";
import { ZoneMediaRenderer } from "./zoneMediaRenderer.js";
import { TidalZoneAgnosticAdapter, TuneInZoneAgnosticAdapter, type ZoneAgnosticServiceAdapter } from "./zoneAgnosticServiceAdapters.js";

const integrationName = "zoneAgnosticUpdateProcessor:";

export interface AvrStateApi {
  getSource(entityId: string): string;
  getSubSource(entityId: string): string;
  getEntitiesBySource(source: string): string[];
  getEntitiesByPhysicalAvrAndSource(physicalAvrId: string, source: string): string[];
  setSource(entityId: string, source: string, eiscpInstance?: EiscpDriver, zone?: string, driver?: uc.IntegrationAPI): boolean;
  setSubSource(entityId: string, subSource: string, eiscpInstance?: EiscpDriver, zone?: string, driver?: uc.IntegrationAPI): boolean;
  setPlaybackStatus(entityId: string, playbackStatus: string, driver?: uc.IntegrationAPI): boolean;
}

export class ZoneAgnosticUpdateProcessor {
  public static readonly ZONE_AGNOSTIC_COMMANDS = new Set<string>(["IFA", "DSN", "NST", "NLT", "NLT_CONTEXT", "NLS", "NLA", "FLD", "NTM", "metadata"]);

  private readonly mediaStateStore = new ZoneAgnosticMediaStateStore();
  private readonly tuneInPreloader: TuneInPreloader;
  private readonly mediaRenderer: ZoneMediaRenderer;
  private readonly serviceAdapters: ZoneAgnosticServiceAdapter[];

  constructor(
    private readonly driver: uc.IntegrationAPI,
    config: OnkyoConfig,
    private readonly eiscpInstance: EiscpDriver,
    private readonly state: AvrStateApi
  ) {
    this.tuneInPreloader = new TuneInPreloader(eiscpInstance, (entityId) => this.mediaStateStore.getPhysicalAvrId(entityId));
    this.mediaRenderer = new ZoneMediaRenderer(driver, config, this.mediaStateStore);
    this.serviceAdapters = [
      new TuneInZoneAgnosticAdapter({
        state: this.state,
        getPhysicalAvrId: (entityId) => this.getPhysicalAvrId(entityId),
        isTuneInFullMenu: (zoneEntityId) => this.isTuneInFullMenu(zoneEntityId),
        preloadTuneInPresets: (sourceEntityId) => this.preloadTuneInPresets(sourceEntityId)
      }),
      new TidalZoneAgnosticAdapter({
        state: this.state,
        getPhysicalAvrId: (entityId) => this.getPhysicalAvrId(entityId)
      })
    ];
  }

  public updateConfig(config: OnkyoConfig): void {
    this.mediaRenderer.updateConfig(config);
  }

  public static isZoneAgnosticCommand(command: string): boolean {
    return ZoneAgnosticUpdateProcessor.ZONE_AGNOSTIC_COMMANDS.has(command);
  }

  private getPhysicalAvrId(entityId: string): string {
    return this.mediaStateStore.getPhysicalAvrId(entityId);
  }

  private getNetZones(sourceEntityId: string): string[] {
    return this.state.getEntitiesByPhysicalAvrAndSource(this.getPhysicalAvrId(sourceEntityId), "net");
  }

  private getServiceAdapter(service: string): ZoneAgnosticServiceAdapter | undefined {
    return this.serviceAdapters.find((adapter) => adapter.service === service);
  }

  // Fallback helper: return given zones if non-empty, otherwise return single-element array with fallback zone
  private ensureNonEmpty(zones: string[], fallbackZone: string): string[] {
    return zones.length > 0 ? zones : [fallbackZone];
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

  // Detect if FLD display text shows now-playing (e.g., "Spotify / Track Title") vs service name alone
  private isNowPlayingDisplay(displayText: string, serviceName: string): boolean {
    return displayText.toLowerCase().includes(serviceName.toLowerCase() + " / ");
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

  async maybeUpdateImage(entityId: string, _force: boolean = false): Promise<void> {
    await this.mediaRenderer.maybeUpdateImage(entityId);
  }

  private async isTuneInFullMenu(zoneEntityId: string): Promise<boolean> {
    const cfg = ConfigManager.get();
    const avr = cfg?.avrs?.find((a) => buildEntityId(a.model, a.ip, a.zone) === zoneEntityId);
    return avr?.tuneinMenuStyle === "full";
  }

  private async preloadTuneInPresets(entityId: string): Promise<void> {
    await this.tuneInPreloader.preloadTuneInPresets(entityId);
  }

  // Aborts an in-flight TuneIn preload for the given entity's AVR. Returns true if a preload was running and has been flagged to stop.
  abortTuneInPreload(entityId: string): boolean {
    return this.tuneInPreloader.abortPreload(entityId);
  }

  async handleIfa(
    sourceEntityId: string,
    _eventZone: string,
    argument: Record<string, string> | undefined,
    onAudioFormatChanged: (zoneEntityId: string, audioInputValue: string) => Promise<void>
  ): Promise<void> {
    const audioInputValue = argument?.audioInputValue ?? "";
    const audioOutputValue = argument?.audioOutputValue ?? "";
    const source = this.state.getSource(sourceEntityId);
    const affectedZones = this.state.getEntitiesBySource(source);
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

      log.debug("%s IFA sync for [%s] (event zone %s)", integrationName, zoneEntityId, _eventZone);
    }
  }

  async handleDsn(sourceEntityId: string, stationName: string, eventZone: string): Promise<void> {
    this.state.setSource(sourceEntityId, "dab", this.eiscpInstance, eventZone, this.driver);

    const affectedZones = this.state.getEntitiesByPhysicalAvrAndSource(this.getPhysicalAvrId(sourceEntityId), "dab");
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
    const netZones = this.getNetZones(sourceEntityId);
    const affectedZones = this.ensureNonEmpty(netZones, sourceEntityId);
    const normalizedService = serviceName.toLowerCase();
    const enteringZones: string[] = [];

    for (const zoneEntityId of affectedZones) {
      const previousSubSource = this.state.getSubSource(zoneEntityId);
      this.state.setSubSource(zoneEntityId, serviceName, this.eiscpInstance, eventZone, this.driver);
      // Track zones entering this service for adapter initialization
      if (previousSubSource !== normalizedService) {
        enteringZones.push(zoneEntityId);
      }
    }
    this.updateFrontPanelDisplay(affectedZones, serviceName);

    const serviceAdapter = this.getServiceAdapter(normalizedService);
    if (serviceAdapter?.onServiceEntered) {
      await serviceAdapter.onServiceEntered(sourceEntityId, affectedZones, enteringZones);
    }

    await this.maybeRequestSongInfo(normalizedService, affectedZones.length);
  }

  async handleNst(sourceEntityId: string, playbackStatus: string): Promise<void> {
    for (const zoneEntityId of this.getNetZones(sourceEntityId)) {
      this.state.setPlaybackStatus(zoneEntityId, playbackStatus, this.driver);
    }
  }

  async handleNltContext(sourceEntityId: string, title: string): Promise<void> {
    for (const adapter of this.serviceAdapters) {
      adapter.handleNltContext?.(sourceEntityId, title);
    }
  }

  async handleNls(sourceEntityId: string, entry: string): Promise<void> {
    for (const adapter of this.serviceAdapters) {
      adapter.handleNls(sourceEntityId, entry);
    }
  }

  async handleNla(sourceEntityId: string, xmlPayload: string): Promise<void> {
    for (const adapter of this.serviceAdapters) {
      adapter.handleNla(sourceEntityId, xmlPayload);
    }
  }

  async handleFld(sourceEntityId: string, frontPanelText: string, eventZone: string): Promise<void> {
    const physicalAvrId = this.getPhysicalAvrId(sourceEntityId);
    const fmZones = this.state.getEntitiesByPhysicalAvrAndSource(physicalAvrId, "fm");
    for (const zoneEntityId of fmZones) {
      this.mediaStateStore.updateNowPlaying(zoneEntityId, "fm", {
        station: frontPanelText,
        artist: "FM Radio"
      });
      await this.renderZoneMedia(zoneEntityId, true);
    }
    if (fmZones.length > 0) {
      this.updateFrontPanelDisplay(fmZones, frontPanelText);
    }

    const netZones = this.getNetZones(sourceEntityId);
    if (netZones.length > 0) {
      const normalizedText = frontPanelText.toLowerCase();
      const detectedService = NETWORK_SERVICES.find((service) => normalizedText.includes(service.toLowerCase()));

      this.updateFrontPanelDisplay(netZones, frontPanelText);

      if (detectedService) {
        const nextSubSource = detectedService.toLowerCase();
        if (!this.isNowPlayingDisplay(frontPanelText, detectedService)) {
          const needsUpdate = netZones.some((zoneEntityId) => this.state.getSubSource(zoneEntityId) !== nextSubSource);
          if (needsUpdate) {
            for (const zoneEntityId of netZones) {
              this.state.setSubSource(zoneEntityId, nextSubSource, this.eiscpInstance, eventZone, this.driver);
            }
          }

          const serviceAdapter = this.getServiceAdapter(nextSubSource);
          if (serviceAdapter?.onServiceDetectedFromFld) {
            await serviceAdapter.onServiceDetectedFromFld(sourceEntityId, netZones);
          }
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

      const serviceAdapter = this.getServiceAdapter(this.state.getSubSource(zoneEntityId));
      serviceAdapter?.handleMetadata(zoneEntityId, artist);
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
