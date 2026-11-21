import * as uc from "@unfoldedcircle/integration-api";
import { TuneInMediaBrowser } from "./tuneInMediaBrowser.js";
import { TidalMediaBrowser } from "./tidalMediaBrowser.js";
import { DeezerMediaBrowser } from "./deezerMediaBrowser.js";
import { MusicServerMediaBrowser } from "./musicServerMediaBrowser.js";
import { AvrContextRegistry } from "./avrContext.js";
import { EMPTY_CONFIG_SOURCE, type ConfigSource } from "./configManager.js";

// Re-export service constants
export { TUNEIN_ROOT_ID, TUNEIN_ROOT_TYPE, TUNEIN_MENU_ROOT_ID, TUNEIN_MENU_ROOT_TYPE, TUNEIN_MENU_BACK_ID } from "./tuneInMediaBrowser.js";
export { TIDAL_ROOT_ID, TIDAL_ROOT_TYPE, TIDAL_MENU_ROOT_ID, TIDAL_BACK_ID } from "./tidalMediaBrowser.js";
export { DEEZER_ROOT_ID, DEEZER_ROOT_TYPE, DEEZER_MENU_ROOT_ID, DEEZER_BACK_ID } from "./deezerMediaBrowser.js";
export { MUSIC_SERVER_ROOT_ID, MUSIC_SERVER_ROOT_TYPE, MUSIC_SERVER_MENU_ROOT_ID, MUSIC_SERVER_BACK_ID } from "./musicServerMediaBrowser.js";

// The four service browsers, sharing one AvrContextRegistry. One instance is created by the driver (via MediaBrowser).
export class MediaBrowserServices {
  readonly tuneIn: TuneInMediaBrowser;
  readonly tidal: TidalMediaBrowser;
  readonly deezer: DeezerMediaBrowser;
  readonly musicServer: MusicServerMediaBrowser;

  constructor(avrContexts: AvrContextRegistry, configSource: ConfigSource) {
    this.tuneIn = new TuneInMediaBrowser(avrContexts, configSource);
    this.tidal = new TidalMediaBrowser(avrContexts);
    this.deezer = new DeezerMediaBrowser(avrContexts);
    this.musicServer = new MusicServerMediaBrowser(avrContexts);
  }

  setTuneInBrowseContext(entityId: string, title: string): void {
    this.tuneIn.setBrowseContext(entityId, title);
  }

  ingestTuneInListEntry(entityId: string, entry: string): void {
    this.tuneIn.ingestListEntry(entityId, entry);
  }

  ingestTuneInMenuListEntry(entityId: string, entry: string): void {
    this.tuneIn.ingestMenuListEntry(entityId, entry);
  }

  ingestTuneInMenuXmlEntries(entityId: string, xmlPayload: string): void {
    this.tuneIn.ingestMenuXmlEntries(entityId, xmlPayload);
  }

  ingestTuneInXmlEntries(entityId: string, xmlPayload: string): void {
    this.tuneIn.ingestXmlEntries(entityId, xmlPayload);
  }

  getTuneInPresetCount(entityId: string): number {
    return this.tuneIn.getPresetCount(entityId);
  }

  hasTuneInPresets(entityId: string): boolean {
    return this.tuneIn.hasPresets(entityId);
  }

  resolveTuneInPreset(mediaId?: string, mediaType?: string) {
    return this.tuneIn.resolvePreset(mediaId, mediaType);
  }

  async browseTuneInMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    return this.tuneIn.browse(entityId, options);
  }

  isTuneInMenuRootRequest(mediaId?: string, mediaType?: string): boolean {
    return this.tuneIn.isMenuRootRequest(mediaId, mediaType);
  }

  resolveTuneInMenuOption(entityId: string, mediaId?: string, mediaType?: string) {
    return this.tuneIn.resolveMenuOption(entityId, mediaId, mediaType);
  }

  isTuneInBackRequest(mediaId?: string, mediaType?: string): boolean {
    return this.tuneIn.isBackRequest(mediaId, mediaType);
  }

  async browseTuneInMenuMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    return this.tuneIn.browseMenu(entityId, options);
  }

  ingestTidalXmlEntries(entityId: string, xmlPayload: string): void {
    this.tidal.ingestXmlEntries(entityId, xmlPayload);
  }

  ingestTidalListEntry(entityId: string, entry: string): void {
    this.tidal.ingestListEntry(entityId, entry);
  }

  resolveTidalMenuOption(mediaId?: string, mediaType?: string) {
    return this.tidal.resolveMenuOption(mediaId, mediaType);
  }

  isTidalMainMenuRequest(mediaId?: string, mediaType?: string): boolean {
    return this.tidal.isMainMenuRequest(mediaId, mediaType);
  }

  isTidalBackRequest(mediaId?: string, mediaType?: string): boolean {
    return this.tidal.isBackRequest(mediaId, mediaType);
  }

  async browseTidalMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    return this.tidal.browse(entityId, options);
  }

  ingestDeezerXmlEntries(entityId: string, xmlPayload: string): void {
    this.deezer.ingestXmlEntries(entityId, xmlPayload);
  }

  ingestDeezerListEntry(entityId: string, entry: string): void {
    this.deezer.ingestListEntry(entityId, entry);
  }

  resolveDeezerMenuOption(mediaId?: string, mediaType?: string) {
    return this.deezer.resolveMenuOption(mediaId, mediaType);
  }

  isDeezerMainMenuRequest(mediaId?: string, mediaType?: string): boolean {
    return this.deezer.isMainMenuRequest(mediaId, mediaType);
  }

  isDeezerBackRequest(mediaId?: string, mediaType?: string): boolean {
    return this.deezer.isBackRequest(mediaId, mediaType);
  }

  async browseDeezerMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    return this.deezer.browse(entityId, options);
  }

  ingestMusicServerXmlEntries(entityId: string, xmlPayload: string): void {
    this.musicServer.ingestXmlEntries(entityId, xmlPayload);
  }

  ingestMusicServerListEntry(entityId: string, entry: string): void {
    this.musicServer.ingestListEntry(entityId, entry);
  }

  resolveMusicServerMenuOption(mediaId?: string, mediaType?: string) {
    return this.musicServer.resolveMenuOption(mediaId, mediaType);
  }

  isMusicServerMainMenuRequest(mediaId?: string, mediaType?: string): boolean {
    return this.musicServer.isMainMenuRequest(mediaId, mediaType);
  }

  isMusicServerBackRequest(mediaId?: string, mediaType?: string): boolean {
    return this.musicServer.isBackRequest(mediaId, mediaType);
  }

  async browseMusicServerMedia(entityId: string, options: uc.BrowseOptions): Promise<uc.StatusCodes | uc.BrowseResult> {
    return this.musicServer.browse(entityId, options);
  }
}

// Media-id parsers. They read no AVR state (no entity id, no store), so they are offered as plain functions, backed by
// an instance on a private, empty registry that is never used for state.
const idParsers = new MediaBrowserServices(new AvrContextRegistry(), EMPTY_CONFIG_SOURCE);

export function resolveTuneInPreset(mediaId?: string, mediaType?: string) {
  return idParsers.resolveTuneInPreset(mediaId, mediaType);
}

export function isTuneInMenuRootRequest(mediaId?: string, mediaType?: string): boolean {
  return idParsers.isTuneInMenuRootRequest(mediaId, mediaType);
}

export function isTuneInBackRequest(mediaId?: string, mediaType?: string): boolean {
  return idParsers.isTuneInBackRequest(mediaId, mediaType);
}

export function resolveTidalMenuOption(mediaId?: string, mediaType?: string) {
  return idParsers.resolveTidalMenuOption(mediaId, mediaType);
}

export function isTidalMainMenuRequest(mediaId?: string, mediaType?: string): boolean {
  return idParsers.isTidalMainMenuRequest(mediaId, mediaType);
}

export function isTidalBackRequest(mediaId?: string, mediaType?: string): boolean {
  return idParsers.isTidalBackRequest(mediaId, mediaType);
}

export function resolveDeezerMenuOption(mediaId?: string, mediaType?: string) {
  return idParsers.resolveDeezerMenuOption(mediaId, mediaType);
}

export function isDeezerMainMenuRequest(mediaId?: string, mediaType?: string): boolean {
  return idParsers.isDeezerMainMenuRequest(mediaId, mediaType);
}

export function isDeezerBackRequest(mediaId?: string, mediaType?: string): boolean {
  return idParsers.isDeezerBackRequest(mediaId, mediaType);
}

export function resolveMusicServerMenuOption(mediaId?: string, mediaType?: string) {
  return idParsers.resolveMusicServerMenuOption(mediaId, mediaType);
}

export function isMusicServerMainMenuRequest(mediaId?: string, mediaType?: string): boolean {
  return idParsers.isMusicServerMainMenuRequest(mediaId, mediaType);
}

export function isMusicServerBackRequest(mediaId?: string, mediaType?: string): boolean {
  return idParsers.isMusicServerBackRequest(mediaId, mediaType);
}
