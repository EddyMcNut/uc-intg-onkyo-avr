import * as uc from "@unfoldedcircle/integration-api";
import { MEDIA_BROWSING } from "./constants.js";
import { avrStateManager } from "./avrState.js";
import log from "./loggers.js";
import { looksLikeTuneInDirectory, normalizeTuneInLabel, parseTuneInXmlItems } from "./tuneInFilters.js";
import { addTuneInPreset, getTuneInBrowseState, listTuneInPresets, type TuneInPreset, setTuneInBrowseContextState } from "./tuneInBrowserStore.js";
import { createTuneInBackdrop, getOrCreateTuneInThumbnail } from "./tuneInThumbnails.js";

const integrationName = "mediaBrowser:";

export const TUNEIN_ROOT_ID = "tunein:root";
export const TUNEIN_ROOT_TYPE = "tunein://presets";

function getTuneInPresets(entityId: string): TuneInPreset[] {
  return listTuneInPresets(entityId);
}

export function setTuneInBrowseContext(entityId: string, title: string): void {
  setTuneInBrowseContextState(entityId, title);
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

  const rawTitle = match[2].trim();
  const title = normalizeTuneInLabel(rawTitle);
  if (!title || looksLikeTuneInDirectory(title)) {
    return;
  }

  if (!state.captureMyPresets && state.contextTitle !== "my presets") {
    return;
  }

  addTuneInPreset(entityId, title, getOrCreateTuneInThumbnail);
}

export function ingestTuneInXmlEntries(entityId: string, xmlPayload: string): void {
  const state = getTuneInBrowseState(entityId);
  if (!state || !xmlPayload) {
    return;
  }

  if (!state.captureMyPresets && state.contextTitle !== "my presets") {
    return;
  }

  for (const item of parseTuneInXmlItems(xmlPayload)) {
    if (!item.title || looksLikeTuneInDirectory(item.title, item.iconId)) {
      continue;
    }

    addTuneInPreset(entityId, item.title, getOrCreateTuneInThumbnail);
  }
}

export function getTuneInPresetCount(entityId: string): number {
  return getTuneInPresets(entityId).length;
}

export function hasTuneInPresets(entityId: string): boolean {
  return getTuneInPresetCount(entityId) > 0;
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
    mediaId,
    thumbnail: createTuneInBackdrop()
  };
}

function createTuneInPresetItem(preset: TuneInPreset): uc.BrowseMediaItem {
  return new uc.BrowseMediaItem(preset.mediaId, preset.title, {
    can_play: true,
    media_class: uc.KnownMediaClass.Radio,
    media_type: uc.KnownMediaContentType.Radio,
    thumbnail: preset.thumbnail || "icon://uc:radio"
  });
}

function getTuneInRootItemCount(presetCount: number): number {
  return presetCount;
}

function createRootItem(entityId: string, paging: uc.Paging): uc.BrowseMediaItem {
  const presets = getTuneInPresets(entityId);
  const items = presets.map((preset) => createTuneInPresetItem(preset)).slice(paging.offset, paging.offset + paging.limit);

  return new uc.BrowseMediaItem(TUNEIN_ROOT_ID, "TuneIn", {
    can_browse: true,
    media_class: uc.KnownMediaClass.Directory,
    media_type: TUNEIN_ROOT_TYPE,
    thumbnail: createTuneInBackdrop(),
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
      tuneInPresets.length > 0 ? tuneInPresets.map((preset) => `${preset.presetIndex}:${preset.title}`).join(", ") : "none"
    );
    return uc.BrowseResult.fromPaging(createRootItem(entityId, options.paging), options.paging, getTuneInRootItemCount(tuneInPresets.length));
  }

  const preset = resolveTuneInPreset(options.media_id, options.media_type);
  if (!preset) {
    return uc.StatusCodes.NotFound;
  }

  return new uc.BrowseResult(createTuneInPresetItem(preset), uc.Pagination.fromPaging(options.paging));
}
