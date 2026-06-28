import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";

vi.mock("../src/mediaBrowser.js", () => ({
  browseMedia: vi.fn(),
  isTidalMainMenuRequest: vi.fn().mockReturnValue(false),
  isTidalBackRequest: vi.fn().mockReturnValue(false),
  resolveTidalMenuOption: vi.fn().mockReturnValue(undefined),
  TIDAL_BACK_ID: "tidal:menu-back",
  TIDAL_ROOT_ID: "tidal:root",
  TIDAL_ROOT_TYPE: "tidal://menu"
}));

vi.mock("../src/tidalBrowserStore.js", () => ({
  listTidalMenuOptions: vi.fn(() => []),
  resetTidalBrowseState: vi.fn(),
  getTidalBrowseState: vi.fn(() => null)
}));

vi.mock("../src/configManager.js", () => ({
  ConfigManager: {
    get: vi.fn(() => ({ avrs: [{ model: "M", ip: "1.2.3.4", zone: "main", netMenuDelay: 200 }] }))
  },
  AVR_DEFAULTS: { netMenuDelay: 300 },
  buildEntityId: vi.fn(() => "test-avr main")
}));

vi.mock("../src/loggers.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

let mediaBrowser: any;
let tidalStore: any;

describe("TidalBrowseHandler", () => {
  let TidalBrowseHandler: any;
  let handler: any;
  let cmdHandler: any;
  let rawSend: any;
  const entityId = "test-avr main";
  const mediaPlayerEntity = { id: entityId } as any;

  beforeAll(async () => {
    mediaBrowser = await import("../src/mediaBrowser.js");
    tidalStore = await import("../src/tidalBrowserStore.js");
    const mod = await import("../src/tidalBrowseHandler.js");
    TidalBrowseHandler = mod.TidalBrowseHandler;
  });

  beforeEach(() => {
    mediaBrowser.isTidalBackRequest.mockReturnValue(false);
    mediaBrowser.isTidalMainMenuRequest.mockReturnValue(false);
    mediaBrowser.resolveTidalMenuOption.mockReturnValue(undefined);
    mediaBrowser.browseMedia.mockReturnValue("browse-result");
    tidalStore.getTidalBrowseState.mockReturnValue(null);
    tidalStore.listTidalMenuOptions.mockReturnValue([]);
    cmdHandler = vi.fn().mockResolvedValue(uc.StatusCodes.Ok);
    rawSend = vi.fn().mockResolvedValue(undefined);
    handler = new TidalBrowseHandler();
    vi.spyOn(handler, "waitForMenuStable" as any).mockResolvedValue(undefined);
    vi.spyOn(handler, "harvestListItems" as any).mockResolvedValue(undefined);
  });

  it("returns undefined for unrecognized request", async () => {
    const result = await handler.browse(entityId, { media_id: "unknown", media_type: "other" }, mediaPlayerEntity, cmdHandler, rawSend);
    expect(result).toBeUndefined();
  });

  it("calls detection functions even without cmdHandler", async () => {
    const result = await handler.browse(entityId, { media_id: "tidal:menu-back", media_type: "tidal://menu" }, mediaPlayerEntity, undefined, rawSend);
    expect(result).toBeUndefined();
    expect(mediaBrowser.isTidalBackRequest).toHaveBeenCalledWith("tidal:menu-back", "tidal://menu");
  });

  describe("back request", () => {
    it("handles back request with cmdHandler and rawSend", async () => {
      mediaBrowser.isTidalBackRequest.mockReturnValue(true);

      const result = await handler.browse(entityId, { media_id: "tidal:menu-back", media_type: "tidal://menu" }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(cmdHandler).toHaveBeenCalledWith(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, { media_id: "tidal:menu-back", media_type: "tidal://menu" });
      expect(handler.waitForMenuStable).toHaveBeenCalled();
      expect(handler.harvestListItems).toHaveBeenCalledWith(entityId, rawSend);
      expect(mediaBrowser.browseMedia).toHaveBeenCalledWith(entityId, expect.objectContaining({ media_id: "tidal:root", media_type: "tidal://menu" }));
      expect(result).toBe(mediaBrowser.browseMedia.mock.results[0].value);
    });

    it("handles back request without rawSend", async () => {
      mediaBrowser.isTidalBackRequest.mockReturnValue(true);

      await handler.browse(entityId, { media_id: "tidal:menu-back" }, mediaPlayerEntity, cmdHandler, undefined);

      expect(handler.harvestListItems).not.toHaveBeenCalled();
    });

    it("updates browse list frozen and list mode when rawSend available", async () => {
      mediaBrowser.isTidalBackRequest.mockReturnValue(true);
      const browseState = { browseListFrozen: true, listModeActive: false };
      tidalStore.getTidalBrowseState.mockReturnValue(browseState);

      await handler.browse(entityId, { media_id: "tidal:menu-back", media_type: "tidal://menu" }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(browseState.browseListFrozen).toBe(false);
      expect(browseState.listModeActive).toBe(true);
    });
  });

  describe("main menu request", () => {
    it("handles main menu request with cmdHandler and rawSend", async () => {
      mediaBrowser.isTidalMainMenuRequest.mockReturnValue(true);

      await handler.browse(entityId, { media_id: "tidal:root", media_type: "tidal://menu" }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(tidalStore.resetTidalBrowseState).toHaveBeenCalledWith(entityId);
      expect(cmdHandler).toHaveBeenCalledWith(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, { media_id: "tidal:root", media_type: "tidal://menu" });
      expect(handler.waitForMenuStable).toHaveBeenCalled();
      expect(handler.harvestListItems).toHaveBeenCalledWith(entityId, rawSend);
      expect(mediaBrowser.browseMedia).toHaveBeenCalledWith(entityId, expect.objectContaining({ media_id: "tidal:root", media_type: "tidal://menu" }));
    });

    it("sets traceNextSelectionAfterMainMenu on browseState", async () => {
      mediaBrowser.isTidalMainMenuRequest.mockReturnValue(true);
      const browseState = { traceNextSelectionAfterMainMenu: false };
      tidalStore.getTidalBrowseState.mockReturnValue(browseState);

      await handler.browse(entityId, { media_id: "tidal:root", media_type: "tidal://menu" }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(browseState.traceNextSelectionAfterMainMenu).toBe(true);
    });

    it("handles main menu without rawSend", async () => {
      mediaBrowser.isTidalMainMenuRequest.mockReturnValue(true);

      await handler.browse(entityId, { media_id: "tidal:root", media_type: "tidal://menu" }, mediaPlayerEntity, cmdHandler, undefined);

      expect(handler.harvestListItems).not.toHaveBeenCalled();
    });
  });

  describe("selection request", () => {
    const menuOption = { mediaId: "tidal:track:123", isBrowsable: false };

    it("handles selection with offset=0 and isBrowsable", async () => {
      mediaBrowser.resolveTidalMenuOption.mockReturnValue({ ...menuOption, isBrowsable: true });

      await handler.browse(entityId, { media_id: "tidal:menu:1:Test", media_type: "tidal://menu", paging: { offset: 0 } }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(cmdHandler).toHaveBeenCalledWith(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, { media_id: "tidal:track:123", media_type: "tidal://menu" });
      expect(handler.waitForMenuStable).toHaveBeenCalled();
      expect(handler.harvestListItems).toHaveBeenCalledWith(entityId, rawSend);
      expect(mediaBrowser.browseMedia).toHaveBeenCalledWith(entityId, expect.objectContaining({ media_id: "tidal:root", media_type: "tidal://menu" }));
    });

    it("handles selection with offset=0 and NOT isBrowsable", async () => {
      mediaBrowser.resolveTidalMenuOption.mockReturnValue(menuOption);

      await handler.browse(entityId, { media_id: "tidal:menu:1:Test", media_type: "tidal://menu", paging: { offset: 0 } }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(cmdHandler).toHaveBeenCalled();
      expect(handler.waitForMenuStable).not.toHaveBeenCalled();
      expect(handler.harvestListItems).not.toHaveBeenCalled();
    });

    it("handles selection with offset > 0 (skips navigation)", async () => {
      mediaBrowser.resolveTidalMenuOption.mockReturnValue(menuOption);

      await handler.browse(entityId, { media_id: "tidal:menu:1:Test", media_type: "tidal://menu", paging: { offset: 10 } }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(cmdHandler).not.toHaveBeenCalled();
      expect(mediaBrowser.browseMedia).toHaveBeenCalled();
    });

    it("handles selection with undefined paging (offset defaults to 0)", async () => {
      mediaBrowser.resolveTidalMenuOption.mockReturnValue(menuOption);

      await handler.browse(entityId, { media_id: "tidal:menu:1:Test", media_type: "tidal://menu" }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(cmdHandler).toHaveBeenCalled();
    });

    it("sets showMainMenuShortcut on browseState", async () => {
      mediaBrowser.resolveTidalMenuOption.mockReturnValue(menuOption);
      const browseState = { showMainMenuShortcut: false };
      tidalStore.getTidalBrowseState.mockReturnValue(browseState);

      await handler.browse(entityId, { media_id: "tidal:menu:1:Test", media_type: "tidal://menu", paging: { offset: 0 } }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(browseState.showMainMenuShortcut).toBe(true);
    });
  });
});
