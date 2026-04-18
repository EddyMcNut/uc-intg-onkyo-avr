import * as uc from "@unfoldedcircle/integration-api";
import crypto from "crypto";
import { avrStateManager } from "./avrState.js";
import { buildPhysicalAvrId, OnkyoConfig } from "./configManager.js";
import { EiscpDriver } from "./eiscp.js";
import log from "./loggers.js";
import { delay } from "./utils.js";
import { NETWORK_SERVICES, SONG_INFO } from "./constants.js";
import { getTuneInPresetCount, hasTuneInPresets, ingestTuneInListEntry, ingestTuneInXmlEntries, setTuneInBrowseContext } from "./mediaBrowser.js";

const integrationName = "zoneAgnosticUpdateProcessor:";

interface NowPlayingState {
  station?: string;
  artist?: string;
  album?: string;
  title?: string;
}

interface SharedAvrMediaState {
  nowPlayingBySource: Map<string, NowPlayingState>;
  lastImageHash: string;
  currentImageUrl: string;
}

export class ZoneAgnosticUpdateProcessor {
  public static readonly ZONE_AGNOSTIC_COMMANDS = new Set<string>([
    "IFA",
    "DSN",
    "NST",
    "NLT",
    "NLT_CONTEXT",
    "NLS",
    "NLA",
    "FLD",
    "NTM",
    "metadata"
  ]);

  private sharedMediaState: Map<string, SharedAvrMediaState> = new Map();
  private currentTrackId: Map<string, string> = new Map();
  private tuneInPreloadInFlight: Set<string> = new Set();
  private tuneInListSequence = 0;

  constructor(
    private readonly driver: uc.IntegrationAPI,
    private readonly config: OnkyoConfig,
    private readonly eiscpInstance: EiscpDriver
  ) {}

  public static isZoneAgnosticCommand(command: string): boolean {
    return ZoneAgnosticUpdateProcessor.ZONE_AGNOSTIC_COMMANDS.has(command);
  }

  private getPhysicalAvrId(entityId: string): string {
    const [model, host] = entityId.split(" ");
    return buildPhysicalAvrId(model, host);
  }

  private getSharedAvrMediaState(entityId: string): SharedAvrMediaState {
    const physicalAvrId = this.getPhysicalAvrId(entityId);
    const existing = this.sharedMediaState.get(physicalAvrId);
    if (existing) {
      return existing;
    }

    const created: SharedAvrMediaState = {
      nowPlayingBySource: new Map(),
      lastImageHash: "",
      currentImageUrl: ""
    };
    this.sharedMediaState.set(physicalAvrId, created);
    return created;
  }

  private getNowPlaying(entityId: string, source: string): NowPlayingState {
    const sharedState = this.getSharedAvrMediaState(entityId);
    const existing = sharedState.nowPlayingBySource.get(source);
    if (existing) {
      return existing;
    }

    const created: NowPlayingState = {};
    sharedState.nowPlayingBySource.set(source, created);
    return created;
  }

  private updateNowPlaying(entityId: string, source: string, updates: NowPlayingState): void {
    const state = this.getNowPlaying(entityId, source);
    Object.assign(state, updates);
  }

  resetZone(entityId: string): void {
    this.currentTrackId.delete(entityId);
  }

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

  private async preloadTuneInPresets(entityId: string): Promise<void> {
    const physicalAvrId = this.getPhysicalAvrId(entityId);
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

  async maybeUpdateImage(entityId: string, force: boolean = false): Promise<void> {
    if (!this.config.albumArtURL || this.config.albumArtURL === "na") {
      return;
    }

    const sharedState = this.getSharedAvrMediaState(entityId);
    const physicalAvrId = this.getPhysicalAvrId(entityId);

    if (force) {
      sharedState.lastImageHash = "";
    }

    const imageUrl = `http://${this.config.ip}/${this.config.albumArtURL}`;
    const previousHash = sharedState.lastImageHash;

    let newHash = await this.getImageHash(imageUrl);
    let attempts = 0;
    while (newHash === previousHash && attempts < 3) {
      attempts++;
      await delay(500);
      newHash = await this.getImageHash(imageUrl);
    }

    if (newHash !== previousHash) {
      sharedState.lastImageHash = newHash;
      sharedState.currentImageUrl = `${imageUrl}?hash=${newHash}`;
    }

    if (sharedState.currentImageUrl) {
      const netZones = avrStateManager.getEntitiesByPhysicalAvrAndSource(physicalAvrId, "net");
      for (const zoneEntityId of netZones) {
        this.driver.updateEntityAttributes(zoneEntityId, {
          [uc.MediaPlayerAttributes.MediaImageUrl]: sharedState.currentImageUrl
        });
      }
    }
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
      this.updateNowPlaying(zoneEntityId, "dab", {
        station: stationName,
        artist: "DAB Radio"
      });
      await this.renderZoneMedia(zoneEntityId, true);
    }

    log.info("%s DAB station set to %s (updated %d zone(s))", integrationName, stationName, affectedZones.length);
  }

  async handleNlt(sourceEntityId: string, serviceName: string, eventZone: string): Promise<void> {
    const affectedZones = avrStateManager.getEntitiesByPhysicalAvrAndSource(this.getPhysicalAvrId(sourceEntityId), "net");
    const normalizedService = serviceName.toLowerCase();

    for (const zoneEntityId of affectedZones) {
      avrStateManager.setSubSource(zoneEntityId, serviceName, this.eiscpInstance, eventZone, this.driver);
      const frontPanelDisplaySensorId = `${zoneEntityId}_front_panel_display_sensor`;
      this.driver.updateEntityAttributes(frontPanelDisplaySensorId, {
        [uc.SensorAttributes.State]: uc.SensorStates.On,
        [uc.SensorAttributes.Value]: serviceName
      });
    }

    if (normalizedService === "tunein" && affectedZones.some((zoneEntityId) => !hasTuneInPresets(zoneEntityId))) {
      await this.preloadTuneInPresets(sourceEntityId);
    }

    const hasSongInfo = SONG_INFO.some((name) => normalizedService.includes(name));
    if (hasSongInfo && affectedZones.length > 0) {
      await this.eiscpInstance.raw("NATQSTN");
      await this.eiscpInstance.raw("NTIQSTN");
      await this.eiscpInstance.raw("NALQSTN");
    }
  }

  async handleNst(sourceEntityId: string, playbackStatus: string): Promise<void> {
    const affectedZones = avrStateManager.getEntitiesByPhysicalAvrAndSource(this.getPhysicalAvrId(sourceEntityId), "net");
    for (const zoneEntityId of affectedZones) {
      avrStateManager.setPlaybackStatus(zoneEntityId, playbackStatus, this.driver);
    }
  }

  async handleNltContext(sourceEntityId: string, title: string): Promise<void> {
    const affectedZones = avrStateManager.getEntitiesByPhysicalAvrAndSource(this.getPhysicalAvrId(sourceEntityId), "net");
    for (const zoneEntityId of affectedZones) {
      const subSource = avrStateManager.getSubSource(zoneEntityId);
      if (subSource === "tunein") {
        setTuneInBrowseContext(zoneEntityId, title);
      }
    }
  }

  async handleNls(sourceEntityId: string, entry: string): Promise<void> {
    const affectedZones = avrStateManager.getEntitiesByPhysicalAvrAndSource(this.getPhysicalAvrId(sourceEntityId), "net");
    for (const zoneEntityId of affectedZones) {
      const subSource = avrStateManager.getSubSource(zoneEntityId);
      if (subSource === "tunein") {
        ingestTuneInListEntry(zoneEntityId, entry);
      }
    }
  }

  async handleNla(sourceEntityId: string, xmlPayload: string): Promise<void> {
    const affectedZones = avrStateManager.getEntitiesByPhysicalAvrAndSource(this.getPhysicalAvrId(sourceEntityId), "net");
    for (const zoneEntityId of affectedZones) {
      const subSource = avrStateManager.getSubSource(zoneEntityId);
      if (subSource === "tunein") {
        ingestTuneInXmlEntries(zoneEntityId, xmlPayload);
      }
    }
  }

  async handleFld(sourceEntityId: string, frontPanelText: string, eventZone: string): Promise<void> {
    const physicalAvrId = this.getPhysicalAvrId(sourceEntityId);
    const fmZones = avrStateManager.getEntitiesByPhysicalAvrAndSource(physicalAvrId, "fm");
    for (const zoneEntityId of fmZones) {
      this.updateNowPlaying(zoneEntityId, "fm", {
        station: frontPanelText,
        artist: "FM Radio"
      });
      await this.renderZoneMedia(zoneEntityId, true);
    }

    const netZones = avrStateManager.getEntitiesByPhysicalAvrAndSource(physicalAvrId, "net");
    if (netZones.length > 0) {
      const normalizedText = frontPanelText.toLowerCase();
      const detectedService = NETWORK_SERVICES.find((service) => normalizedText.includes(service.toLowerCase()));

      for (const zoneEntityId of netZones) {
        const frontPanelDisplaySensorId = `${zoneEntityId}_front_panel_display_sensor`;
        this.driver.updateEntityAttributes(frontPanelDisplaySensorId, {
          [uc.SensorAttributes.State]: uc.SensorStates.On,
          [uc.SensorAttributes.Value]: frontPanelText
        });
      }

      if (detectedService) {
        const nextSubSource = detectedService.toLowerCase();
        const needsUpdate = netZones.some((zoneEntityId) => avrStateManager.getSubSource(zoneEntityId) !== nextSubSource);
        if (needsUpdate) {
          for (const zoneEntityId of netZones) {
            avrStateManager.setSubSource(zoneEntityId, nextSubSource, this.eiscpInstance, eventZone, this.driver);
          }
        }

        if (nextSubSource === "tunein" && netZones.some((zoneEntityId) => !hasTuneInPresets(zoneEntityId))) {
          await this.preloadTuneInPresets(sourceEntityId);
        }

        const hasSongInfo = SONG_INFO.some((name) => nextSubSource.includes(name));
        if (hasSongInfo) {
          await this.eiscpInstance.raw("NATQSTN");
          await this.eiscpInstance.raw("NTIQSTN");
          await this.eiscpInstance.raw("NALQSTN");
        }
      }

      return;
    }

    if (fmZones.length === 0) {
      const frontPanelDisplaySensorId = `${sourceEntityId}_front_panel_display_sensor`;
      this.driver.updateEntityAttributes(frontPanelDisplaySensorId, {
        [uc.SensorAttributes.State]: uc.SensorStates.On,
        [uc.SensorAttributes.Value]: frontPanelText
      });
    }
  }

  async handleNtm(sourceEntityId: string, argument: string): Promise<void> {
    const [position, duration] = argument.split("/");
    const affectedZones = avrStateManager.getEntitiesByPhysicalAvrAndSource(this.getPhysicalAvrId(sourceEntityId), "net");

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

    const affectedZones = avrStateManager.getEntitiesByPhysicalAvrAndSource(this.getPhysicalAvrId(sourceEntityId), "net");
    for (const zoneEntityId of affectedZones) {
      this.updateNowPlaying(zoneEntityId, "net", { title, album, artist });
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
    const entitySource = avrStateManager.getSource(entityId);
    const entitySubSource = avrStateManager.getSubSource(entityId);
    const zoneNowPlaying = this.getNowPlaying(entityId, entitySource);
    const sharedState = this.getSharedAvrMediaState(entityId);

    switch (entitySource) {
      case "net": {
        const trackId = `${zoneNowPlaying.title}|${zoneNowPlaying.album}|${zoneNowPlaying.artist}`;
        const previousTrackId = this.currentTrackId.get(entityId) || "";
        const trackChanged = trackId !== previousTrackId;

        if (trackChanged || forceUpdate) {
          this.currentTrackId.set(entityId, trackId);
          this.driver.updateEntityAttributes(entityId, {
            [uc.MediaPlayerAttributes.MediaArtist]: `${zoneNowPlaying.artist || "unknown"} (${zoneNowPlaying.album || "unknown"})`,
            [uc.MediaPlayerAttributes.MediaTitle]: zoneNowPlaying.title || "unknown",
            [uc.MediaPlayerAttributes.MediaAlbum]: zoneNowPlaying.album || "unknown"
          });

          if (sharedState.currentImageUrl) {
            this.driver.updateEntityAttributes(entityId, {
              [uc.MediaPlayerAttributes.MediaImageUrl]: sharedState.currentImageUrl
            });
          }

          if (forceUpdate || !sharedState.currentImageUrl) {
            await this.maybeUpdateImage(entityId, forceUpdate);
          }
        }
        break;
      }
      case "tuner":
      case "fm":
      case "dab": {
        this.driver.updateEntityAttributes(entityId, {
          [uc.MediaPlayerAttributes.MediaArtist]: zoneNowPlaying.artist || "unknown",
          [uc.MediaPlayerAttributes.MediaTitle]: zoneNowPlaying.station || "unknown",
          [uc.MediaPlayerAttributes.MediaAlbum]: "",
          [uc.MediaPlayerAttributes.MediaImageUrl]: "",
          [uc.MediaPlayerAttributes.MediaPosition]: 0,
          [uc.MediaPlayerAttributes.MediaDuration]: 0
        });
        break;
      }
      default: {
        this.driver.updateEntityAttributes(entityId, {
          [uc.MediaPlayerAttributes.MediaArtist]: "",
          [uc.MediaPlayerAttributes.MediaTitle]: "",
          [uc.MediaPlayerAttributes.MediaAlbum]: "",
          [uc.MediaPlayerAttributes.MediaImageUrl]: "",
          [uc.MediaPlayerAttributes.MediaPosition]: 0,
          [uc.MediaPlayerAttributes.MediaDuration]: 0
        });
      }
    }
  }

  private async getImageHash(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return crypto.createHash("md5").update(buffer).digest("hex");
    } catch (err) {
      log.warn("%s failed to fetch/hash image: %s", integrationName, err);
      return "";
    }
  }
}