/// <reference types="node" />
import { it, expect } from "vitest";
import type { IntegrationAPI } from "@unfoldedcircle/integration-api";
import fs from "fs";
import os from "os";
import path from "path";

function mkTmpDir(prefix = "onkyo-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeReceiver(mockDriver: Partial<IntegrationAPI>, tmp: string, cfg: any, mockEiscp: any) {
  return (async () => {
    const crModule = (await import("../src/commandReceiver.js")) as any;
    const ConfigModule = (await import("../src/configManager.js")) as any;
    const avrStateModule = (await import("../src/avrState.js")) as any;
    const { CommandReceiver } = crModule;
    const { ConfigManager, setConfigDir } = ConfigModule;
    const { avrStateManager } = avrStateModule;
    if (typeof setConfigDir === "function") setConfigDir(tmp);
    ConfigManager.save(cfg);
    const onkyoCfg = ConfigManager.load();
    const receiver = new CommandReceiver(mockDriver, onkyoCfg, mockEiscp as any, avrStateManager, "v-test");
    receiver.setupEiscpListener();
  })();
}

it("CommandReceiver uses user-configured input selector when it matches a reported alias", async () => {
  const tmp = mkTmpDir();
  try {
    const updates: Array<{ id: string; attrs: { [key: string]: string | number | boolean } }> = [];
    const mockDriver: Partial<IntegrationAPI> = {
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

    // User configured a specific list: dvd must win over the first alias bd when SLI10 is reported.
    const cfg = { avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", inputSelectorOptions: ["cd", "dvd", "tv"] }] };
    await makeReceiver(mockDriver, tmp, cfg, mockEiscp);

    mockEiscp.emit("data", {
      command: "input-selector",
      argument: ["bd", "dvd"],
      zone: "main",
      iscpCommand: "SLI",
      host: "1.2.3.4",
      port: 60128,
      model: "M"
    });

    const isoUpdates = updates.filter((u) => u.id.endsWith("_input_selector") && u.attrs && u.attrs.current_option);
    expect(isoUpdates.length > 0).toBe(true);
    expect(isoUpdates[isoUpdates.length - 1].attrs.current_option).toBe("dvd");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("CommandReceiver falls back to first alias when no configured input selector matches", async () => {
  const tmp = mkTmpDir();
  try {
    const updates: Array<{ id: string; attrs: { [key: string]: string | number | boolean } }> = [];
    const mockDriver: Partial<IntegrationAPI> = {
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

    // phono is not in the configured list, so the first alias (tape) is used for SLI20.
    const cfg = { avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", inputSelectorOptions: ["cd", "dvd", "tv"] }] };
    await makeReceiver(mockDriver, tmp, cfg, mockEiscp);

    mockEiscp.emit("data", {
      command: "input-selector",
      argument: ["tape", "tape1", "phono"],
      zone: "main",
      iscpCommand: "SLI",
      host: "1.2.3.4",
      port: 60128,
      model: "M"
    });

    const isoUpdates = updates.filter((u) => u.id.endsWith("_input_selector") && u.attrs && u.attrs.current_option);
    expect(isoUpdates.length > 0).toBe(true);
    expect(isoUpdates[isoUpdates.length - 1].attrs.current_option).toBe("tape");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("CommandReceiver applies inputSelectorOptions to non-main zones (per-AVR config)", async () => {
  const tmp = mkTmpDir();
  try {
    const updates: Array<{ id: string; attrs: { [key: string]: string | number | boolean } }> = [];
    const mockDriver: Partial<IntegrationAPI> = {
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

    const cfg = {
      avrs: [
        { model: "M", ip: "1.2.3.4", port: 60128, zone: "main", inputSelectorOptions: ["cd", "dvd", "tv"] },
        { model: "M", ip: "1.2.3.4", port: 60128, zone: "zone2", inputSelectorOptions: ["cd", "dvd", "tv"] }
      ]
    };
    await makeReceiver(mockDriver, tmp, cfg, mockEiscp);

    mockEiscp.emit("data", {
      command: "input-selector",
      argument: ["bd", "dvd"],
      zone: "zone2",
      iscpCommand: "SLZ",
      host: "1.2.3.4",
      port: 60128,
      model: "M"
    });

    const isoUpdates = updates.filter((u) => u.id.endsWith("_input_selector") && u.attrs && u.attrs.current_option);
    expect(isoUpdates.length > 0).toBe(true);
    expect(isoUpdates[isoUpdates.length - 1].id).toBe("M 1.2.3.4 zone2_input_selector");
    expect(isoUpdates[isoUpdates.length - 1].attrs.current_option).toBe("dvd");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("CommandReceiver uses the AVR-reported input name and ignores a manual input list in auto mode", async () => {
  const tmp = mkTmpDir();
  try {
    const updates: Array<{ id: string; attrs: { [key: string]: string | number | boolean } }> = [];
    const raws: string[] = [];
    const mockDriver: Partial<IntegrationAPI> = {
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
      async raw(cmd: string) {
        raws.push(cmd);
      }
      async command() {}
    }

    const mockEiscp = new MockEiscp();
    const inputSourceStore = (await import("../src/inputSourceStore.js")) as any;

    // The setting is "auto" (the default) and the AVR reported these inputs. A leftover manual list
    // must not be applied on top of them.
    const cfg = { avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", inputSourceList: "auto", inputSelectorOptions: ["cd", "dvd", "tv"] }] };
    await makeReceiver(mockDriver, tmp, cfg, mockEiscp);
    inputSourceStore.setAvrInputs("M 1.2.3.4", [
      { id: "33", name: "DAB" },
      { id: "10", name: "BD/DVD" }
    ]);

    // The parser reports the name the AVR uses, so it is used verbatim.
    mockEiscp.emit("data", {
      command: "input-selector",
      argument: "DAB",
      zone: "main",
      iscpCommand: "SLI",
      host: "1.2.3.4",
      port: 60128,
      model: "M"
    });
    // The tuner query is sent after the (async) zone render, so let the handler finish.
    await new Promise((resolve) => setTimeout(resolve, 10));

    const isoUpdates = updates.filter((u) => u.id.endsWith("_input_selector") && u.attrs && u.attrs.current_option);
    expect(isoUpdates.length > 0).toBe(true);
    expect(isoUpdates[isoUpdates.length - 1].attrs.current_option).toBe("DAB");
    // The DAB presets are still queried, identified by the input id the AVR reported.
    expect(raws).toContain("DSNQSTN");
  } finally {
    ((await import("../src/inputSourceStore.js")) as any).clearAllAvrInputs();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("CommandReceiver ignores collected inputs once the input source list is manual", async () => {
  const tmp = mkTmpDir();
  try {
    const updates: Array<{ id: string; attrs: { [key: string]: string | number | boolean } }> = [];
    const mockDriver: Partial<IntegrationAPI> = {
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
    const inputSourceStore = (await import("../src/inputSourceStore.js")) as any;

    const cfg = { avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", inputSourceList: "manual", inputSelectorOptions: ["dvd"] }] };
    await makeReceiver(mockDriver, tmp, cfg, mockEiscp);
    inputSourceStore.setAvrInputs("M 1.2.3.4", [{ id: "33", name: "DAB" }]);

    mockEiscp.emit("data", {
      command: "input-selector",
      argument: ["bd", "dvd"],
      zone: "main",
      iscpCommand: "SLI",
      host: "1.2.3.4",
      port: 60128,
      model: "M"
    });

    const isoUpdates = updates.filter((u) => u.id.endsWith("_input_selector") && u.attrs && u.attrs.current_option);
    expect(isoUpdates[isoUpdates.length - 1].attrs.current_option).toBe("dvd");
  } finally {
    ((await import("../src/inputSourceStore.js")) as any).clearAllAvrInputs();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
