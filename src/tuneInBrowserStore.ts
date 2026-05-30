import { physicalAvrIdFromEntityId } from "./configManager.js";

export type TuneInPreset = {
  presetIndex: number;
  title: string;
  /** Part of the NLS label before the "|", matching the station name returned by NTI. Equals title when there is no pipe. */
  stationKey: string;
  /** Full raw NLS label before any normalization, used to match NTI values that themselves contain "|". */
  rawLabel: string;
  mediaId: string;
  thumbnail?: string;
};

export type TuneInBrowseState = {
  contextTitle: string;
  captureMyPresets: boolean;
  presetsByMenuIndex: Map<number, TuneInPreset>;
  presetIndexByTitle: Map<string, number>;
  thumbnailByTitle: Map<string, string>;
  backgroundSignature: string;
  /** Station name currently playing (from NTI), used to highlight it in the preset list. */
  nowPlayingStation: string;
};

const tuneInBrowseStateByPhysicalAvr = new Map<string, TuneInBrowseState>();

export function getTuneInBrowseState(entityId: string): TuneInBrowseState | null {
  const physicalAvrId = physicalAvrIdFromEntityId(entityId);
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
    presetsByMenuIndex: new Map<number, TuneInPreset>(),
    presetIndexByTitle: new Map<string, number>(),
    thumbnailByTitle: new Map<string, string>(),
    backgroundSignature: "",
    nowPlayingStation: ""
  };
  tuneInBrowseStateByPhysicalAvr.set(physicalAvrId, created);
  return created;
}

export function setTuneInBrowseContextState(entityId: string, title: string): void {
  const state = getTuneInBrowseState(entityId);
  if (!state) {
    return;
  }

  const normalized = title.trim().toLowerCase();
  const enteringMyPresets = normalized === "my presets" && state.contextTitle !== normalized;
  state.contextTitle = normalized;
  state.captureMyPresets = normalized === "my presets";

  if (enteringMyPresets) {
    state.presetsByMenuIndex.clear();
    state.presetIndexByTitle.clear();
  }
}

export function addTuneInPreset(entityId: string, title: string, stationKey: string, rawLabel: string, thumbnailResolver: (state: TuneInBrowseState, title: string) => string): void {
  const state = getTuneInBrowseState(entityId);
  if (!state) {
    return;
  }

  const existingPresetIndex = state.presetIndexByTitle.get(title);
  const presetIndex = existingPresetIndex ?? state.presetIndexByTitle.size + 1;

  if (existingPresetIndex === undefined) {
    state.presetIndexByTitle.set(title, presetIndex);
  }

  state.presetsByMenuIndex.set(presetIndex, {
    presetIndex,
    title,
    stationKey,
    rawLabel,
    mediaId: `tunein:preset:${presetIndex}`,
    thumbnail: thumbnailResolver(state, title)
  });
}

function matchesAnyPreset(state: TuneInBrowseState, candidate: string): boolean {
  const lower = candidate.toLowerCase();
  for (const preset of state.presetsByMenuIndex.values()) {
    if (preset.rawLabel.toLowerCase() === lower || preset.stationKey.toLowerCase() === lower || preset.title.toLowerCase() === lower) {
      return true;
    }
  }
  return false;
}

/**
 * Update the nowPlayingStation only when the candidate matches a known preset.
 * This prevents track/show titles (which NTI also sends) from overwriting the station name.
 */
export function updateNowPlayingStation(entityId: string, candidate: string): void {
  const state = getTuneInBrowseState(entityId);
  if (!state) return;
  if (matchesAnyPreset(state, candidate)) {
    state.nowPlayingStation = candidate;
  }
}

export function listTuneInPresets(entityId: string): TuneInPreset[] {
  const state = getTuneInBrowseState(entityId);
  if (!state) {
    return [];
  }

  return [...state.presetsByMenuIndex.values()].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}
