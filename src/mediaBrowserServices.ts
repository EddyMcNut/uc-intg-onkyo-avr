import * as uc from "@unfoldedcircle/integration-api";
import { TuneInMediaBrowser } from "./tuneInMediaBrowser.js";
import { TidalMediaBrowser } from "./tidalMediaBrowser.js";
import { DeezerMediaBrowser } from "./deezerMediaBrowser.js";

// Re-export service constants
export { TUNEIN_ROOT_ID, TUNEIN_ROOT_TYPE, TUNEIN_MENU_ROOT_ID, TUNEIN_MENU_ROOT_TYPE, TUNEIN_MENU_BACK_ID } from "./tuneInMediaBrowser.js";
export { TIDAL_ROOT_ID, TIDAL_ROOT_TYPE, TIDAL_MENU_ROOT_ID, TIDAL_BACK_ID } from "./tidalMediaBrowser.js";
export { DEEZER_ROOT_ID, DEEZER_ROOT_TYPE, DEEZER_MENU_ROOT_ID, DEEZER_BACK_ID } from "./deezerMediaBrowser.js";

// Service browser instances
const tuneInBrowser = new TuneInMediaBrowser();
const tidalBrowser = new TidalMediaBrowser();
const deezerBrowser = new DeezerMediaBrowser();

// TuneIn service delegation
export function setTuneInBrowseContext(entityId: string, title: string): void {
  tuneInBrowser.setBrowseContext(entityId, title);
}

export function ingestTuneInListEntry(entityId: string, entry: string): void {
  tuneInBrowser.ingestListEntry(entityId, entry);
}

export function ingestTuneInMenuListEntry(entityId: string, entry: string): void {
  tuneInBrowser.ingestMenuListEntry(entityId, entry);
}

export function ingestTuneInMenuXmlEntries(entityId: string, xmlPayload: string): void {
  tuneInBrowser.ingestMenuXmlEntries(entityId, xmlPayload);
}

export function ingestTuneInXmlEntries(entityId: string, xmlPayload: string): void {
  tuneInBrowser.ingestXmlEntries(entityId, xmlPayload);
}

export function getTuneInPresetCount(entityId: string): number {
  return tuneInBrowser.getPresetCount(entityId);
}

export function hasTuneInPresets(entityId: string): boolean {
  return tuneInBrowser.hasPresets(entityId);
}

export function resolveTuneInPreset(mediaId?: string, mediaType?: string) {
  return tuneInBrowser.resolvePreset(mediaId, mediaType);
}

export async function browseTuneInMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
  return tuneInBrowser.browse(entityId, options);
}

export function isTuneInMenuRootRequest(mediaId?: string, mediaType?: string): boolean {
  return tuneInBrowser.isMenuRootRequest(mediaId, mediaType);
}

export function resolveTuneInMenuOption(entityId: string, mediaId?: string, mediaType?: string) {
  return tuneInBrowser.resolveMenuOption(entityId, mediaId, mediaType);
}

export function isTuneInBackRequest(mediaId?: string, mediaType?: string): boolean {
  return tuneInBrowser.isBackRequest(mediaId, mediaType);
}

export async function browseTuneInMenuMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
  return tuneInBrowser.browseMenu(entityId, options);
}

// Tidal service delegation
export function ingestTidalXmlEntries(entityId: string, xmlPayload: string): void {
  tidalBrowser.ingestXmlEntries(entityId, xmlPayload);
}

export function ingestTidalListEntry(entityId: string, entry: string): void {
  tidalBrowser.ingestListEntry(entityId, entry);
}

export function resolveTidalMenuOption(mediaId?: string, mediaType?: string) {
  return tidalBrowser.resolveMenuOption(mediaId, mediaType);
}

export function isTidalMainMenuRequest(mediaId?: string, mediaType?: string): boolean {
  return tidalBrowser.isMainMenuRequest(mediaId, mediaType);
}

export function isTidalBackRequest(mediaId?: string, mediaType?: string): boolean {
  return tidalBrowser.isBackRequest(mediaId, mediaType);
}

export async function browseTidalMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
  return tidalBrowser.browse(entityId, options);
}

// Deezer service delegation
export function ingestDeezerXmlEntries(entityId: string, xmlPayload: string): void {
  deezerBrowser.ingestXmlEntries(entityId, xmlPayload);
}

export function ingestDeezerListEntry(entityId: string, entry: string): void {
  deezerBrowser.ingestListEntry(entityId, entry);
}

export function resolveDeezerMenuOption(mediaId?: string, mediaType?: string) {
  return deezerBrowser.resolveMenuOption(mediaId, mediaType);
}

export function isDeezerMainMenuRequest(mediaId?: string, mediaType?: string): boolean {
  return deezerBrowser.isMainMenuRequest(mediaId, mediaType);
}

export function isDeezerBackRequest(mediaId?: string, mediaType?: string): boolean {
  return deezerBrowser.isBackRequest(mediaId, mediaType);
}

export async function browseDeezerMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
  return deezerBrowser.browse(entityId, options);
}
