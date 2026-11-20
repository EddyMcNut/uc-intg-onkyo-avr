export type TuneInPreset = {
  presetIndex: number;
  title: string;
  // Part of the NLS label before the "|", matching the station name returned by NTI. Equals title when there is no pipe.
  stationKey: string;
  // Full raw NLS label before any normalization, used to match NTI values that themselves contain "|".
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
  // True after selecting a station. Legacy receivers send a spontaneous NLS
  // update for the ten visible rows after playback starts; it must not replace
  // the complete harvested My Presets list.
  browseListFrozen: boolean;
  // Station name currently playing (from NTI), used to highlight it in the preset list.
  nowPlayingStation: string;
};

function createTuneInBrowseState(): TuneInBrowseState {
  return {
    contextTitle: "",
    captureMyPresets: false,
    presetsByMenuIndex: new Map<number, TuneInPreset>(),
    presetIndexByTitle: new Map<string, number>(),
    thumbnailByTitle: new Map<string, string>(),
    backgroundSignature: "",
    browseListFrozen: false,
    nowPlayingStation: ""
  };
}

// TuneIn "My Presets" of one physical AVR. One instance lives in that AVR's AvrContext (see avrContext.ts).
export class TuneInPresetStore {
  private readonly browseState: TuneInBrowseState = createTuneInBrowseState();

  state(): TuneInBrowseState {
    return this.browseState;
  }

  setContext(title: string): void {
    const state = this.browseState;
    const normalized = title.trim().toLowerCase();
    const enteringMyPresets = normalized === "my presets" && state.contextTitle !== normalized;
    state.contextTitle = normalized;
    state.captureMyPresets = normalized === "my presets";

    if (enteringMyPresets && !state.browseListFrozen) {
      state.presetsByMenuIndex.clear();
      state.presetIndexByTitle.clear();
    }
  }

  add(title: string, stationKey: string, rawLabel: string, thumbnailResolver: (state: TuneInBrowseState, title: string) => string, reportedIndex?: number): void {
    const state = this.browseState;
    if (state.browseListFrozen) return;

    const existingPresetIndex =
      state.presetIndexByTitle.get(title) ??
      [...state.presetsByMenuIndex.values()].find((preset) => preset.stationKey.toLowerCase() === stationKey.toLowerCase() || preset.rawLabel.toLowerCase() === rawLabel.toLowerCase())?.presetIndex;
    const presetIndex = existingPresetIndex ?? reportedIndex ?? state.presetIndexByTitle.size + 1;

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

  // Update the nowPlayingStation only when the candidate matches a known preset.
  // This prevents track/show titles (which NTI also sends) from overwriting the station name.
  updateNowPlayingStation(candidate: string): boolean {
    const lower = candidate.toLowerCase();
    for (const preset of this.browseState.presetsByMenuIndex.values()) {
      if (preset.rawLabel.toLowerCase() === lower || preset.stationKey.toLowerCase() === lower || preset.title.toLowerCase() === lower) {
        this.browseState.nowPlayingStation = candidate;
        return true;
      }
    }
    return false;
  }

  get(presetIndex: number): TuneInPreset | undefined {
    return this.browseState.presetsByMenuIndex.get(presetIndex);
  }

  // Clear the now-playing station marker on a fresh service entry so the browser starts clean.
  // Presets are intentionally kept: they are the cached "My Presets" list and are only re-harvested lazily.
  resetNowPlaying(): void {
    this.browseState.nowPlayingStation = "";
  }

  // Clear the cached preset list before a fresh TuneIn service entry. The cache is intentionally retained during
  // normal updates, but a new entry must re-harvest the AVR's current My Presets list so newly added or removed
  // stations appear.
  clearPresets(): void {
    this.browseState.presetsByMenuIndex.clear();
    this.browseState.presetIndexByTitle.clear();
    this.browseState.browseListFrozen = false;
  }

  setFrozen(frozen: boolean): void {
    this.browseState.browseListFrozen = frozen;
  }

  list(sort: "alphabetical" | "preset-order" = "alphabetical"): TuneInPreset[] {
    const presets = [...this.browseState.presetsByMenuIndex.values()];
    return sort === "preset-order" ? presets.sort((a, b) => a.presetIndex - b.presetIndex) : presets.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  }
}
