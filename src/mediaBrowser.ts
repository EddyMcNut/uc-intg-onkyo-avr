import * as uc from "@unfoldedcircle/integration-api";
import { MEDIA_BROWSING } from "./constants.js";
import { avrStateManager } from "./avrState.js";
import { buildPhysicalAvrId } from "./configManager.js";
import log from "./loggers.js";

const integrationName = "mediaBrowser:";

export const TUNEIN_ROOT_ID = "tunein:root";
export const TUNEIN_ROOT_TYPE = "tunein://presets";

type TuneInPreset = {
  presetIndex: number;
  title: string;
  mediaId: string;
};

type TuneInBrowseState = {
  contextTitle: string;
  captureMyPresets: boolean;
  presetsByMenuIndex: Map<number, TuneInPreset>;
};

const tuneInBrowseStateByPhysicalAvr = new Map<string, TuneInBrowseState>();

function parseEntityId(entityId: string): { model: string; host: string } | null {
  const parts = entityId.trim().split(/\s+/);
  if (parts.length < 3) {
    return null;
  }

  const host = parts[parts.length - 2];
  const model = parts.slice(0, -2).join(" ");
  if (!host || !model) {
    return null;
  }

  return { model, host };
}

function getPhysicalAvrId(entityId: string): string | null {
  const parsed = parseEntityId(entityId);
  if (!parsed) {
    return null;
  }

  return buildPhysicalAvrId(parsed.model, parsed.host);
}

function getTuneInBrowseState(entityId: string): TuneInBrowseState | null {
  const physicalAvrId = getPhysicalAvrId(entityId);
  if (!physicalAvrId) {
    return null;
  }

  const existing = tuneInBrowseStateByPhysicalAvr.get(physicalAvrId);
  if (existing) {
    return existing;
  }

  const created: TuneInBrowseState = {
    contextTitle: "",
    captureMyPresets: false,
    presetsByMenuIndex: new Map<number, TuneInPreset>()
  };
  tuneInBrowseStateByPhysicalAvr.set(physicalAvrId, created);
  return created;
}

function normalizeTuneInLabel(label: string): string {
  const pipeIndex = label.indexOf("|");
  if (pipeIndex === -1) {
    return label.trim();
  }
  return label.substring(pipeIndex + 1).trim();
}

export function setTuneInBrowseContext(entityId: string, title: string): void {
  const state = getTuneInBrowseState(entityId);
  if (!state) {
    return;
  }

  const normalized = title.trim().toLowerCase();
  state.contextTitle = normalized;
  const isMyPresets = normalized === "my presets";

  if (isMyPresets) {
    state.presetsByMenuIndex.clear();
  }
  state.captureMyPresets = isMyPresets;
}

export function ingestTuneInListEntry(entityId: string, entry: string): void {
  const state = getTuneInBrowseState(entityId);
  if (!state) {
    return;
  }

  const match = entry.match(/^U(\d+)-(.*)$/);
  if (!match) {
    return;
  }

  if (!state.captureMyPresets) {
    state.captureMyPresets = true;
    if (!state.contextTitle) {
      state.presetsByMenuIndex.clear();
      log.info("%s [%s] inferring TuneIn preset collection from list entry payload", integrationName, entityId);
    }
  }

  const menuIndex = parseInt(match[1], 10);
  if (isNaN(menuIndex) || menuIndex < 0) {
    return;
  }

  const presetIndex = menuIndex + 1;
  const rawTitle = match[2].trim();
  const title = normalizeTuneInLabel(rawTitle);
  if (!title) {
    return;
  }

  state.presetsByMenuIndex.set(menuIndex, {
    presetIndex,
    title,
    mediaId: `tunein:preset:${presetIndex}`
  });
}

function getTuneInPresets(entityId: string): TuneInPreset[] {
  const state = getTuneInBrowseState(entityId);
  if (!state) {
    return [];
  }

  return [...state.presetsByMenuIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, preset]) => preset);
}

export function isMediaBrowsingAvailable(entityId: string): boolean {
  const source = avrStateManager.getSource(entityId);
  const subSource = avrStateManager.getSubSource(entityId);

  return source === "net" && MEDIA_BROWSING.includes(subSource);
}

export function resolveTuneInPreset(mediaId?: string, mediaType?: string): TuneInPreset | undefined {
  if (!mediaId) {
    return undefined;
  }

  if (mediaType !== undefined && mediaType !== uc.KnownMediaContentType.Radio) {
    return undefined;
  }

  const match = mediaId.match(/^tunein:preset:(\d+)$/);
  if (!match) {
    return undefined;
  }

  const presetIndex = parseInt(match[1], 10);
  if (isNaN(presetIndex) || presetIndex < 1) {
    return undefined;
  }

  return {
    presetIndex,
    title: `Preset ${presetIndex}`,
    mediaId
  };
}

function createTuneInPresetItem(preset: TuneInPreset): uc.BrowseMediaItem {
  return new uc.BrowseMediaItem(preset.mediaId, preset.title, {
    can_play: true,
    media_class: uc.KnownMediaClass.Radio,
    media_type: uc.KnownMediaContentType.Radio,
    thumbnail: "icon://uc:radio"
  });
}

function createRootItem(entityId: string, paging: uc.Paging): uc.BrowseMediaItem {
  const items = getTuneInPresets(entityId)
    .slice(paging.offset, paging.offset + paging.limit)
    .map((preset) => createTuneInPresetItem(preset));

  return new uc.BrowseMediaItem(TUNEIN_ROOT_ID, "TuneIn", {
    can_browse: true,
    media_class: uc.KnownMediaClass.Directory,
    media_type: TUNEIN_ROOT_TYPE,
    thumbnail: "icon://uc:radio",
    items
  });
}

export async function browseTuneInMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
  if (!isMediaBrowsingAvailable(entityId)) {
    return uc.StatusCodes.NotFound;
  }

  const tuneInPresets = getTuneInPresets(entityId);
  if (!options.media_id || options.media_id === TUNEIN_ROOT_ID) {
    log.info(
      "%s [%s] browsable TuneIn presets (%d): %s",
      integrationName,
      entityId,
      tuneInPresets.length,
      tuneInPresets.length > 0
        ? tuneInPresets.map((preset) => `${preset.presetIndex}:${preset.title}`).join(", ")
        : "none"
    );
    return uc.BrowseResult.fromPaging(createRootItem(entityId, options.paging), options.paging, tuneInPresets.length);
  }

  const preset = resolveTuneInPreset(options.media_id, options.media_type);
  if (!preset) {
    return uc.StatusCodes.NotFound;
  }

  return new uc.BrowseResult(createTuneInPresetItem(preset), uc.Pagination.fromPaging(options.paging));
}
