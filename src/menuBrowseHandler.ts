import * as uc from "@unfoldedcircle/integration-api";
import { ConfigManager, AVR_DEFAULTS, buildEntityId } from "./configManager.js";
import log from "./loggers.js";
import { MenuBrowseHandlerBase, type MenuSignatureItem } from "./menuBrowseHandlerBase.js";
import type { MenuBrowseState, MenuBrowseOption } from "./menuBrowseState.js";
import { delay } from "./utils.js";

export type CmdHandlerFn = (entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }) => Promise<uc.StatusCodes>;
type RawSendFn = (cmd: string) => Promise<void>;

export type BrowseFunction = (entityId: string, options: uc.BrowseOptions) => Promise<uc.StatusCodes | uc.BrowseResult>;
export type RequestChecker = (mediaId?: string, mediaType?: string) => boolean;
export type OptionResolver = (mediaId?: string, mediaType?: string) => { mediaId: string; isBrowsable: boolean } | undefined;
export type StateResetter = (entityId: string) => void;
export type BrowseStateGetter = (entityId: string) => MenuBrowseState<MenuBrowseOption> | null;
export type MenuItemLister = (entityId: string) => MenuSignatureItem[];

export type MenuBrowseHandlerConfig = {
  providerLabel: string;
  integrationName: string;
  rootId: string;
  rootType: string;
  backId: string;
  browseMedia: BrowseFunction;
  isMainMenuRequest: RequestChecker;
  isBackRequest: RequestChecker;
  resolveMenuOption: OptionResolver;
  resetState: StateResetter;
  getBrowseState: BrowseStateGetter;
  listMenuItems: MenuItemLister;
  afterHarvest?: (entityId: string, rawSend: RawSendFn) => Promise<void>;
};

export type MenuBrowseHandlerApi = MenuBrowseHandlerBase & {
  browse(
    entityId: string,
    options: uc.BrowseOptions,
    mediaPlayerEntity: uc.MediaPlayer,
    cmdHandler: CmdHandlerFn | undefined,
    rawSend: RawSendFn | undefined
  ): Promise<uc.StatusCodes | uc.BrowseResult | undefined>;
};

export function createMenuBrowseHandler(cfg: MenuBrowseHandlerConfig): MenuBrowseHandlerApi {
  const integrationName = cfg.integrationName;

  class Handler extends MenuBrowseHandlerBase {
    protected readonly integrationName = integrationName;
    protected phase2HarvestEnabled = true;

    protected getServiceLabel(): string {
      return cfg.providerLabel;
    }

    private listSequence = 0;

    protected nextListSequence(): string {
      const seq = this.listSequence & 0xffff;
      this.listSequence = (this.listSequence + 1) & 0xffff;
      return seq.toString(16).padStart(4, "0").toUpperCase();
    }

    protected getMenuState(entityId: string) {
      return cfg.getBrowseState(entityId);
    }

    protected listMenuItems(entityId: string) {
      return cfg.listMenuItems(entityId);
    }

    protected getMenuDelay(entityId: string): number {
      const avrCfg = ConfigManager.get();
      const avr = avrCfg?.avrs?.find((a) => buildEntityId(a.model, a.ip, a.zone) === entityId);
      return avr?.netMenuDelay ?? AVR_DEFAULTS.netMenuDelay;
    }

    protected getContiguousItemCount(entityId: string): number {
      const state = cfg.getBrowseState(entityId);
      if (!state || state.optionsByMenuIndex.size === 0) return 0;

      const keys = [...state.optionsByMenuIndex.keys()].sort((a, b) => a - b);
      let expected = 1;
      for (const key of keys) {
        if (key !== expected) break;
        expected++;
      }
      return expected - 1;
    }

    async browse(
      entityId: string,
      options: uc.BrowseOptions,
      mediaPlayerEntity: uc.MediaPlayer,
      cmdHandler: CmdHandlerFn | undefined,
      rawSend: RawSendFn | undefined
    ): Promise<uc.StatusCodes | uc.BrowseResult | undefined> {
      const mainMenu = cfg.isMainMenuRequest(options.media_id, options.media_type);
      const backRequest = cfg.isBackRequest(options.media_id, options.media_type);
      const selection = cfg.resolveMenuOption(options.media_id, options.media_type);

      if (backRequest && cmdHandler) {
        cfg.resetState(entityId);
        const beforeSignature = this.buildMenuSignature(entityId);
        const menuDelay = this.getMenuDelay(entityId);
        log.info("%s [%s] sending %s Back command to AVR", integrationName, entityId, cfg.providerLabel);
        await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
          media_id: cfg.backId,
          media_type: cfg.rootType
        });
        await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
        if (rawSend) {
          const browseState = cfg.getBrowseState(entityId);
          if (browseState) {
            browseState.browseListFrozen = false;
            browseState.listModeActive = true;
          }
          await this.harvestListItems(entityId, rawSend);
          if (cfg.afterHarvest) {
            await cfg.afterHarvest(entityId, rawSend);
          }
        }
        return cfg.browseMedia(entityId, {
          ...options,
          media_id: cfg.rootId,
          media_type: cfg.rootType
        });
      }

      if (mainMenu && cmdHandler) {
        cfg.resetState(entityId);
        const browseState = cfg.getBrowseState(entityId);
        if (browseState) browseState.traceNextSelectionAfterMainMenu = true;
        log.info("%s [%s] %s Main Menu selected; next %s selection will be traced", integrationName, entityId, cfg.providerLabel, cfg.providerLabel);
        await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
          media_id: String(options.media_id),
          media_type: cfg.rootType
        });

        const beforeSignature = this.buildMenuSignature(entityId);
        const menuDelay = this.getMenuDelay(entityId);

        await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
        if (browseState) browseState.listModeActive = true;
        if (rawSend) {
          await this.harvestListItems(entityId, rawSend);
          if (cfg.afterHarvest) {
            await cfg.afterHarvest(entityId, rawSend);
          }
        }

        return cfg.browseMedia(entityId, {
          ...options,
          media_id: cfg.rootId,
          media_type: cfg.rootType
        });
      }

      if (selection && cmdHandler) {
        const browseState = cfg.getBrowseState(entityId);
        if (browseState) browseState.showMainMenuShortcut = true;

        if ((options.paging?.offset ?? 0) === 0) {
          await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
            media_id: selection.mediaId,
            media_type: cfg.rootType
          });

          if (selection.isBrowsable) {
            const beforeSignature = this.buildMenuSignature(entityId);
            const menuDelay = this.getMenuDelay(entityId);

            await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
            if (browseState) browseState.listModeActive = true;
            if (rawSend) {
              await this.harvestListItems(entityId, rawSend);
              if (cfg.afterHarvest) {
                await cfg.afterHarvest(entityId, rawSend);
              }
            }
          }
        }

        return cfg.browseMedia(entityId, {
          ...options,
          media_id: cfg.rootId,
          media_type: cfg.rootType
        });
      }

      return undefined;
    }
  }

  return new Handler();
}
