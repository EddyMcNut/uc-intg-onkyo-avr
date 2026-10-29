import * as uc from "@unfoldedcircle/integration-api";
import { ConfigManager, AVR_DEFAULTS, buildEntityId } from "./configManager.js";
import log from "./loggers.js";
import { MenuBrowseHandlerBase, type MenuSignatureItem } from "./menuBrowseHandlerBase.js";
import type { MenuBrowseState, MenuBrowseOption } from "./menuBrowseState.js";

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
  logSource: string;
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
  // XML-only services (such as Music Server) must request NLAL before waiting
  // for a list signature; the list does not exist until that request is made.
  waitForMenuStableBeforeHarvest?: boolean;
  // Some XML-only services leave the browse context entirely on Back.
  harvestAfterBack?: boolean;
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
  const logSource = cfg.logSource;
  const waitForMenuStableBeforeHarvest = cfg.waitForMenuStableBeforeHarvest ?? true;
  const harvestAfterBack = cfg.harvestAfterBack ?? true;

  class Handler extends MenuBrowseHandlerBase {
    protected readonly logSource = logSource;
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

      // For XML-only services the remote normally asks for the root directly
      // after source selection. The Onkyo app responds to NSV000/NLT by
      // issuing NLAL; do the same instead of waiting for a synthetic main
      // menu selection that the remote may never send.
      const rootRequest = !options.media_id || options.media_id === cfg.rootId;
      if (rootRequest && !waitForMenuStableBeforeHarvest && rawSend) {
        const browseState = cfg.getBrowseState(entityId);
        if (cfg.listMenuItems(entityId).length === 0) {
          if (browseState) browseState.listModeActive = true;
          await this.waitForListMetadata(entityId, this.getMenuDelay(entityId));
          if ((browseState?.totalListItemCount ?? 0) === 0 && cfg.listMenuItems(entityId).length === 0) {
            // The AVR can reset the NLT metadata while changing source. The
            // Onkyo app still starts the XML browser with this exact request.
            await rawSend(`NLAL00000100000001`);
            await this.waitForListMetadata(entityId, this.getMenuDelay(entityId));
          }
          await this.harvestListItems(entityId, rawSend);
          if (cfg.afterHarvest) {
            await cfg.afterHarvest(entityId, rawSend);
          }
        }
        const paging = options.paging;
        const requiredCount = (paging?.offset ?? 0) + (paging?.limit ?? 0);
        await this.waitForMenuItems(entityId, requiredCount, this.getMenuDelay(entityId) * 4);
        return cfg.browseMedia(entityId, {
          ...options,
          media_id: cfg.rootId,
          media_type: cfg.rootType
        });
      }

      if (backRequest && cmdHandler) {
        cfg.resetState(entityId);
        const beforeSignature = this.buildMenuSignature(entityId);
        const menuDelay = this.getMenuDelay(entityId);
        log.info("%s [%s] sending %s Back command to AVR", logSource, entityId, cfg.providerLabel);
        await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
          media_id: cfg.backId,
          media_type: cfg.rootType
        });
        const backBrowseState = cfg.getBrowseState(entityId);
        if (backBrowseState) backBrowseState.showMainMenuShortcut = true;
        if (!harvestAfterBack) {
          return cfg.browseMedia(entityId, {
            ...options,
            media_id: cfg.rootId,
            media_type: cfg.rootType
          });
        }
        if (waitForMenuStableBeforeHarvest) await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
        else await this.waitForListMetadata(entityId, menuDelay);
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
        log.info("%s [%s] %s Main Menu selected; next %s selection will be traced", logSource, entityId, cfg.providerLabel, cfg.providerLabel);
        await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
          media_id: String(options.media_id),
          media_type: cfg.rootType
        });

        const beforeSignature = this.buildMenuSignature(entityId);
        const menuDelay = this.getMenuDelay(entityId);

        if (waitForMenuStableBeforeHarvest) await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
        else await this.waitForListMetadata(entityId, menuDelay);
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
        // A browsable selection creates a new AVR menu context. Invalidate
        // any background NLAL harvest belonging to the previous folder before
        // asking the AVR for the next one.
        if (selection.isBrowsable && (options.paging?.offset ?? 0) === 0) {
          cfg.resetState(entityId);
        }
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

            if (waitForMenuStableBeforeHarvest) await this.waitForMenuStable(entityId, beforeSignature, menuDelay);
            else await this.waitForListMetadata(entityId, menuDelay);
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
