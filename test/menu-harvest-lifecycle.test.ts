import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MenuBrowseHandlerBase, type MenuSignatureItem } from "../src/menuBrowseHandlerBase.js";
import log from "../src/loggers.js";

class BackgroundHarvestHandler extends MenuBrowseHandlerBase {
  protected readonly logSource = "testHarvest:";
  protected phase2HarvestEnabled = true;
  protected waitForXmlResponse = true;
  readonly state = { harvestMode: false, totalListItemCount: 45, nlsLayerNumber: 2, harvestGeneration: 0, xmlResponseSequence: 0 };
  readonly items: MenuSignatureItem[] = [];
  private sequence = 0;

  protected getServiceLabel() {
    return "Music Server";
  }
  protected nextListSequence() {
    return (this.sequence++).toString(16).padStart(4, "0");
  }
  protected getMenuState() {
    return this.state;
  }
  protected listMenuItems() {
    return this.items;
  }
  protected getContiguousItemCount() {
    return this.items.length;
  }
  protected getMenuDelay() {
    return 0;
  }
  run(send: (command: string) => Promise<void>) {
    return this.harvestListItems("AVR main", send);
  }
  receivePage(command: string) {
    const offset = parseInt(command.slice(10, 14), 16);
    const count = parseInt(command.slice(14, 18), 16);
    expect(offset).toBe(this.items.length);
    for (let i = 0; i < count; i++) this.items.push({ menuIndex: offset + i + 1, title: `Artist ${offset + i + 1}` });
    this.state.xmlResponseSequence++;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(log, "warn").mockImplementation(() => {});
  vi.spyOn(log, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("background menu harvest lifecycle", () => {
  it("handles a disconnected send without an unhandled rejection and resumes from the cached page", async () => {
    const handler = new BackgroundHarvestHandler();
    const send = vi.fn(async (command: string) => {
      if (handler.items.length >= 20) throw new Error("Send command while not connected");
      handler.receivePage(command);
    });

    await handler.run(send);
    expect(handler.items).toHaveLength(20);
    expect(handler.state.harvestMode).toBe(true);
    // Vitest also fails this test if the detached task rejects unhandled.
    await vi.runAllTimersAsync();
    expect(send).toHaveBeenCalledTimes(2);
    expect(handler.items).toHaveLength(20);
    expect(handler.state.harvestMode).toBe(false);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("background NLAL harvest stopped"), "testHarvest:", "AVR main", "Music Server", 20, 45, expect.any(Error));
    expect(vi.mocked(log.info).mock.calls.some(([format]) => String(format).includes("harvest complete"))).toBe(false);

    const reconnectedSend = vi.fn(async (command: string) => handler.receivePage(command));
    await handler.run(reconnectedSend);
    await vi.runAllTimersAsync();
    expect(reconnectedSend.mock.calls[0][0].slice(10, 14)).toBe("0014");
    expect(handler.items).toHaveLength(45);
    expect(handler.state.harvestMode).toBe(false);
  });

  it("leaves foreground send failures visible to the browse caller", async () => {
    const handler = new BackgroundHarvestHandler();
    await expect(
      handler.run(async () => {
        throw new Error("Send command while not connected");
      })
    ).rejects.toThrow("Send command while not connected");
    expect(handler.state.harvestMode).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not clear a newer harvest when an old in-flight request fails", async () => {
    const handler = new BackgroundHarvestHandler();
    const send = vi.fn(async (command: string) => {
      if (handler.items.length >= 20) {
        handler.state.harvestGeneration++;
        handler.state.harvestMode = true;
        throw new Error("Connection closed during navigation");
      }
      handler.receivePage(command);
    });
    await handler.run(send);
    await vi.runAllTimersAsync();
    expect(handler.state.harvestMode).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
