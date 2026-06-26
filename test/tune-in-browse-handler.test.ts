import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";

vi.mock("../src/mediaBrowser.js", () => ({
  browseMedia: vi.fn(),
  TUNEIN_MENU_BACK_ID: "tunein:menu-back",
  TUNEIN_MENU_ROOT_ID: "tunein:root",
  TUNEIN_MENU_ROOT_TYPE: "tunein://menu"
}));

vi.mock("../src/tuneInMenuStore.js", () => ({
  listTuneInMenuOptions: vi.fn(() => []),
  getTuneInMenuBrowseState: vi.fn(() => null)
}));

vi.mock("../src/tuneInFilters.js", () => ({
  looksLikeTuneInDirectory: vi.fn(() => false)
}));

vi.mock("../src/configManager.js", () => ({
  ConfigManager: {
    get: vi.fn(() => ({
      avrs: [
        {
          model: "M",
          ip: "1.2.3.4",
          zone: "main",
          netMenuDelay: 200,
          tuneinMenuStyle: "full"
        }
      ]
    }))
  },
  AVR_DEFAULTS: { netMenuDelay: 300 },
  buildEntityId: vi.fn(() => "test-avr main")
}));

vi.mock("../src/loggers.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

let mediaBrowser: any;
let tuneInStore: any;
let configManager: any;

describe("TuneInBrowseHandler", () => {
  let TuneInBrowseHandler: any;
  let handler: any;
  let avrStateApi: any;
  let cmdHandler: any;
  let rawSend: any;
  const entityId = "test-avr main";
  const mediaPlayerEntity = { id: entityId } as any;

  beforeAll(async () => {
    mediaBrowser = await import("../src/mediaBrowser.js");
    tuneInStore = await import("../src/tuneInMenuStore.js");
    configManager = await import("../src/configManager.js");
    const mod = await import("../src/tuneInBrowseHandler.js");
    TuneInBrowseHandler = mod.TuneInBrowseHandler;
  });

  beforeEach(() => {
    mediaBrowser.browseMedia.mockReturnValue("browse-result");
    tuneInStore.getTuneInMenuBrowseState.mockReturnValue(null);
    tuneInStore.listTuneInMenuOptions.mockReturnValue([]);
    configManager.ConfigManager.get.mockReturnValue({
      avrs: [{ model: "M", ip: "1.2.3.4", zone: "main", netMenuDelay: 200, tuneinMenuStyle: "full" }]
    });
    avrStateApi = { getSubSource: vi.fn(() => "tunein") };
    cmdHandler = vi.fn().mockResolvedValue(uc.StatusCodes.Ok);
    rawSend = vi.fn().mockResolvedValue(undefined);
    handler = new TuneInBrowseHandler(avrStateApi);
    vi.spyOn(handler, "waitForMenuStable" as any).mockResolvedValue(undefined);
    vi.spyOn(handler, "harvestListItems" as any).mockResolvedValue(undefined);
  });

  it("returns undefined when cmdHandler is not provided", async () => {
    const result = await handler.browse(entityId, { media_id: "tunein:root", media_type: "tunein://menu" }, mediaPlayerEntity, undefined, rawSend);
    expect(result).toBeUndefined();
  });

  it("returns undefined when not full menu entity", async () => {
    configManager.ConfigManager.get.mockReturnValue({
      avrs: [{ model: "M", ip: "1.2.3.4", zone: "main", netMenuDelay: 200, tuneinMenuStyle: "simple" }]
    });
    const result = await handler.browse(entityId, { media_id: "tunein:root", media_type: "tunein://menu" }, mediaPlayerEntity, cmdHandler, rawSend);
    expect(result).toBeUndefined();
  });

  it("returns undefined when subsource is not tunein", async () => {
    avrStateApi.getSubSource.mockReturnValue("deezer");
    const result = await handler.browse(entityId, { media_id: "tunein:root", media_type: "tunein://menu" }, mediaPlayerEntity, cmdHandler, rawSend);
    expect(result).toBeUndefined();
  });

  describe("back request", () => {
    it("handles back request with cmdHandler and rawSend", async () => {
      const result = await handler.browse(
        entityId,
        {
          media_id: "tunein:menu-back",
          media_type: "tunein://menu"
        },
        mediaPlayerEntity,
        cmdHandler,
        rawSend
      );

      expect(cmdHandler).toHaveBeenCalledWith(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
        media_id: "tunein:menu-back",
        media_type: "tunein://menu"
      });
      expect(handler.waitForMenuStable).toHaveBeenCalled();
      expect(handler.harvestListItems).toHaveBeenCalledWith(entityId, rawSend);
      expect(mediaBrowser.browseMedia).toHaveBeenCalledWith(
        entityId,
        expect.objectContaining({
          media_id: "tunein:root",
          media_type: "tunein://menu"
        })
      );
      expect(result).toBe(mediaBrowser.browseMedia.mock.results[0].value);
    });

    it("handles back request without rawSend", async () => {
      await handler.browse(
        entityId,
        {
          media_id: "tunein:menu-back",
          media_type: "tunein://menu"
        },
        mediaPlayerEntity,
        cmdHandler,
        undefined
      );

      expect(handler.harvestListItems).not.toHaveBeenCalled();
    });

    it("handles back request with undefined media_type", async () => {
      await handler.browse(
        entityId,
        {
          media_id: "tunein:menu-back"
        },
        mediaPlayerEntity,
        cmdHandler,
        rawSend
      );

      expect(cmdHandler).toHaveBeenCalled();
    });
  });

  describe("root request", () => {
    it("loads root when state is empty", async () => {
      tuneInStore.getTuneInMenuBrowseState.mockReturnValue({ optionsByMenuIndex: new Map() });

      await handler.browse(
        entityId,
        {
          media_id: undefined! as any
        },
        mediaPlayerEntity,
        cmdHandler,
        rawSend
      );

      expect(cmdHandler).toHaveBeenCalledWith(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
        media_id: "tunein:root",
        media_type: "tunein://menu"
      });
      expect(handler.waitForMenuStable).toHaveBeenCalled();
      expect(handler.harvestListItems).toHaveBeenCalledWith(entityId, rawSend);
    });

    it("skips PlayMedia when state is null", async () => {
      await handler.browse(
        entityId,
        {
          media_id: undefined! as any
        },
        mediaPlayerEntity,
        cmdHandler,
        rawSend
      );

      expect(cmdHandler).not.toHaveBeenCalled();
      expect(mediaBrowser.browseMedia).toHaveBeenCalled();
    });

    it("skips reload when state has items and not explicit main menu", async () => {
      tuneInStore.getTuneInMenuBrowseState.mockReturnValue({
        optionsByMenuIndex: new Map([[1, { title: "Item" }]]),
        showMainMenuShortcut: false,
        browseListFrozen: false
      });

      await handler.browse(
        entityId,
        {
          media_id: "some:other:id",
          media_type: "tunein://menu"
        },
        mediaPlayerEntity,
        cmdHandler,
        rawSend
      );

      expect(cmdHandler).not.toHaveBeenCalled();
      expect(mediaBrowser.browseMedia).toHaveBeenCalled();
    });

    it("reloads root when explicit main menu selection even with existing state", async () => {
      tuneInStore.getTuneInMenuBrowseState.mockReturnValue({
        optionsByMenuIndex: new Map([[1, { title: "Item" }]]),
        showMainMenuShortcut: true,
        browseListFrozen: false
      });

      await handler.browse(
        entityId,
        {
          media_id: "tunein:root",
          media_type: "tunein://menu"
        },
        mediaPlayerEntity,
        cmdHandler,
        rawSend
      );

      expect(cmdHandler).toHaveBeenCalled();
    });

    it("sets browseListFrozen to false on root request", async () => {
      const state = { optionsByMenuIndex: new Map(), browseListFrozen: true, showMainMenuShortcut: false };
      tuneInStore.getTuneInMenuBrowseState.mockReturnValue(state);

      await handler.browse(
        entityId,
        {
          media_id: "tunein:root",
          media_type: "tunein://menu"
        },
        mediaPlayerEntity,
        cmdHandler,
        rawSend
      );

      expect(state.browseListFrozen).toBe(false);
    });
  });

  describe("selection request", () => {
    it("handles selection with offset=0", async () => {
      tuneInStore.listTuneInMenuOptions.mockReturnValue([{ menuIndex: 1, title: "Test Item", mediaId: "tunein:menu:1:Test", isBrowsable: false }]);

      await handler.browse(
        entityId,
        {
          media_id: "tunein:menu:1:Test%20Item",
          media_type: "tunein://menu",
          paging: { offset: 0 }
        },
        mediaPlayerEntity,
        cmdHandler,
        rawSend
      );

      expect(cmdHandler).toHaveBeenCalledWith(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
        media_id: "tunein:menu:1:Test%20Item",
        media_type: "tunein://menu"
      });
      expect(handler.waitForMenuStable).not.toHaveBeenCalled();
      expect(handler.harvestListItems).not.toHaveBeenCalled();
      expect(mediaBrowser.browseMedia).toHaveBeenCalled();
    });

    it("handles browsable selection with rawSend", async () => {
      tuneInStore.listTuneInMenuOptions.mockReturnValue([{ menuIndex: 1, title: "Directory", mediaId: "tunein:menu:1:Directory", isBrowsable: true }]);

      await handler.browse(
        entityId,
        {
          media_id: "tunein:menu:1:Directory",
          media_type: "tunein://menu",
          paging: { offset: 0 }
        },
        mediaPlayerEntity,
        cmdHandler,
        rawSend
      );

      expect(cmdHandler).toHaveBeenCalled();
      expect(handler.waitForMenuStable).toHaveBeenCalled();
      expect(handler.harvestListItems).toHaveBeenCalledWith(entityId, rawSend);
    });

    it("handles selection with offset > 0 (skips navigation)", async () => {
      tuneInStore.listTuneInMenuOptions.mockReturnValue([{ menuIndex: 1, title: "Item", mediaId: "tunein:menu:1:Item", isBrowsable: false }]);

      await handler.browse(
        entityId,
        {
          media_id: "tunein:menu:1:Item",
          media_type: "tunein://menu",
          paging: { offset: 10 }
        },
        mediaPlayerEntity,
        cmdHandler,
        rawSend
      );

      expect(cmdHandler).not.toHaveBeenCalled();
      expect(mediaBrowser.browseMedia).toHaveBeenCalled();
    });

    it("handles selection with undefined paging (offset defaults to 0)", async () => {
      tuneInStore.listTuneInMenuOptions.mockReturnValue([{ menuIndex: 1, title: "Item", mediaId: "tunein:menu:1:Item", isBrowsable: false }]);

      await handler.browse(
        entityId,
        {
          media_id: "tunein:menu:1:Item",
          media_type: "tunein://menu"
        },
        mediaPlayerEntity,
        cmdHandler,
        rawSend
      );

      expect(cmdHandler).toHaveBeenCalled();
    });

    it("sets showMainMenuShortcut on browseState", async () => {
      const browseState = { showMainMenuShortcut: false };
      tuneInStore.getTuneInMenuBrowseState.mockReturnValue(browseState);
      tuneInStore.listTuneInMenuOptions.mockReturnValue([{ menuIndex: 1, title: "Item", mediaId: "tunein:menu:1:Item", isBrowsable: false }]);

      await handler.browse(
        entityId,
        {
          media_id: "tunein:menu:1:Item",
          media_type: "tunein://menu",
          paging: { offset: 0 }
        },
        mediaPlayerEntity,
        cmdHandler,
        rawSend
      );

      expect(browseState.showMainMenuShortcut).toBe(true);
    });

    it("returns undefined for unrecognized media_id", async () => {
      const result = await handler.browse(
        entityId,
        {
          media_id: "some:unknown:id",
          media_type: "other:type"
        },
        mediaPlayerEntity,
        cmdHandler,
        rawSend
      );

      expect(result).toBeUndefined();
    });
  });

  describe("getContiguousItemCount", () => {
    it("returns 0 when no state exists", async () => {
      const result = handler.getContiguousItemCount("nonexistent");
      expect(result).toBe(0);
    });

    it("returns 0 when optionsByMenuIndex is empty", async () => {
      tuneInStore.getTuneInMenuBrowseState.mockReturnValue({ optionsByMenuIndex: new Map() });
      const result = handler.getContiguousItemCount(entityId);
      expect(result).toBe(0);
    });
  });
});
