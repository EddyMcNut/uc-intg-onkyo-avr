// The state updates that follow from parsed AVR messages. IscpCommandParser only decodes messages and reports what it
// found through this port; the rules for applying it to the browse stores and the AVR info store live here.
// Effects are applied synchronously while parsing, so they keep their order relative to the following messages
// (e.g. an NLT list header must be stored before the NLS/NLA rows of that list arrive).
import { PRESET_BAND_EMPTY, type AvrInfo } from "./avrInfoStore.js";
import { sharedAvrContexts, type AvrContextRegistry } from "./avrContext.js";
import { DEEZER_SERVICE_ID, MUSIC_SERVER_SERVICE_ID, TIDAL_SERVICE_ID, TUNEIN_SERVICE_ID } from "./browseServiceContract.js";
import { getMenuBrowseService } from "./menuBrowseServices.js";
import type { MenuBrowseOption, MenuBrowseState } from "./menuBrowseState.js";
import { getTuneInMenuBrowseState, type TuneInMenuBrowseState } from "./tuneInMenuStore.js";
import log from "./loggers.js";

const logSource = "parserEffects:";

// The list header of an NLT message: cursor position, total item count and browse layer.
export interface ListHeader {
  cursorOffset: number;
  totalCount: number;
  // 0 when the message carries no layer.
  layerNumber: number;
}

export interface ParserEffects {
  // NLT list header for the zone's current sub-source.
  applyListHeader(entityId: string, subSource: string, header: ListHeader): void;
  // NLT list header that arrived together with a service title, before the sub-source is committed for that service.
  applyServiceEntryListHeader(entityId: string, serviceId: string, header: ListHeader): void;
  // NRI: the AVR's description of itself.
  storeAvrInfo(entityId: string, info: AvrInfo): void;
}

export interface MenuBrowseStoreApi {
  getBrowseState(entityId: string): MenuBrowseState<MenuBrowseOption> | null;
}

export interface TuneInMenuStoreApi {
  getBrowseState(entityId: string): TuneInMenuBrowseState | null;
}

// Stores the effects write to. Injectable for tests; a missing store means "nothing to update" for that service.
export interface ParserEffectStores {
  deezer?: MenuBrowseStoreApi | null;
  tidal?: MenuBrowseStoreApi | null;
  musicServer?: MenuBrowseStoreApi | null;
  tuneInMenu?: TuneInMenuStoreApi | null;
}

export function createParserEffects(stores: ParserEffectStores, storeAvrInfo: (entityId: string, info: AvrInfo) => void = storeAndLogAvrInfo(sharedAvrContexts)): ParserEffects {
  const menuStores: Record<string, MenuBrowseStoreApi | null | undefined> = {
    [DEEZER_SERVICE_ID]: stores.deezer,
    [TIDAL_SERVICE_ID]: stores.tidal,
    [MUSIC_SERVER_SERVICE_ID]: stores.musicServer
  };
  const menuState = (serviceId: string, entityId: string) => (Object.prototype.hasOwnProperty.call(menuStores, serviceId) ? (menuStores[serviceId]?.getBrowseState(entityId) ?? null) : null);

  return {
    applyListHeader(entityId, subSource, { cursorOffset, totalCount, layerNumber }) {
      // Tidal, Deezer, Music Server. Once a track is selected, NLT describes the playback context, not the XML browse
      // list: keep the browse layer for subsequent selections from the still-visible frozen list.
      // Don't overwrite the cursor during harvest; the harvest loop manages it locally.
      const state = menuState(subSource, entityId);
      if (state) {
        if (!state.harvestMode) state.nlsCursorOffset = cursorOffset;
        state.totalListItemCount = totalCount;
        if (layerNumber > 0 && !state.browseListFrozen) state.nlsLayerNumber = layerNumber;
      }

      if (subSource === TUNEIN_SERVICE_ID) {
        const tuneInState = stores.tuneInMenu?.getBrowseState(entityId);
        if (tuneInState) {
          if (!tuneInState.harvestMode) tuneInState.nlsCursorOffset = cursorOffset;
          tuneInState.totalListItemCount = totalCount;
          if (layerNumber > 0) tuneInState.nlsLayerNumber = layerNumber;
        }
      }
    },

    applyServiceEntryListHeader(entityId, serviceId, { cursorOffset, totalCount, layerNumber }) {
      // NLT can arrive before avrState has committed the canonical sub-source (the capture shows the service title
      // and list metadata in that order). Preserve the list total/layer immediately so XML-only browsers do not fall
      // back to requesting a single root item.
      const state = menuState(serviceId, entityId);
      if (!state) return;
      if (!state.browseListFrozen) state.nlsCursorOffset = cursorOffset;
      state.totalListItemCount = totalCount;
      if (layerNumber > 0 && !state.browseListFrozen) state.nlsLayerNumber = layerNumber;
    },

    storeAvrInfo
  };
}

// The effects used by the running driver: the real browse stores, and the AVR info store of the AVR's context.
export function createDefaultParserEffects(avrContexts: AvrContextRegistry = sharedAvrContexts): ParserEffects {
  return createParserEffects(
    {
      deezer: getMenuBrowseService(DEEZER_SERVICE_ID)?.store,
      tidal: getMenuBrowseService(TIDAL_SERVICE_ID)?.store,
      musicServer: getMenuBrowseService(MUSIC_SERVER_SERVICE_ID)?.store,
      tuneInMenu: { getBrowseState: getTuneInMenuBrowseState }
    },
    storeAndLogAvrInfo(avrContexts)
  );
}

const storeAndLogAvrInfo =
  (avrContexts: AvrContextRegistry) =>
  (entityId: string, info: AvrInfo): void => {
    const avrInfo = avrContexts.forEntity(entityId)?.avrInfo;
    if (!avrInfo) return;
    avrInfo.set(info);
    const dabPresets = avrInfo.dabPresets();
    const fmPresets = avrInfo.fmPresets();
    const emptyPresets = info.presets.filter((preset) => preset.band === PRESET_BAND_EMPTY);
    log.debug("%s [%s] Collected AVR info: %d DAB preset(s), %d FM preset(s) of %d slot(s)", logSource, entityId, dabPresets.length, fmPresets.length, info.presetCount);
    if (dabPresets.length > 0) {
      log.debug("%s [%s] DAB presets (band=2, no frequency):\n%s", logSource, entityId, dabPresets.map((preset) => `  slot ${String(preset.slot).padStart(2, " ")}: ${preset.name}`).join("\n"));
    }
    if (fmPresets.length > 0) {
      log.debug(
        "%s [%s] FM presets (band=1, carries a frequency):\n%s",
        logSource,
        entityId,
        fmPresets.map((preset) => `  slot ${String(preset.slot).padStart(2, " ")}: ${preset.name} @ ${preset.freq} MHz`).join("\n")
      );
    }
    if (emptyPresets.length > 0) {
      log.debug("%s [%s] Empty slots (band=0): %d (slots %s)", logSource, entityId, emptyPresets.length, emptyPresets.map((preset) => preset.slot).join(", "));
    }
  };
