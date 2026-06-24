import { describe, it, expect, vi } from "vitest";

function makeMockEiscp() {
  return {
    command: vi.fn(),
    eiscpConfig: { sendDelay: 250 }
  };
}

it("shouldQuery returns true when no query has been recorded", async () => {
  const mod = await import("../src/avrStateQuery.js");
  const { avrStateQueryService } = mod as any;
  expect(avrStateQueryService.shouldQuery("sq-empty-" + Date.now())).toBe(true);
});

it("shouldQuery returns false shortly after recordQuery", async () => {
  const mod = await import("../src/avrStateQuery.js");
  const { avrStateQueryService } = mod as any;
  const eid = "sq-recent-" + Date.now();
  avrStateQueryService.recordQuery(eid);
  expect(avrStateQueryService.shouldQuery(eid)).toBe(false);
});

it("recordQueries batch records timestamps", async () => {
  const mod = await import("../src/avrStateQuery.js");
  const { avrStateQueryService } = mod as any;
  const eid1 = "rq-a-" + Date.now();
  const eid2 = "rq-b-" + Date.now();
  avrStateQueryService.recordQueries([eid1, eid2]);
  expect(avrStateQueryService.shouldQuery(eid1)).toBe(false);
  expect(avrStateQueryService.shouldQuery(eid2)).toBe(false);
});

it("queryAvrState returns early when no eiscpInstance", async () => {
  const mod = await import("../src/avrStateQuery.js");
  const { avrStateQueryService } = mod as any;
  await expect(avrStateQueryService.queryAvrState("entity", null, "main", "test")).resolves.toBeUndefined();
});

it("queryAvrState returns early when no zone", async () => {
  const mod = await import("../src/avrStateQuery.js");
  const { avrStateQueryService } = mod as any;
  const mock = makeMockEiscp();
  await avrStateQueryService.queryAvrState("entity", mock, "", "test");
  expect(mock.command).not.toHaveBeenCalled();
});

it("queryAvrState returns early when no entityId", async () => {
  const mod = await import("../src/avrStateQuery.js");
  const { avrStateQueryService } = mod as any;
  const mock = makeMockEiscp();
  await avrStateQueryService.queryAvrState("", mock, "main", "test");
  expect(mock.command).not.toHaveBeenCalled();
});

it("queryAvrState sends all query commands in order", async () => {
  const mod = await import("../src/avrStateQuery.js");
  const { avrStateQueryService } = mod as any;
  const eid = "qa-order-" + Date.now();
  const commands: Array<{ zone: string; command: string; args: string }> = [];
  const mock = { command: vi.fn().mockImplementation(async (cmd: any) => { commands.push(cmd); }), eiscpConfig: { sendDelay: 10 } };

  await avrStateQueryService.queryAvrState(eid, mock, "main", "test");

  expect(commands.length).toBe(6);
  expect(commands[0]).toEqual({ zone: "main", command: "system-power", args: "query" });
  expect(commands[1]).toEqual({ zone: "main", command: "input-selector", args: "query" });
  expect(commands[2]).toEqual({ zone: "main", command: "volume", args: "query" });
  expect(commands[3]).toEqual({ zone: "main", command: "audio-muting", args: "query" });
  expect(commands[4]).toEqual({ zone: "main", command: "listening-mode", args: "query" });
  expect(commands[5]).toEqual({ zone: "main", command: "fp-display", args: "query" });
});

it("queryAvrState skips redundant query", async () => {
  const mod = await import("../src/avrStateQuery.js");
  const { avrStateQueryService } = mod as any;
  const eid = "qa-skip-" + Date.now();
  const mock = { command: vi.fn(), eiscpConfig: { sendDelay: 10 } };

  await avrStateQueryService.queryAvrState(eid, mock, "main", "first");
  expect(mock.command).toHaveBeenCalled();

  mock.command.mockClear();
  await avrStateQueryService.queryAvrState(eid, mock, "main", "second");
  expect(mock.command).not.toHaveBeenCalled();
});

it("queryAvrState uses custom queueThreshold when provided", async () => {
  const mod = await import("../src/avrStateQuery.js");
  const { avrStateQueryService } = mod as any;
  const eid = "qa-qt-" + Date.now();
  const mock = { command: vi.fn(), eiscpConfig: { sendDelay: 500 } };

  await avrStateQueryService.queryAvrState(eid, mock, "main", "custom threshold", 100);
  expect(mock.command).toHaveBeenCalled();
});

it("queryAvrState handles command errors gracefully", async () => {
  const mod = await import("../src/avrStateQuery.js");
  const { avrStateQueryService } = mod as any;
  const eid = "qa-err-" + Date.now();
  const mock = { command: vi.fn().mockRejectedValue(new Error("connection lost")), eiscpConfig: { sendDelay: 10 } };

  await expect(avrStateQueryService.queryAvrState(eid, mock, "main", "error test")).resolves.toBeUndefined();
});
