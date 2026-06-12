import { hasTuneInPresets, ingestTidalListEntry, ingestTidalXmlEntries, ingestTuneInListEntry, ingestTuneInMenuListEntry, ingestTuneInMenuXmlEntries, ingestTuneInXmlEntries, setTuneInBrowseContext } from "./mediaBrowser.js";
import { getTidalBrowseState, resetTidalBrowseState } from "./tidalBrowserStore.js";
import { updateNowPlayingStation } from "./tuneInBrowserStore.js";
import { resetTuneInMenuBrowseState, updateTuneInMenuNowPlayingStation } from "./tuneInMenuStore.js";
import { TIDAL_SERVICE_ID, TUNEIN_SERVICE_ID } from "./browseServiceContract.js";

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
    for (const zoneEntityId of enteringZones) {
      resetTuneInMenuBrowseState(zoneEntityId);
    }

    await this.maybePreloadTuneIn(sourceEntityId, affectedZones);
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
      ingestTuneInListEntry(zoneEntityId, entry);
      ingestTuneInMenuListEntry(zoneEntityId, entry);
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

  async onServiceEntered(_sourceEntityId: string, _affectedZones: string[], enteringZones: string[]): Promise<void> {
    for (const zoneEntityId of enteringZones) {
      resetTidalBrowseState(zoneEntityId);
    }
  }

  handleNls(sourceEntityId: string, entry: string): void {
    for (const zoneEntityId of this.getActiveZones(sourceEntityId)) {
      ingestTidalListEntry(zoneEntityId, entry);
    }
  }

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