import { describe, expect, it, vi } from "vitest";
import { EiscpCommandWorkflow } from "../src/eiscpCommandWorkflow.js";

describe("EiscpCommandWorkflow", () => {
  it("navigates to a TuneIn preset and publishes progress metadata", async () => {
    const raw = vi.fn().mockResolvedValue(undefined);
    const publishMetadata = vi.fn();
    const workflow = new EiscpCommandWorkflow({
      getConfig: () => ({ netMenuDelay: 0, tuneinPresetPosition: 2 }),
      raw,
      publishMetadata
    });

    await workflow.send("TIP0A", "main");

    expect(publishMetadata).toHaveBeenCalledWith({ artist: "Selecting preset 10...", album: "please wait" }, "TIP0A");
    expect(raw.mock.calls.map(([command]) => command)).toEqual(["NTCTOP", "NTCSELECT", "NLSI00002", "NLSI00010"]);
  });

  it("selects a network service by ID using the requested zone prefix", async () => {
    const raw = vi.fn().mockResolvedValue(undefined);
    const workflow = new EiscpCommandWorkflow({
      getConfig: () => ({ netMenuDelay: 0 }),
      raw,
      publishMetadata: vi.fn()
    });

    await workflow.send("NSV1A0", "zone2");

    expect(raw.mock.calls.map(([command]) => command)).toEqual(["SLZ2B", "NSV1A0", "SLZQSTN"]);
  });
});
