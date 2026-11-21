import type { MediaBrowserServices } from "./mediaBrowserServices.js";
import { isNetworkServiceDisplayName } from "./networkServices.js";
import { deezerStore } from "./deezerBrowserStore.js";
import { musicServerStore } from "./musicServerBrowserStore.js";
import { tidalStore } from "./tidalBrowserStore.js";
import type { AvrContextRegistry } from "./avrContext.js";
import type { TuneInPresetStore } from "./tuneInBrowserStore.js";
import { resetTuneInMenuBrowseState, setTuneInMenuNowPlayingStation, updateTuneInMenuNowPlayingStation } from "./tuneInMenuStore.js";
import { DEEZER_SERVICE_ID, MUSIC_SERVER_SERVICE_ID, TIDAL_SERVICE_ID, TUNEIN_SERVICE_ID } from "./browseServiceContract.js";
import type { NetworkNavigationMode } from "./configConstants.js";
import log from "./loggers.js";

type SubSourceStateApi = {
  getSubSource(entityId: string): string;
  getEntitiesByPhysicalAvrAndSource(physicalAvrId: string, source: string): string[];
};

export type ZoneAgnosticServiceAdapter = {
  service: string;
  getActiveZones(sourceEntityId: string): string[];
  onServiceEntered?(sourceEntityId: string, affectedZones: string[], enteringZones: string[]): Promise<void>;
  onServiceDetectedFromFld?(sourceEntityId: string, netZones: string[]): Promise<void>;
  handleNltContext?(sourceEntityId: string, title: string): void;
  handleNls(sourceEntityId: string, entry: string): void;
  handleNla(sourceEntityId: string, xmlPayload: string): void;
  handleMetadata(zoneEntityId: string, artist: string): void;
  handleTrackMetadata?(zoneEntityId: string, title: string, artist: string): void;
  // Drop stale now-playing marks so a fresh (re-)entry of the service starts with a clean browser.
  clearNowPlayingForZones?(zoneEntityIds: string[]): void;
};

type AdapterDeps = {
  state: SubSourceStateApi;
  avrContexts: AvrContextRegistry;
  mediaBrowserServices: MediaBrowserServices;
  getPhysicalAvrId: (entityId: string) => string;
  getNetworkNavigationMode?: (entityId: string) => NetworkNavigationMode;
};

type TuneInAdapterDeps = AdapterDeps & {
  isTuneInFullMenu: (zoneEntityId: string) => Promise<boolean>;
  preloadTuneInPresets: (sourceEntityId: string) => Promise<void>;
};

function isLegacyNavigation(entityId: string, deps: AdapterDeps): boolean {
  return deps.getNetworkNavigationMode?.(entityId) === "legacy";
}

function getServiceZones(sourceEntityId: string, service: string, deps: AdapterDeps): string[] {
  const netZones = deps.state.getEntitiesByPhysicalAvrAndSource(deps.getPhysicalAvrId(sourceEntityId), "net").filter((zoneEntityId) => deps.state.getSubSource(zoneEntityId) === service);
  if (netZones.length > 0) {
    return netZones;
  }

  return deps.state.getSubSource(sourceEntityId) === service ? [sourceEntityId] : [];
}

export class TuneInZoneAgnosticAdapter implements ZoneAgnosticServiceAdapter {
  private get media(): MediaBrowserServices {
    return this.deps.mediaBrowserServices;
  }

  private get avrContexts(): AvrContextRegistry {
    return this.deps.avrContexts;
  }

  private tuneInPresetsOf(zoneEntityId: string): TuneInPresetStore | undefined {
    return this.avrContexts.forEntity(zoneEntityId)?.tuneInPresets;
  }

  readonly service = TUNEIN_SERVICE_ID;

  constructor(private readonly deps: TuneInAdapterDeps) {}

  getActiveZones(sourceEntityId: string): string[] {
    return getServiceZones(sourceEntityId, this.service, this.deps);
  }

  async onServiceEntered(sourceEntityId: string, affectedZones: string[], enteringZones: string[]): Promise<void> {
    // A fresh TuneIn entry must drop any stale "now playing" mark so the browser starts clean.
    // Use the full affected zone list: if the internal sub-source still reports TuneIn (e.g. after
    // AVR standby or re-selecting the same source), enteringZones can be empty and the stale mark
    // would otherwise survive.
    const refreshedZones = affectedZones.length > 0 ? affectedZones : enteringZones;
    this.clearNowPlayingForZones(refreshedZones);
    for (const zoneEntityId of refreshedZones) {
      this.tuneInPresetsOf(zoneEntityId)?.clearPresets();
    }

    await this.maybePreloadTuneIn(sourceEntityId, affectedZones);
  }

  clearNowPlayingForZones(zoneEntityIds: string[]): void {
    for (const zoneEntityId of zoneEntityIds) {
      resetTuneInMenuBrowseState(zoneEntityId, this.avrContexts);
      setTuneInMenuNowPlayingStation(zoneEntityId, "", this.avrContexts);
      this.tuneInPresetsOf(zoneEntityId)?.resetNowPlaying();
    }
  }

  async onServiceDetectedFromFld(sourceEntityId: string, netZones: string[]): Promise<void> {
    await this.maybePreloadTuneIn(sourceEntityId, netZones);
  }

  handleNltContext(sourceEntityId: string, title: string): void {
    for (const zoneEntityId of this.getActiveZones(sourceEntityId)) {
      this.media.setTuneInBrowseContext(zoneEntityId, title);
    }
  }

  handleNls(sourceEntityId: string, entry: string): void {
    for (const zoneEntityId of this.getActiveZones(sourceEntityId)) {
      // Modern Full Menu is XML-backed; legacy Full Menu consumes NLS too,
      // including stations when the user opens its My Presets folder.
      this.media.ingestTuneInListEntry(zoneEntityId, entry);
      if (isLegacyNavigation(zoneEntityId, this.deps)) {
        // Some receivers repeat the TuneIn context header without producing
        // a new NLT context event. The full menu's first row is unambiguous.
        if (/^U\d+-My Presets\s*$/i.test(entry.trim())) this.media.setTuneInBrowseContext(zoneEntityId, "TuneIn Radio");
        this.media.ingestTuneInMenuListEntry(zoneEntityId, entry);
      }
    }
  }

  handleNla(sourceEntityId: string, xmlPayload: string): void {
    for (const zoneEntityId of this.getActiveZones(sourceEntityId)) {
      this.media.ingestTuneInXmlEntries(zoneEntityId, xmlPayload);
      this.media.ingestTuneInMenuXmlEntries(zoneEntityId, xmlPayload);
    }
  }

  handleMetadata(zoneEntityId: string, artist: string): void {
    const matchedPreset = this.tuneInPresetsOf(zoneEntityId)?.updateNowPlayingStation(artist) ?? false;
    if (matchedPreset) {
      log.info("tuneInAdapter: [%s] TuneIn station started: '%s' (matched a known preset)", zoneEntityId, artist);
    } else if (artist) {
      log.debug("tuneInAdapter: [%s] TuneIn metadata station candidate: '%s' (not matched to a known preset)", zoneEntityId, artist);
    }
    updateTuneInMenuNowPlayingStation(zoneEntityId, artist, this.avrContexts);
  }

  private async maybePreloadTuneIn(sourceEntityId: string, zoneEntityIds: string[]): Promise<void> {
    // hasNonFullMenuZone: true if at least one zone uses My Presets (non-full) menu style
    const hasNonFullMenuZone = await Promise.all(zoneEntityIds.map((zoneEntityId) => this.deps.isTuneInFullMenu(zoneEntityId))).then((results) => results.some((isFull) => !isFull));
    const needsPreload = hasNonFullMenuZone && zoneEntityIds.some((zoneEntityId) => !this.media.hasTuneInPresets(zoneEntityId));
    if (!needsPreload) {
      return;
    }

    await this.deps.preloadTuneInPresets(sourceEntityId);
  }
}

export class TidalZoneAgnosticAdapter implements ZoneAgnosticServiceAdapter {
  private get avrContexts(): AvrContextRegistry {
    return this.deps.avrContexts;
  }

  private get media(): MediaBrowserServices {
    return this.deps.mediaBrowserServices;
  }

  readonly service = TIDAL_SERVICE_ID;

  constructor(private readonly deps: AdapterDeps) {}

  getActiveZones(sourceEntityId: string): string[] {
    return getServiceZones(sourceEntityId, this.service, this.deps);
  }

  handleNltContext(sourceEntityId: string, title: string): void {
    const activeZones = this.getActiveZones(sourceEntityId);
    if (!activeZones.some((zoneEntityId) => isLegacyNavigation(zoneEntityId, this.deps))) return;
    if (
      !title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .includes("tidal")
    )
      return;
    for (const zoneEntityId of activeZones) {
      tidalStore.resetState(zoneEntityId, this.avrContexts);
      const state = tidalStore.getBrowseState(zoneEntityId, this.avrContexts);
      if (state) state.legacyServiceMenuActive = true;
    }
  }

  async onServiceEntered(_sourceEntityId: string, _affectedZones: string[], enteringZones: string[]): Promise<void> {
    for (const zoneEntityId of enteringZones) {
      const state = tidalStore.getBrowseState(zoneEntityId, this.avrContexts);
      if (state) {
        state.nowPlayingTitle = "";
        state.browseListFrozen = false;
      }
    }
  }

  handleNls(sourceEntityId: string, entry: string): void {
    for (const zoneEntityId of this.getActiveZones(sourceEntityId)) {
      if (isLegacyNavigation(zoneEntityId, this.deps) && tidalStore.getBrowseState(zoneEntityId, this.avrContexts)?.legacyServiceMenuActive) this.media.ingestTidalListEntry(zoneEntityId, entry);
    }
  }

  handleNla(sourceEntityId: string, xmlPayload: string): void {
    for (const zoneEntityId of this.getActiveZones(sourceEntityId)) {
      this.media.ingestTidalXmlEntries(zoneEntityId, xmlPayload);
    }
  }

  handleMetadata(zoneEntityId: string, artist: string): void {
    const tidalState = tidalStore.getBrowseState(zoneEntityId, this.avrContexts);
    if (tidalState) tidalState.nowPlayingTitle = artist;
  }
}

export class DeezerZoneAgnosticAdapter implements ZoneAgnosticServiceAdapter {
  private get avrContexts(): AvrContextRegistry {
    return this.deps.avrContexts;
  }

  private get media(): MediaBrowserServices {
    return this.deps.mediaBrowserServices;
  }

  readonly service = DEEZER_SERVICE_ID;

  constructor(private readonly deps: AdapterDeps) {}

  getActiveZones(sourceEntityId: string): string[] {
    return getServiceZones(sourceEntityId, this.service, this.deps);
  }

  handleNltContext(sourceEntityId: string, title: string): void {
    const activeZones = this.getActiveZones(sourceEntityId);
    if (!activeZones.some((zoneEntityId) => isLegacyNavigation(zoneEntityId, this.deps))) return;
    if (
      !title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .includes("deezer")
    )
      return;
    for (const zoneEntityId of activeZones) {
      deezerStore.resetState(zoneEntityId, this.avrContexts);
      const state = deezerStore.getBrowseState(zoneEntityId, this.avrContexts);
      if (state) state.legacyServiceMenuActive = true;
    }
  }

  async onServiceEntered(_sourceEntityId: string, _affectedZones: string[], enteringZones: string[]): Promise<void> {
    for (const zoneEntityId of enteringZones) {
      const state = deezerStore.getBrowseState(zoneEntityId, this.avrContexts);
      if (state) {
        state.nowPlayingTitle = "";
        state.browseListFrozen = false;
      }
    }
  }

  handleNls(sourceEntityId: string, entry: string): void {
    for (const zoneEntityId of this.getActiveZones(sourceEntityId)) {
      if (isLegacyNavigation(zoneEntityId, this.deps) && deezerStore.getBrowseState(zoneEntityId, this.avrContexts)?.legacyServiceMenuActive) this.media.ingestDeezerListEntry(zoneEntityId, entry);
    }
  }

  handleNla(sourceEntityId: string, xmlPayload: string): void {
    for (const zoneEntityId of this.getActiveZones(sourceEntityId)) {
      this.media.ingestDeezerXmlEntries(zoneEntityId, xmlPayload);
    }
  }

  handleMetadata(_zoneEntityId: string, _artist: string): void {
    // Deezer uses a dedicated title/artist reconstruction in
    // handleTrackMetadata; do not overwrite its complete browse match with
    // the artist-only NTI value first.
  }

  handleTrackMetadata(zoneEntityId: string, title: string, artist: string): void {
    const deezerState = deezerStore.getBrowseState(zoneEntityId, this.avrContexts);
    if (!deezerState || title === "unknown") return;

    const previousTitle = deezerState.nowPlayingTitle;
    let candidate: string;

    // On this AVR Deezer reports the complete "Track / Artist" value in NTI,
    // while NAT contains only the artist. Prefer that complete browse value.
    if (artist !== "unknown" && (artist.includes(" / ") || artist.includes(" - "))) {
      candidate = artist;
    } else if (title !== "unknown" && title.includes(" / ")) {
      candidate = title;
    } else {
      // A plain NAT/NTI pair can be a stale partial update from the previous
      // Deezer context. Keep the selected/current full browse title until the
      // AVR provides the complete formatted track value.
      return;
    }

    // NAT/NTI updates can briefly contain a truncated artist suffix. Keep the
    // complete title already stored by play_media until a different track is
    // reported, otherwise the exact Deezer browse match is lost.
    deezerState.nowPlayingTitle = previousTitle && previousTitle.toLowerCase().startsWith(candidate.toLowerCase()) ? previousTitle : candidate;
  }
}

export class MusicServerZoneAgnosticAdapter implements ZoneAgnosticServiceAdapter {
  private get avrContexts(): AvrContextRegistry {
    return this.deps.avrContexts;
  }

  private get media(): MediaBrowserServices {
    return this.deps.mediaBrowserServices;
  }

  readonly service = MUSIC_SERVER_SERVICE_ID;

  constructor(private readonly deps: AdapterDeps) {}

  getActiveZones(sourceEntityId: string): string[] {
    return getServiceZones(sourceEntityId, this.service, this.deps);
  }

  async onServiceEntered(_sourceEntityId: string, _affectedZones: string[], enteringZones: string[]): Promise<void> {
    for (const zoneEntityId of enteringZones) {
      const state = musicServerStore.getBrowseState(zoneEntityId, this.avrContexts);
      if (state) {
        state.nowPlayingTitle = "";
        state.browseListFrozen = false;
      }
    }
  }

  handleNltContext(sourceEntityId: string, title: string): void {
    const activeZones = this.getActiveZones(sourceEntityId);
    if (!activeZones.some((zoneEntityId) => isLegacyNavigation(zoneEntityId, this.deps))) return;
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalizedTitle === "net") {
      for (const zoneEntityId of activeZones) musicServerStore.resetState(zoneEntityId, this.avrContexts);
      return;
    }
    if (!normalizedTitle.includes("musicserver")) return;
    for (const zoneEntityId of activeZones) {
      const state = musicServerStore.getBrowseState(zoneEntityId, this.avrContexts);
      if (!state?.legacyServiceMenuActive) musicServerStore.resetState(zoneEntityId, this.avrContexts);
      const refreshedState = musicServerStore.getBrowseState(zoneEntityId, this.avrContexts);
      if (refreshedState) refreshedState.legacyServiceMenuActive = true;
    }
  }

  handleNls(sourceEntityId: string, entry: string): void {
    for (const zoneEntityId of this.getActiveZones(sourceEntityId)) {
      if (!isLegacyNavigation(zoneEntityId, this.deps)) continue;
      const title = entry
        .match(/^U\d+-(.*)$/)?.[1]
        ?.trim()
        .toLowerCase();
      // Rows of the NET root menu are not Music Server entries.
      if (title && isNetworkServiceDisplayName(title)) continue;
      this.media.ingestMusicServerListEntry(zoneEntityId, entry);
    }
  }

  handleNla(sourceEntityId: string, xmlPayload: string): void {
    for (const zoneEntityId of this.getActiveZones(sourceEntityId)) {
      this.media.ingestMusicServerXmlEntries(zoneEntityId, xmlPayload);
    }
  }

  handleMetadata(zoneEntityId: string, artist: string): void {
    const musicServerState = musicServerStore.getBrowseState(zoneEntityId, this.avrContexts);
    if (musicServerState) musicServerState.nowPlayingTitle = artist;
  }
}
