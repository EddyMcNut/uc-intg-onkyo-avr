// Test helpers with the former avrInfoStore function names, working on the AVR info of an entity's AvrContext in the
// test registry (testAvrContexts, which tests pass to the components they exercise).
import { testAvrContexts } from "./contexts.js";
import type { AvrInfo } from "../../src/avrInfoStore.js";

const avrInfoOf = (entityId: string) => testAvrContexts.forEntity(entityId)?.avrInfo;

export const setAvrInfo = (entityId: string, info: AvrInfo): void => avrInfoOf(entityId)?.set(info);
export const resetAvrInfo = (entityId: string): void => avrInfoOf(entityId)?.reset();
export const getAvrInfo = (entityId: string): AvrInfo | null => avrInfoOf(entityId)?.get() ?? null;
export const listDabPresets = (entityId: string) => avrInfoOf(entityId)?.dabPresets() ?? [];
export const listFmPresets = (entityId: string) => avrInfoOf(entityId)?.fmPresets() ?? [];
export const listNamedPresets = (entityId: string) => avrInfoOf(entityId)?.namedPresets() ?? [];
export const listSelectors = (entityId: string) => avrInfoOf(entityId)?.selectors() ?? [];
export const listNetServiceNames = (entityId: string) => avrInfoOf(entityId)?.netServiceNames() ?? [];
export const hasCompleteInputSourceInfo = (entityId: string) => avrInfoOf(entityId)?.hasCompleteInputSourceInfo() ?? false;
export const getControlValue = (entityId: string, controlId: string) => avrInfoOf(entityId)?.controlValue(controlId);
export const getAvrVolumeScale = (entityId: string, zone: string) => avrInfoOf(entityId)?.volumeScale(zone);
