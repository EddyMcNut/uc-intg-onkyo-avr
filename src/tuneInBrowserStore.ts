import { buildPhysicalAvrId } from "./configManager.js";

export type TuneInPreset = {
  presetIndex: number;
  title: string;
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

export function getTuneInBrowseState(entityId: string): TuneInBrowseState | null {
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
    presetsByMenuIndex: new Map<number, TuneInPreset>(),
    presetIndexByTitle: new Map<string, number>(),
    thumbnailByTitle: new Map<string, string>(),
    backgroundSignature: ""
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

export function addTuneInPreset(
  entityId: string,
  title: string,
  thumbnailResolver: (state: TuneInBrowseState, title: string) => string
): void {
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
    mediaId: `tunein:preset:${presetIndex}`,
    thumbnail: thumbnailResolver(state, title)
  });
}

export function listTuneInPresets(entityId: string): TuneInPreset[] {
  const state = getTuneInBrowseState(entityId);
  if (!state) {
    return [];
  }

  return [...state.presetsByMenuIndex.values()].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}
