import { describe, it, expect, vi } from "vitest";

describe("buildMenuSignature", () => {
  it("builds signature from menu items", async () => {
    const baseModule = await import("../src/menuBrowseHandlerBase.js");
    const { MenuBrowseHandlerBase } = baseModule as any;

    class TestHandler extends MenuBrowseHandlerBase {
      protected readonly integrationName = "test:handler";
      protected phase2HarvestEnabled = false;
      protected getServiceLabel() { return "Test"; }
      protected nextListSequence() { return "0001"; }
      protected getMenuState() { return null; }
      protected getContiguousItemCount() { return 0; }
      protected getMenuDelay() { return 120; }

      protected listMenuItems(entityId: string) {
        return [
          { menuIndex: 0, title: "First" },
          { menuIndex: 1, title: "Second" },
          { menuIndex: 2, title: "Third" }
        ];
      }
    }

    const handler = new TestHandler();
    const result = handler.buildMenuSignature("entity1");
    expect(result).toBe("0:First|1:Second|2:Third");
  });

  it("returns empty string for empty items list", async () => {
    const baseModule = await import("../src/menuBrowseHandlerBase.js");
    const { MenuBrowseHandlerBase } = baseModule as any;

    class TestHandler extends MenuBrowseHandlerBase {
      protected readonly integrationName = "test:handler";
      protected phase2HarvestEnabled = false;
      protected getServiceLabel() { return "Test"; }
      protected nextListSequence() { return "0001"; }
      protected getMenuState() { return null; }
      protected getContiguousItemCount() { return 0; }
      protected getMenuDelay() { return 120; }

      protected listMenuItems() { return []; }
    }

    const handler = new TestHandler();
    const result = handler.buildMenuSignature("entity1");
    expect(result).toBe("");
  });

  it("includes special characters in titles", async () => {
    const baseModule = await import("../src/menuBrowseHandlerBase.js");
    const { MenuBrowseHandlerBase } = baseModule as any;

    class TestHandler extends MenuBrowseHandlerBase {
      protected readonly integrationName = "test:handler";
      protected phase2HarvestEnabled = false;
      protected getServiceLabel() { return "Test"; }
      protected nextListSequence() { return "0001"; }
      protected getMenuState() { return null; }
      protected getContiguousItemCount() { return 0; }
      protected getMenuDelay() { return 120; }

      protected listMenuItems() {
        return [{ menuIndex: 0, title: "Item | with | pipes" }];
      }
    }

    const handler = new TestHandler();
    const result = handler.buildMenuSignature("entity1");
    expect(result).toBe("0:Item | with | pipes");
  });
});

describe("waitForMenuStable", () => {
  it("resolves when signature stabilizes", async () => {
    vi.useFakeTimers();

    const baseModule = await import("../src/menuBrowseHandlerBase.js");
    const { MenuBrowseHandlerBase } = baseModule as any;

    let callCount = 0;
    class TestHandler extends MenuBrowseHandlerBase {
      protected readonly integrationName = "test:handler";
      protected phase2HarvestEnabled = false;
      protected getServiceLabel() { return "Test"; }
      protected nextListSequence() { return "0001"; }
      protected getMenuState() { return null; }
      protected getContiguousItemCount() { return 0; }
      protected getMenuDelay() { return 120; }

      protected listMenuItems() {
        callCount++;
        if (callCount <= 2) return [{ menuIndex: 0, title: "Before" }];
        return [{ menuIndex: 0, title: "After" }];
      }
    }

    const handler = new TestHandler();
    const promise = handler.waitForMenuStable("entity1", "0:Before", 120);

    // Fast-forward through the polling cycle
    await vi.advanceTimersByTimeAsync(10000);

    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("resolves when signature never changes (deadline reached)", async () => {
    vi.useFakeTimers();

    const baseModule = await import("../src/menuBrowseHandlerBase.js");
    const { MenuBrowseHandlerBase } = baseModule as any;

    class TestHandler extends MenuBrowseHandlerBase {
      protected readonly integrationName = "test:handler";
      protected phase2HarvestEnabled = false;
      protected getServiceLabel() { return "Test"; }
      protected nextListSequence() { return "0001"; }
      protected getMenuState() { return null; }
      protected getContiguousItemCount() { return 0; }
      protected getMenuDelay() { return 120; }

      protected listMenuItems() {
        return [{ menuIndex: 0, title: "Stable" }];
      }
    }

    const handler = new TestHandler();
    const promise = handler.waitForMenuStable("entity1", "0:Different", 120);

    await vi.advanceTimersByTimeAsync(10000);

    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("uses correct tick and deadline values", async () => {
    vi.useFakeTimers();

    const baseModule = await import("../src/menuBrowseHandlerBase.js");
    const { MenuBrowseHandlerBase } = baseModule as any;

    class TestHandler extends MenuBrowseHandlerBase {
      protected readonly integrationName = "test:handler";
      protected phase2HarvestEnabled = false;
      protected getServiceLabel() { return "Test"; }
      protected nextListSequence() { return "0001"; }
      protected getMenuState() { return null; }
      protected getContiguousItemCount() { return 0; }
      protected getMenuDelay() { return 120; }

      protected listMenuItems() {
        return [{ menuIndex: 0, title: "Item" }];
      }
    }

    const handler = new TestHandler();
    const promise = handler.waitForMenuStable("entity1", "0:Item", 0);

    await vi.advanceTimersByTimeAsync(10000);

    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
