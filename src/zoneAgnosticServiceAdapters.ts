import {
  hasTuneInPresets,
  ingestDeezerXmlEntries,
  ingestMusicServerXmlEntries,
  ingestTidalXmlEntries,
  ingestTuneInListEntry,
  ingestTuneInMenuXmlEntries,
  ingestTuneInXmlEntries,
  setTuneInBrowseContext
} from "./mediaBrowser.js";
import { getDeezerBrowseState } from "./deezerBrowserStore.js";
import { getMusicServerBrowseState } from "./musicServerBrowserStore.js";
import { getTidalBrowseState } from "./tidalBrowserStore.js";
import { clearTuneInPresets, resetTuneInBrowseState, updateNowPlayingStation } from "./tuneInBrowserStore.js";
import { resetTuneInMenuBrowseState, setTuneInMenuNowPlayingStation, updateTuneInMenuNowPlayingStation } from "./tuneInMenuStore.js";
import { DEEZER_SERVICE_ID, MUSIC_SERVER_SERVICE_ID, TIDAL_SERVICE_ID, TUNEIN_SERVICE_ID } from "./browseServiceContract.js";

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
  // Drop stale now-playing marks so a fresh (re-)entry of the service starts with a clean browser.
  clearNowPlayingForZones?(zoneEntityIds: string[]): void;
};

type AdapterDeps = {
  state: SubSourceStateApi;
  getPhysicalAvrId: (entityId: string) => string;
};

type TuneInAdapterDeps = AdapterDeps & {
  isTuneInFullMenu: (zoneEntityId: string) => Promise<boolean>;
  preloadTuneInPresets: (sourceEntityId: string) => Promise<void>;
};

function getServiceZones(sourceEntityId: string, service: string, deps: AdapterDeps): string[] {
  const netZones = deps.state.getEntitiesByPhysicalAvrAndSource(deps.getPhysicalAvrId(sourceEntityId), "net").filter((zoneEntityId) => deps.state.getSubSource(zoneEntityId) === service);
  if (netZones.length > 0) {
    return netZones;
  }

  return deps.state.getSubSource(sourceEntityId) === service ? [sourceEntityId] : [];
}

export class TuneInZoneAgnosticAdapter implements ZoneAgnosticServiceAdapter {
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
      clearTuneInPresets(zoneEntityId);
    }

    await this.maybePreloadTuneIn(sourceEntityId, affectedZones);
  }

  clearNowPlayingForZones(zoneEntityIds: string[]): void {
    for (const zoneEntityId of zoneEntityIds) {
      resetTuneInMenuBrowseState(zoneEntityId);
      setTuneInMenuNowPlayingStation(zoneEntityId, "");
      resetTuneInBrowseState(zoneEntityId);
    }
  }

  async onServiceDetectedFromFld(sourceEntityId: string, netZones: string[]): Promise<void> {
    await this.maybePreloadTuneIn(sourceEntityId, netZones);
  }

  handleNltContext(sourceEntityId: string, title: string): void {
    for (const zoneEntityId of this.getActiveZones(sourceEntityId)) {
      setTuneInBrowseContext(zoneEntityId, title);
    }
  }

  handleNls(sourceEntityId: string, entry: string): void {
    for (const zoneEntityId of this.getActiveZones(sourceEntityId)) {
      // Full Menu is XML-backed. NLS is retained only for the configured
      // My Presets station list, where the AVR still reports preset rows.
      ingestTuneInListEntry(zoneEntityId, entry);
    }
  }

  handleNla(sourceEntityId: string, xmlPayload: string): void {
    for (const zoneEntityId of this.getActiveZones(sourceEntityId)) {
      ingestTuneInXmlEntries(zoneEntityId, xmlPayload);
      ingestTuneInMenuXmlEntries(zoneEntityId, xmlPayload);
    }
  }

  handleMetadata(zoneEntityId: string, artist: string): void {
    updateNowPlayingStation(zoneEntityId, artist);
    updateTuneInMenuNowPlayingStation(zoneEntityId, artist);
  }

  private async maybePreloadTuneIn(sourceEntityId: string, zoneEntityIds: string[]): Promise<void> {
    // hasNonFullMenuZone: true if at least one zone uses My Presets (non-full) menu style
    const hasNonFullMenuZone = await Promise.all(zoneEntityIds.map((zoneEntityId) => this.deps.isTuneInFullMenu(zoneEntityId))).then((results) => results.some((isFull) => !isFull));
    const needsPreload = hasNonFullMenuZone && zoneEntityIds.some((zoneEntityId) => !hasTuneInPresets(zoneEntityId));
    if (!needsPreload) {
      return;
    }

    await this.deps.preloadTuneInPresets(sourceEntityId);
  }
}

export class TidalZoneAgnosticAdapter implements ZoneAgnosticServiceAdapter {
  readonly service = TIDAL_SERVICE_ID;

  constructor(private readonly deps: AdapterDeps) {}

  getActiveZones(sourceEntityId: string): string[] {
    return getServiceZones(sourceEntityId, this.service, this.deps);
  }

  async onServiceEntered(_sourceEntityId: string, _affectedZones: string[], _enteringZones: string[]): Promise<void> {}

  // Tidal browsing is XML-only. Ignore legacy NLS ten-line updates so they
  // cannot overwrite an active NLA/NLAL browse context.
  handleNls(_sourceEntityId: string, _entry: string): void {}

  handleNla(sourceEntityId: string, xmlPayload: string): void {
    for (const zoneEntityId of this.getActiveZones(sourceEntityId)) {
      ingestTidalXmlEntries(zoneEntityId, xmlPayload);
    }
  }

  handleMetadata(zoneEntityId: string, artist: string): void {
    const tidalState = getTidalBrowseState(zoneEntityId);
    if (tidalState) tidalState.nowPlayingTitle = artist;
  }
}

export class DeezerZoneAgnosticAdapter implements ZoneAgnosticServiceAdapter {
  readonly service = DEEZER_SERVICE_ID;

  constructor(private readonly deps: AdapterDeps) {}

  getActiveZones(sourceEntityId: string): string[] {
    return getServiceZones(sourceEntityId, this.service, this.deps);
  }

  async onServiceEntered(_sourceEntityId: string, _affectedZones: string[], _enteringZones: string[]): Promise<void> {}

  // Deezer browsing is XML-only; ignore legacy NLS list updates.
  handleNls(_sourceEntityId: string, _entry: string): void {}

  handleNla(sourceEntityId: string, xmlPayload: string): void {
    for (const zoneEntityId of this.getActiveZones(sourceEntityId)) {
      ingestDeezerXmlEntries(zoneEntityId, xmlPayload);
    }
  }

  handleMetadata(zoneEntityId: string, artist: string): void {
    const deezerState = getDeezerBrowseState(zoneEntityId);
    if (deezerState) deezerState.nowPlayingTitle = artist;
  }
}

export class MusicServerZoneAgnosticAdapter implements ZoneAgnosticServiceAdapter {
  readonly service = MUSIC_SERVER_SERVICE_ID;

  constructor(private readonly deps: AdapterDeps) {}

  getActiveZones(sourceEntityId: string): string[] {
    return getServiceZones(sourceEntityId, this.service, this.deps);
  }

  async onServiceEntered(_sourceEntityId: string, _affectedZones: string[], _enteringZones: string[]): Promise<void> {}

  // Music Server browsing is XML-only. The Onkyo app does not use the legacy
  // NLS ten-line list for this service; accepting it here can mix stale list
  // entries into an active NLA/NLAL browse context.
  handleNls(_sourceEntityId: string, _entry: string): void {}

  handleNla(sourceEntityId: string, xmlPayload: string): void {
    for (const zoneEntityId of this.getActiveZones(sourceEntityId)) {
      ingestMusicServerXmlEntries(zoneEntityId, xmlPayload);
    }
  }

  handleMetadata(zoneEntityId: string, artist: string): void {
    const musicServerState = getMusicServerBrowseState(zoneEntityId);
    if (musicServerState) musicServerState.nowPlayingTitle = artist;
  }
}
