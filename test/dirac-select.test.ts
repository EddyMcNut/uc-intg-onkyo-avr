/// <reference types="node" />
import { testMediaBrowser, testMediaBrowserServices } from "./helpers/mediaBrowserServices.js";
import { testAvrContexts } from "./helpers/contexts.js";
import { describe, it, expect, vi } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";
import fs from "fs";
import os from "os";
import path from "path";
import { testConfigStore } from "./helpers/configStore.js";

function mkTmpDir(prefix = "onkyo-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("diracSelect helpers", () => {
  it("DIRAC_OPTION_LABELS exposes fixed options in display order", async () => {
    const mod = (await import("../src/diracSelect.js")) as any;
    expect(mod.DIRAC_OPTION_LABELS).toEqual(["Off", "Slot 1", "Slot 2", "Slot 3"]);
  });

  it("diracOptionToServiceKey maps UI labels to eiscp service keys", async () => {
    const mod = (await import("../src/diracSelect.js")) as any;
    expect(mod.diracOptionToServiceKey("Off")).toBe("off");
    expect(mod.diracOptionToServiceKey("Slot 1")).toBe("slot1");
    expect(mod.diracOptionToServiceKey("Slot 2")).toBe("slot2");
    expect(mod.diracOptionToServiceKey("Slot 3")).toBe("slot3");
    expect(mod.diracOptionToServiceKey("Unknown")).toBe("Unknown");
  });

  it("diracServiceKeyToOption maps eiscp service keys to UI labels", async () => {
    const mod = (await import("../src/diracSelect.js")) as any;
    expect(mod.diracServiceKeyToOption("off")).toBe("Off");
    expect(mod.diracServiceKeyToOption("slot1")).toBe("Slot 1");
    expect(mod.diracServiceKeyToOption("slot2")).toBe("Slot 2");
    expect(mod.diracServiceKeyToOption("slot3")).toBe("Slot 3");
    expect(mod.diracServiceKeyToOption("unknown-key")).toBe("unknown-key");
  });

  it("diracResponseToCommandValue maps AVR query responses to command values", async () => {
    const mod = (await import("../src/diracSelect.js")) as any;
    expect(mod.diracResponseToCommandValue("100")).toBe("C00");
    expect(mod.diracResponseToCommandValue("200")).toBe("C01");
    expect(mod.diracResponseToCommandValue("300")).toBe("C02");
    expect(mod.diracResponseToCommandValue("400")).toBe("C03");
    expect(mod.diracResponseToCommandValue("QSTN")).toBe("QSTN");
  });
});

describe("createDiracSelectEntity", () => {
  it("builds a Dirac select entity with fixed options and blank current option", async () => {
    const tmp = mkTmpDir();
    try {
      const cfgModule = (await import("../src/configManager.js")) as any;
      const configStore = new cfgModule.ConfigStore(cfgModule.configPathFor(tmp));
      configStore.save({ avrs: [{ model: "TX-RZ50", ip: "192.168.1.2", port: 60128, zone: "main", entityNameStyle: "short" }] });

      const module = (await import("../src/entityRegistrar.js")) as any;
      const EntityRegistrar = module.default;
      const registrar = new EntityRegistrar(
        (await import("./helpers/avrState.js")).avrStateManager,
        testAvrContexts,
        testMediaBrowser((await import("./helpers/avrState.js")).avrStateManager),
        configStore
      );
      const avrEntry = "TX-RZ50 192.168.1.2 main";

      const select = registrar.createDiracSelectEntity(avrEntry, async () => uc.StatusCodes.Ok);
      expect(select).toBeTruthy();
      expect(select.id.endsWith("_dirac")).toBe(true);
      expect(select.name?.en).toBe("TX-RZ50 Main Dirac");
      expect(select.attributes?.state).toBe(uc.SelectStates.On);

      const attrs = select.attributes || {};
      expect(attrs.options).toEqual(["Off", "Slot 1", "Slot 2", "Slot 3"]);
      expect(attrs.current_option).toBe("");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("does not derive options from user config; options stay fixed", async () => {
    const tmp = mkTmpDir();
    try {
      const cfgModule = (await import("../src/configManager.js")) as any;
      const configStore = new cfgModule.ConfigStore(cfgModule.configPathFor(tmp));
      // Even with bogus listeningModeOptions config, Dirac options remain the fixed set.
      configStore.save({
        avrs: [{ model: "TX-RZ50", ip: "192.168.1.2", port: 60128, zone: "main", entityNameStyle: "short", listeningModeOptions: ["stereo", "direct"] }]
      });

      const module = (await import("../src/entityRegistrar.js")) as any;
      const EntityRegistrar = module.default;
      const avrStateModule = (await import("../src/avrState.js")) as any;
      const registrar = new EntityRegistrar(
        (await import("./helpers/avrState.js")).avrStateManager,
        testAvrContexts,
        testMediaBrowser((await import("./helpers/avrState.js")).avrStateManager),
        configStore
      );
      const select = registrar.createDiracSelectEntity("TX-RZ50 192.168.1.2 main", async () => uc.StatusCodes.Ok);

      expect((select.attributes || {}).options).toEqual(["Off", "Slot 1", "Slot 2", "Slot 3"]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("Dirac receive path (CommandReceiver.handleDirac)", () => {
  it("sets current_option from a reported Dirac slot", async () => {
    const tmp = mkTmpDir();
    try {
      const crModule = (await import("../src/commandReceiver.js")) as any;
      const ConfigModule = (await import("../src/configManager.js")) as any;
      const avrStateModule = (await import("../src/avrState.js")) as any;
      const { CommandReceiver } = crModule;
      const { avrStateManager } = await import("./helpers/avrState.js");
      const configStore = new ConfigModule.ConfigStore(ConfigModule.configPathFor(tmp));
      configStore.save({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main" }] });

      const updates: Array<{ id: string; attrs: { [key: string]: string | number | boolean } }> = [];
      const mockDriver: Partial<uc.IntegrationAPI> = {
        updateEntityAttributes: (id: string, attrs: { [key: string]: string | number | boolean }) => {
          updates.push({ id, attrs });
          return true;
        }
      };

      class MockEiscp {
        private handlers: { [k: string]: Function[] } = {};
        public connected = true;
        on(evt: string, cb: Function) {
          (this.handlers[evt] ??= []).push(cb);
        }
        emit(evt: string, payload: any) {
          (this.handlers[evt] || []).forEach((h) => h(payload));
        }
        async raw() {}
        async command() {}
      }
      const mockEiscp = new MockEiscp();

      const receiver = new CommandReceiver(mockDriver, configStore.load(), mockEiscp as any, avrStateManager, testAvrContexts, testMediaBrowser(avrStateManager), configStore, "v-test");
      receiver.setupEiscpListener();
      const entityId = "M 1.2.3.4 main";

      mockEiscp.emit("data", {
        command: "dirac",
        argument: "slot2",
        zone: "main",
        iscpCommand: "DSS",
        host: "1.2.3.4",
        port: 60128,
        model: "M"
      });

      await new Promise((resolve) => setTimeout(resolve, 25));

      const diracUpdates = updates.filter((u) => u.id.endsWith("_dirac"));
      expect(diracUpdates.length).toBe(1);
      expect(diracUpdates[0].id).toBe(`${entityId}_dirac`);
      expect(diracUpdates[0].attrs[uc.SelectAttributes.CurrentOption]).toBe("Slot 2");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("keeps current value for undefined/unknown/query Dirac arguments", async () => {
    const tmp = mkTmpDir();
    try {
      const crModule = (await import("../src/commandReceiver.js")) as any;
      const ConfigModule = (await import("../src/configManager.js")) as any;
      const avrStateModule = (await import("../src/avrState.js")) as any;
      const { CommandReceiver } = crModule;
      const { avrStateManager } = await import("./helpers/avrState.js");
      const configStore = new ConfigModule.ConfigStore(ConfigModule.configPathFor(tmp));
      configStore.save({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main" }] });

      const updates: Array<{ id: string; attrs: { [key: string]: string | number | boolean } }> = [];
      const mockDriver: Partial<uc.IntegrationAPI> = {
        updateEntityAttributes: (id: string, attrs: { [key: string]: string | number | boolean }) => {
          updates.push({ id, attrs });
          return true;
        }
      };

      class MockEiscp {
        private handlers: { [k: string]: Function[] } = {};
        public connected = true;
        on(evt: string, cb: Function) {
          (this.handlers[evt] ??= []).push(cb);
        }
        emit(evt: string, payload: any) {
          (this.handlers[evt] || []).forEach((h) => h(payload));
        }
        async raw() {}
        async command() {}
      }
      const mockEiscp = new MockEiscp();

      const receiver = new CommandReceiver(mockDriver, configStore.load(), mockEiscp as any, avrStateManager, testAvrContexts, testMediaBrowser(avrStateManager), configStore, "v-test");
      receiver.setupEiscpListener();

      for (const arg of ["undefined", "unknown", "query"]) {
        mockEiscp.emit("data", {
          command: "dirac",
          argument: arg,
          zone: "main",
          iscpCommand: "DSS",
          host: "1.2.3.4",
          port: 60128,
          model: "M"
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 25));

      const diracUpdates = updates.filter((u) => u.id.endsWith("_dirac"));
      expect(diracUpdates.length).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("Dirac send path (SelectEntityHandler with diracOptionToServiceKey)", () => {
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

  async function makeDiracHandler() {
    const mod = (await import("../src/selectEntityHandler.js")) as any;
    const { SelectEntityHandler } = mod;
    const diracMod = (await import("../src/diracSelect.js")) as any;
    const { DIRAC_OPTION_LABELS, diracOptionToServiceKey } = diracMod;

    const mockEiscp = makeMockEiscp(true);
    const driver = { updateEntityAttributes: vi.fn() };
    const connMgr = { getPhysicalConnection: vi.fn().mockReturnValue({ eiscp: mockEiscp }) };
    const avrMgr = { get: vi.fn().mockReturnValue({ config: { model: "M", ip: "1.2.3.4", port: 60128, zone: "main" } }) };

    const handler = new SelectEntityHandler(driver, connMgr, avrMgr, "_dirac", "dirac", "Dirac", () => [...DIRAC_OPTION_LABELS], diracOptionToServiceKey);
    return { handler, mockEiscp, driver };
  }

  it("sends the correct DSS argument for a selected Dirac option", async () => {
    const { handler, mockEiscp, driver } = await makeDiracHandler();
    const entity = { id: "M_1.2.3.4_main_dirac", attributes: { [uc.SelectAttributes.CurrentOption]: "Off" } };

    const result = await handler.handle(entity, uc.SelectCommands.SelectOption, { option: "Slot 1" });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mockEiscp.command).toHaveBeenCalledWith({ zone: "main", command: "dirac", args: "slot1" });
    expect(driver.updateEntityAttributes).toHaveBeenCalledWith(entity.id, { [uc.SelectAttributes.CurrentOption]: "Slot 1" });
  });

  it("maps Off to the off (C00) argument", async () => {
    const { handler, mockEiscp } = await makeDiracHandler();
    const entity = { id: "M_1.2.3.4_main_dirac", attributes: { [uc.SelectAttributes.CurrentOption]: "Slot 3" } };

    const result = await handler.handle(entity, uc.SelectCommands.SelectOption, { option: "Off" });

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mockEiscp.command).toHaveBeenCalledWith({ zone: "main", command: "dirac", args: "off" });
  });

  it("SelectNext cycles through the fixed Dirac options", async () => {
    const { handler, mockEiscp } = await makeDiracHandler();
    const entity = { id: "M_1.2.3.4_main_dirac", attributes: { [uc.SelectAttributes.CurrentOption]: "Slot 1" } };

    const result = await handler.handle(entity, uc.SelectCommands.SelectNext, {});

    expect(result).toBe(uc.StatusCodes.Ok);
    expect(mockEiscp.command).toHaveBeenCalledWith({ zone: "main", command: "dirac", args: "slot2" });
  });
});
