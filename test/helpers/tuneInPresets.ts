// Test helpers with the former tuneInBrowserStore function names, working on the TuneIn presets of an entity's
// AvrContext in the test registry (testAvrContexts, which tests pass to the components they exercise).
import { testAvrContexts } from "./contexts.js";
import type { TuneInBrowseState, TuneInPreset } from "../../src/tuneInBrowserStore.js";

const presetsOf = (entityId: string) => testAvrContexts.forEntity(entityId)?.tuneInPresets;

export const getTuneInBrowseState = (entityId: string): TuneInBrowseState | null => presetsOf(entityId)?.state() ?? null;
export const setTuneInBrowseContextState = (entityId: string, title: string): void => presetsOf(entityId)?.setContext(title);
export const addTuneInPreset = (
  entityId: string,
  title: string,
  stationKey: string,
  rawLabel: string,
  thumbnailResolver: (state: TuneInBrowseState, title: string) => string,
  reportedIndex?: number
): void => presetsOf(entityId)?.add(title, stationKey, rawLabel, thumbnailResolver, reportedIndex);
export const updateNowPlayingStation = (entityId: string, candidate: string): boolean => presetsOf(entityId)?.updateNowPlayingStation(candidate) ?? false;
export const getTuneInPreset = (entityId: string, presetIndex: number): TuneInPreset | undefined => presetsOf(entityId)?.get(presetIndex);
export const resetTuneInBrowseState = (entityId: string): void => presetsOf(entityId)?.resetNowPlaying();
export const clearTuneInPresets = (entityId: string): void => presetsOf(entityId)?.clearPresets();
export const setTuneInBrowseFrozen = (entityId: string, frozen: boolean): void => presetsOf(entityId)?.setFrozen(frozen);
export const listTuneInPresets = (entityId: string, sort: "alphabetical" | "preset-order" = "alphabetical"): TuneInPreset[] => presetsOf(entityId)?.list(sort) ?? [];
