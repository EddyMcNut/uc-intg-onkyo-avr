import { describe, it, expect, vi } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";

function makeMockEiscp(connected = true) {
  return {
    get connected() {
      return connected;
    },
    connect: vi.fn().mockResolvedValue({ model: "M", host: "1.2.3.4", port: 60128 }),
    waitForConnect: vi.fn().mockResolvedValue(undefined),
    command: vi.fn().mockResolvedValue(undefined)
  };
}

function makeHandler() {
  const driver = { updateEntityAttributes: vi.fn() };
  const connMgr = {
    getPhysicalConnection: vi.fn()
  };
  const avrMgr = {
    get: vi.fn()
  };
  const getOptions = vi.fn().mockReturnValue(["stereo", "direct", "mono", "dolby-digital"]);
  const handler = new (class {})();
  return { driver, connMgr, avrMgr, getOptions };
}

it("constructor derives integrationName from entitySuffix", async () => {
  const mod = await import("../src/selectEntityHandler.js");
  const { SelectEntityHandler } = mod as any;

  const handler = new SelectEntityHandler({}, {}, { get: () => undefined }, "_listening_mode", "listening-mode", "Listening Mode", () => ["stereo"]);

  expect(handler.integrationName).toBe("listeningModeHandler:");
});

it("handle returns NotFound when no AVR instance found", async () => {
  const mod = await import("../src/selectEntityHandler.js");
  const { SelectEntityHandler } = mod as any;

  const driver = { updateEntityAttributes: vi.fn() };
  const connMgr = { getPhysicalConnection: vi.fn() };
  const avrMgr = { get: vi.fn().mockReturnValue(undefined) };

  const handler = new SelectEntityHandler(driver, connMgr, avrMgr, "_listening_mode", "listening-mode", "Listening Mode", () => ["stereo"]);

  const entity = { id: "M_1.2.3.4_main_listening_mode", attributes: {} };
  const result = await handler.handle(entity, uc.SelectCommands.SelectOption, { option: "stereo" });

  expect(result).toBe(uc.StatusCodes.NotFound);
  expect(driver.updateEntityAttributes).not.toHaveBeenCalled();
});

it("handle returns ServiceUnavailable when no physical connection found", async () => {
  const mod = await import("../src/selectEntityHandler.js");
  const { SelectEntityHandler } = mod as any;
  const cfgMod = await import("../src/configManager.js");
  const { buildPhysicalAvrId } = cfgMod as any;

  const driver = { updateEntityAttributes: vi.fn() };
  const connMgr = { getPhysicalConnection: vi.fn().mockReturnValue(undefined) };

  const model = "TX-RZ50";
  const ip = "192.168.1.100";
  const avrEntry = "TX-RZ50 192.168.1.100 main";

  const avrMgr = {
    get: vi.fn().mockReturnValue({ config: { model, ip, port: 60128, zone: "main" } })
  };

  const handler = new SelectEntityHandler(driver, connMgr, avrMgr, "_listening_mode", "listening-mode", "Listening Mode", () => ["stereo"]);

  const entity = { id: `${avrEntry}_listening_mode`, attributes: {} };
  const result = await handler.handle(entity, uc.SelectCommands.SelectOption, { option: "stereo" });

  expect(result).toBe(uc.StatusCodes.ServiceUnavailable);
  expect(connMgr.getPhysicalConnection).toHaveBeenCalledWith(buildPhysicalAvrId(model, ip));
});

it("handle returns BadRequest for unknown command", async () => {
  const mod = await import("../src/selectEntityHandler.js");
  const { SelectEntityHandler } = mod as any;

  const mockEiscp = makeMockEiscp(true);
  const driver = { updateEntityAttributes: vi.fn() };
  const connMgr = { getPhysicalConnection: vi.fn().mockReturnValue({ eiscp: mockEiscp }) };
  const avrMgr = { get: vi.fn().mockReturnValue({ config: { model: "M", ip: "1.2.3.4", port: 60128, zone: "main" } }) };

  const handler = new SelectEntityHandler(driver, connMgr, avrMgr, "_listening_mode", "listening-mode", "Listening Mode", () => ["stereo", "direct"]);

  const entity = { id: "M_1.2.3.4_main_listening_mode", attributes: {} };
  const result = await handler.handle(entity, "unknown-command" as any, {});

  expect(result).toBe(uc.StatusCodes.BadRequest);
  expect(mockEiscp.command).not.toHaveBeenCalled();
});

it("handle returns BadRequest when SelectNext reaches end without cycle", async () => {
  const mod = await import("../src/selectEntityHandler.js");
  const { SelectEntityHandler } = mod as any;

  const mockEiscp = makeMockEiscp(true);
  const driver = { updateEntityAttributes: vi.fn() };
  const connMgr = { getPhysicalConnection: vi.fn().mockReturnValue({ eiscp: mockEiscp }) };
  const avrMgr = { get: vi.fn().mockReturnValue({ config: { model: "M", ip: "1.2.3.4", port: 60128, zone: "main" } }) };

  const handler = new SelectEntityHandler(driver, connMgr, avrMgr, "_listening_mode", "listening-mode", "Listening Mode", () => ["stereo", "direct"]);

  const entity = { id: "M_1.2.3.4_main_listening_mode", attributes: { [uc.SelectAttributes.CurrentOption]: "direct" } };
  const result = await handler.handle(entity, uc.SelectCommands.SelectNext, {});

  expect(result).toBe(uc.StatusCodes.BadRequest);
  expect(mockEiscp.command).not.toHaveBeenCalled();
});

it("handle returns Ok for SelectOption (stereo)", async () => {
  const mod = await import("../src/selectEntityHandler.js");
  const { SelectEntityHandler } = mod as any;

  const mockEiscp = makeMockEiscp(true);
  const driver = { updateEntityAttributes: vi.fn() };
  const connMgr = { getPhysicalConnection: vi.fn().mockReturnValue({ eiscp: mockEiscp }) };
  const avrMgr = { get: vi.fn().mockReturnValue({ config: { model: "M", ip: "1.2.3.4", port: 60128, zone: "main" } }) };

  const handler = new SelectEntityHandler(driver, connMgr, avrMgr, "_listening_mode", "listening-mode", "Listening Mode", () => ["stereo", "direct", "mono"]);

  const entity = { id: "M_1.2.3.4_main_listening_mode", attributes: { [uc.SelectAttributes.CurrentOption]: "direct" } };
  const result = await handler.handle(entity, uc.SelectCommands.SelectOption, { option: "stereo" });

  expect(result).toBe(uc.StatusCodes.Ok);
  expect(mockEiscp.command).toHaveBeenCalledWith({ zone: "main", command: "listening-mode", args: "stereo" });
  expect(driver.updateEntityAttributes).toHaveBeenCalledWith(entity.id, { [uc.SelectAttributes.CurrentOption]: "stereo" });
});

it("handle returns Ok for SelectFirst", async () => {
  const mod = await import("../src/selectEntityHandler.js");
  const { SelectEntityHandler } = mod as any;

  const mockEiscp = makeMockEiscp(true);
  const driver = { updateEntityAttributes: vi.fn() };
  const connMgr = { getPhysicalConnection: vi.fn().mockReturnValue({ eiscp: mockEiscp }) };
  const avrMgr = { get: vi.fn().mockReturnValue({ config: { model: "M", ip: "1.2.3.4", port: 60128, zone: "main" } }) };

  const handler = new SelectEntityHandler(driver, connMgr, avrMgr, "_listening_mode", "listening-mode", "Listening Mode", () => ["stereo", "direct", "mono"]);

  const entity = { id: "M_1.2.3.4_main_listening_mode", attributes: { [uc.SelectAttributes.CurrentOption]: "direct" } };
  const result = await handler.handle(entity, uc.SelectCommands.SelectFirst, {});

  expect(result).toBe(uc.StatusCodes.Ok);
  expect(mockEiscp.command).toHaveBeenCalledWith({ zone: "main", command: "listening-mode", args: "stereo" });
});

it("handle returns Ok for SelectLast", async () => {
  const mod = await import("../src/selectEntityHandler.js");
  const { SelectEntityHandler } = mod as any;

  const mockEiscp = makeMockEiscp(true);
  const driver = { updateEntityAttributes: vi.fn() };
  const connMgr = { getPhysicalConnection: vi.fn().mockReturnValue({ eiscp: mockEiscp }) };
  const avrMgr = { get: vi.fn().mockReturnValue({ config: { model: "M", ip: "1.2.3.4", port: 60128, zone: "main" } }) };

  const handler = new SelectEntityHandler(driver, connMgr, avrMgr, "_listening_mode", "listening-mode", "Listening Mode", () => ["stereo", "direct", "mono"]);

  const entity = { id: "M_1.2.3.4_main_listening_mode", attributes: { [uc.SelectAttributes.CurrentOption]: "direct" } };
  const result = await handler.handle(entity, uc.SelectCommands.SelectLast, {});

  expect(result).toBe(uc.StatusCodes.Ok);
  expect(mockEiscp.command).toHaveBeenCalledWith({ zone: "main", command: "listening-mode", args: "mono" });
});

it("handle returns Ok for SelectNext", async () => {
  const mod = await import("../src/selectEntityHandler.js");
  const { SelectEntityHandler } = mod as any;

  const mockEiscp = makeMockEiscp(true);
  const driver = { updateEntityAttributes: vi.fn() };
  const connMgr = { getPhysicalConnection: vi.fn().mockReturnValue({ eiscp: mockEiscp }) };
  const avrMgr = { get: vi.fn().mockReturnValue({ config: { model: "M", ip: "1.2.3.4", port: 60128, zone: "main" } }) };

  const handler = new SelectEntityHandler(driver, connMgr, avrMgr, "_listening_mode", "listening-mode", "Listening Mode", () => ["stereo", "direct", "mono"]);

  const entity = { id: "M_1.2.3.4_main_listening_mode", attributes: { [uc.SelectAttributes.CurrentOption]: "stereo" } };
  const result = await handler.handle(entity, uc.SelectCommands.SelectNext, {});

  expect(result).toBe(uc.StatusCodes.Ok);
  expect(mockEiscp.command).toHaveBeenCalledWith({ zone: "main", command: "listening-mode", args: "direct" });
});

it("handle wraps around for SelectNext with cycle at end", async () => {
  const mod = await import("../src/selectEntityHandler.js");
  const { SelectEntityHandler } = mod as any;

  const mockEiscp = makeMockEiscp(true);
  const driver = { updateEntityAttributes: vi.fn() };
  const connMgr = { getPhysicalConnection: vi.fn().mockReturnValue({ eiscp: mockEiscp }) };
  const avrMgr = { get: vi.fn().mockReturnValue({ config: { model: "M", ip: "1.2.3.4", port: 60128, zone: "main" } }) };

  const handler = new SelectEntityHandler(driver, connMgr, avrMgr, "_listening_mode", "listening-mode", "Listening Mode", () => ["stereo", "direct", "mono"]);

  const entity = { id: "M_1.2.3.4_main_listening_mode", attributes: { [uc.SelectAttributes.CurrentOption]: "mono" } };
  const result = await handler.handle(entity, uc.SelectCommands.SelectNext, { cycle: true });

  expect(result).toBe(uc.StatusCodes.Ok);
  expect(mockEiscp.command).toHaveBeenCalledWith({ zone: "main", command: "listening-mode", args: "stereo" });
});

it("handle returns Ok for SelectPrevious", async () => {
  const mod = await import("../src/selectEntityHandler.js");
  const { SelectEntityHandler } = mod as any;

  const mockEiscp = makeMockEiscp(true);
  const driver = { updateEntityAttributes: vi.fn() };
  const connMgr = { getPhysicalConnection: vi.fn().mockReturnValue({ eiscp: mockEiscp }) };
  const avrMgr = { get: vi.fn().mockReturnValue({ config: { model: "M", ip: "1.2.3.4", port: 60128, zone: "main" } }) };

  const handler = new SelectEntityHandler(driver, connMgr, avrMgr, "_listening_mode", "listening-mode", "Listening Mode", () => ["stereo", "direct", "mono"]);

  const entity = { id: "M_1.2.3.4_main_listening_mode", attributes: { [uc.SelectAttributes.CurrentOption]: "direct" } };
  const result = await handler.handle(entity, uc.SelectCommands.SelectPrevious, {});

  expect(result).toBe(uc.StatusCodes.Ok);
  expect(mockEiscp.command).toHaveBeenCalledWith({ zone: "main", command: "listening-mode", args: "stereo" });
});

it("handle wraps around for SelectPrevious with cycle at beginning", async () => {
  const mod = await import("../src/selectEntityHandler.js");
  const { SelectEntityHandler } = mod as any;

  const mockEiscp = makeMockEiscp(true);
  const driver = { updateEntityAttributes: vi.fn() };
  const connMgr = { getPhysicalConnection: vi.fn().mockReturnValue({ eiscp: mockEiscp }) };
  const avrMgr = { get: vi.fn().mockReturnValue({ config: { model: "M", ip: "1.2.3.4", port: 60128, zone: "main" } }) };

  const handler = new SelectEntityHandler(driver, connMgr, avrMgr, "_listening_mode", "listening-mode", "Listening Mode", () => ["stereo", "direct", "mono"]);

  const entity = { id: "M_1.2.3.4_main_listening_mode", attributes: { [uc.SelectAttributes.CurrentOption]: "stereo" } };
  const result = await handler.handle(entity, uc.SelectCommands.SelectPrevious, { cycle: true });

  expect(result).toBe(uc.StatusCodes.Ok);
  expect(mockEiscp.command).toHaveBeenCalledWith({ zone: "main", command: "listening-mode", args: "mono" });
});
