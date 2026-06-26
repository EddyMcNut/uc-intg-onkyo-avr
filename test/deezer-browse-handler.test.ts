import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";

vi.mock("../src/mediaBrowser.js", () => ({
  browseMedia: vi.fn(),
  isDeezerMainMenuRequest: vi.fn().mockReturnValue(false),
  isDeezerBackRequest: vi.fn().mockReturnValue(false),
  resolveDeezerMenuOption: vi.fn().mockReturnValue(undefined),
  DEEZER_BACK_ID: "deezer:menu-back",
  DEEZER_ROOT_ID: "deezer:root",
  DEEZER_ROOT_TYPE: "deezer://menu"
}));

vi.mock("../src/deezerBrowserStore.js", () => ({
  listDeezerMenuOptions: vi.fn(() => []),
  resetDeezerBrowseState: vi.fn(),
  getDeezerBrowseState: vi.fn(() => null)
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
let deezerStore: any;

describe("DeezerBrowseHandler", () => {
  let DeezerBrowseHandler: any;
  let handler: any;
  let cmdHandler: any;
  let rawSend: any;
  const entityId = "test-avr main";
  const mediaPlayerEntity = { id: entityId } as any;

  beforeAll(async () => {
    mediaBrowser = await import("../src/mediaBrowser.js");
    deezerStore = await import("../src/deezerBrowserStore.js");
    const mod = await import("../src/deezerBrowseHandler.js");
    DeezerBrowseHandler = mod.DeezerBrowseHandler;
  });

  beforeEach(() => {
    mediaBrowser.isDeezerBackRequest.mockReturnValue(false);
    mediaBrowser.isDeezerMainMenuRequest.mockReturnValue(false);
    mediaBrowser.resolveDeezerMenuOption.mockReturnValue(undefined);
    mediaBrowser.browseMedia.mockReturnValue("browse-result");
    deezerStore.getDeezerBrowseState.mockReturnValue(null);
    deezerStore.listDeezerMenuOptions.mockReturnValue([]);
    cmdHandler = vi.fn().mockResolvedValue(uc.StatusCodes.Ok);
    rawSend = vi.fn().mockResolvedValue(undefined);
    handler = new DeezerBrowseHandler();
    vi.spyOn(handler, "waitForMenuStable" as any).mockResolvedValue(undefined);
    vi.spyOn(handler, "harvestListItems" as any).mockResolvedValue(undefined);
  });

  it("returns undefined for unrecognized request", async () => {
    const result = await handler.browse(entityId, { media_id: "unknown", media_type: "other" }, mediaPlayerEntity, cmdHandler, rawSend);
    expect(result).toBeUndefined();
  });

  it("calls detection functions even without cmdHandler", async () => {
    const result = await handler.browse(entityId, { media_id: "deezer:menu-back", media_type: "deezer://menu" }, mediaPlayerEntity, undefined, rawSend);
    expect(result).toBeUndefined();
    expect(mediaBrowser.isDeezerBackRequest).toHaveBeenCalledWith("deezer:menu-back", "deezer://menu");
  });

  describe("back request", () => {
    it("handles back request with cmdHandler and rawSend", async () => {
      mediaBrowser.isDeezerBackRequest.mockReturnValue(true);

      const result = await handler.browse(entityId, { media_id: "deezer:menu-back", media_type: "deezer://menu" }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(cmdHandler).toHaveBeenCalledWith(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, { media_id: "deezer:menu-back", media_type: "deezer://menu" });
      expect(handler.waitForMenuStable).toHaveBeenCalled();
      expect(handler.harvestListItems).toHaveBeenCalledWith(entityId, rawSend);
      expect(mediaBrowser.browseMedia).toHaveBeenCalledWith(entityId, expect.objectContaining({ media_id: "deezer:root", media_type: "deezer://menu" }));
      expect(result).toBe(mediaBrowser.browseMedia.mock.results[0].value);
    });

    it("handles back request without rawSend", async () => {
      mediaBrowser.isDeezerBackRequest.mockReturnValue(true);

      await handler.browse(entityId, { media_id: "deezer:menu-back" }, mediaPlayerEntity, cmdHandler, undefined);

      expect(handler.waitForMenuStable).toHaveBeenCalled();
      expect(handler.harvestListItems).not.toHaveBeenCalled();
    });

    it("updates browse list frozen and list mode when rawSend available", async () => {
      mediaBrowser.isDeezerBackRequest.mockReturnValue(true);
      const browseState = { browseListFrozen: true, listModeActive: false };
      deezerStore.getDeezerBrowseState.mockReturnValue(browseState);

      await handler.browse(entityId, { media_id: "deezer:menu-back", media_type: "deezer://menu" }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(browseState.browseListFrozen).toBe(false);
      expect(browseState.listModeActive).toBe(true);
    });
  });

  describe("main menu request", () => {
    it("handles main menu request with cmdHandler and rawSend", async () => {
      mediaBrowser.isDeezerMainMenuRequest.mockReturnValue(true);

      await handler.browse(entityId, { media_id: "deezer:root", media_type: "deezer://menu" }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(deezerStore.resetDeezerBrowseState).toHaveBeenCalledWith(entityId);
      expect(cmdHandler).toHaveBeenCalledWith(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, { media_id: "deezer:root", media_type: "deezer://menu" });
      expect(handler.waitForMenuStable).toHaveBeenCalled();
      expect(handler.harvestListItems).toHaveBeenCalledWith(entityId, rawSend);
      expect(mediaBrowser.browseMedia).toHaveBeenCalledWith(entityId, expect.objectContaining({ media_id: "deezer:root", media_type: "deezer://menu" }));
    });

    it("sets traceNextSelectionAfterMainMenu on browseState", async () => {
      mediaBrowser.isDeezerMainMenuRequest.mockReturnValue(true);
      const browseState = { traceNextSelectionAfterMainMenu: false };
      deezerStore.getDeezerBrowseState.mockReturnValue(browseState);

      await handler.browse(entityId, { media_id: "deezer:root", media_type: "deezer://menu" }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(browseState.traceNextSelectionAfterMainMenu).toBe(true);
      expect(deezerStore.getDeezerBrowseState).toHaveBeenCalled();
    });

    it("handles main menu without rawSend", async () => {
      mediaBrowser.isDeezerMainMenuRequest.mockReturnValue(true);

      await handler.browse(entityId, { media_id: "deezer:root", media_type: "deezer://menu" }, mediaPlayerEntity, cmdHandler, undefined);

      expect(handler.harvestListItems).not.toHaveBeenCalled();
    });
  });

  describe("selection request", () => {
    const menuOption = { mediaId: "deezer:track:123", isBrowsable: false };

    it("handles selection with offset=0 and isBrowsable", async () => {
      mediaBrowser.resolveDeezerMenuOption.mockReturnValue({ ...menuOption, isBrowsable: true });

      await handler.browse(entityId, { media_id: "deezer:menu:1:Test", media_type: "deezer://menu", paging: { offset: 0 } }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(cmdHandler).toHaveBeenCalledWith(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, { media_id: "deezer:track:123", media_type: "deezer://menu" });
      expect(handler.waitForMenuStable).toHaveBeenCalled();
      expect(handler.harvestListItems).toHaveBeenCalledWith(entityId, rawSend);
      expect(mediaBrowser.browseMedia).toHaveBeenCalledWith(entityId, expect.objectContaining({ media_id: "deezer:root", media_type: "deezer://menu" }));
    });

    it("handles selection with offset=0 and NOT isBrowsable", async () => {
      mediaBrowser.resolveDeezerMenuOption.mockReturnValue(menuOption);

      await handler.browse(entityId, { media_id: "deezer:menu:1:Test", media_type: "deezer://menu", paging: { offset: 0 } }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(cmdHandler).toHaveBeenCalled();
      expect(handler.waitForMenuStable).not.toHaveBeenCalled();
      expect(handler.harvestListItems).not.toHaveBeenCalled();
    });

    it("handles selection with offset > 0 (skips navigation)", async () => {
      mediaBrowser.resolveDeezerMenuOption.mockReturnValue(menuOption);

      await handler.browse(entityId, { media_id: "deezer:menu:1:Test", media_type: "deezer://menu", paging: { offset: 10 } }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(cmdHandler).not.toHaveBeenCalled();
      expect(mediaBrowser.browseMedia).toHaveBeenCalled();
    });

    it("handles selection with undefined paging (offset defaults to 0)", async () => {
      mediaBrowser.resolveDeezerMenuOption.mockReturnValue(menuOption);

      await handler.browse(entityId, { media_id: "deezer:menu:1:Test", media_type: "deezer://menu" }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(cmdHandler).toHaveBeenCalled();
    });

    it("sets showMainMenuShortcut on browseState", async () => {
      mediaBrowser.resolveDeezerMenuOption.mockReturnValue(menuOption);
      const browseState = { showMainMenuShortcut: false };
      deezerStore.getDeezerBrowseState.mockReturnValue(browseState);

      await handler.browse(entityId, { media_id: "deezer:menu:1:Test", media_type: "deezer://menu", paging: { offset: 0 } }, mediaPlayerEntity, cmdHandler, rawSend);

      expect(browseState.showMainMenuShortcut).toBe(true);
    });
  });
});
