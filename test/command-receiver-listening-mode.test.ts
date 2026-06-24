/// <reference types="node" />
import { describe, it, expect } from "vitest";
import type { IntegrationAPI } from "@unfoldedcircle/integration-api";
import * as uc from "@unfoldedcircle/integration-api";
import fs from "fs";
import os from "os";
import path from "path";

function mkTmpDir(prefix = "onkyo-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

it("CommandReceiver preserves user-configured listeningModeOptions across IFA/source events", async () => {
  const tmp = mkTmpDir();
  try {
    const crModule = (await import("../src/commandReceiver.js")) as any;
    const ConfigModule = (await import("../src/configManager.js")) as any;
    const avrStateModule = (await import("../src/avrState.js")) as any;
    const { CommandReceiver } = crModule;
    const { ConfigManager, setConfigDir } = ConfigModule;
    const { avrStateManager } = avrStateModule;
    if (typeof setConfigDir === "function") setConfigDir(tmp);

    // Prepare config with user-specified listeningModeOptions
    const cfg = { avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", listeningModeOptions: ["stereo", "straight-decode"] }] };
    ConfigManager.save(cfg);

    // Capture attribute updates from the driver
    const updates: Array<{ id: string; attrs: { [key: string]: string | number | boolean } }> = [];
    const mockDriver: Partial<IntegrationAPI> = {
      updateEntityAttributes: (id: string, attrs: { [key: string]: string | number | boolean }) => {
        updates.push({ id, attrs });
        return true;
      }
    };

    // Minimal mock eISCP that allows emitting 'data' events
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

    // Construct CommandReceiver with the persisted config
    const onkyoCfg = ConfigManager.load();
    const receiver = new CommandReceiver(mockDriver, onkyoCfg, mockEiscp as any, avrStateManager, "v-test");
    receiver.setupEiscpListener();

    // Emit an IFA event that would normally trigger listening-mode option filtering
    const ifaEvent = {
      command: "IFA",
      argument: { audioInputValue: "pcm 2.0", audioOutputValue: "" },
      zone: "main",
      iscpCommand: "IFA",
      host: "1.2.3.4",
      port: 60128,
      model: "M"
    };

    mockEiscp.emit("data", ifaEvent);

    // Find the last update to the listening_mode select entity options
    const selectUpdates = updates.filter((u) => u.id.endsWith("_listening_mode") && u.attrs && u.attrs.options);
    expect(selectUpdates.length > 0).toBe(true);

    const lastOptions = selectUpdates[selectUpdates.length - 1].attrs.options;
    expect(lastOptions).toEqual(["stereo", "straight-decode"]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("CommandReceiver sets media player state to Playing only for ON+NET+album-art subsources", async () => {
  const tmp = mkTmpDir();
  try {
    const crModule = (await import("../src/commandReceiver.js")) as any;
    const ConfigModule = (await import("../src/configManager.js")) as any;
    const avrStateModule = (await import("../src/avrState.js")) as any;
    const { CommandReceiver } = crModule;
    const { ConfigManager, setConfigDir } = ConfigModule;
    const { avrStateManager } = avrStateModule;
    if (typeof setConfigDir === "function") setConfigDir(tmp);

    ConfigManager.save({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main" }] });

    const statesByEntity = new Map<string, uc.MediaPlayerStates>();
    const mockDriver: Partial<IntegrationAPI> = {
      updateEntityAttributes: (id: string, attrs: { [key: string]: string | number | boolean }) => {
        const state = attrs[uc.MediaPlayerAttributes.State] as uc.MediaPlayerStates | undefined;
        if (state) {
          statesByEntity.set(id, state);
        }
        return true;
      }
    };

    class MockEiscp {
      private handlers: { [k: string]: Function[] } = {};
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
    const onkyoCfg = ConfigManager.load();
    const receiver = new CommandReceiver(mockDriver, onkyoCfg, mockEiscp as any, avrStateManager, "v-test");
    receiver.setupEiscpListener();

    const entityId = "M 1.2.3.4 main";

    mockEiscp.emit("data", {
      command: "system-power",
      argument: "on",
      zone: "main",
      iscpCommand: "PWR",
      host: "1.2.3.4",
      port: 60128,
      model: "M"
    });

    mockEiscp.emit("data", {
      command: "input-selector",
      argument: "cd",
      zone: "main",
      iscpCommand: "SLI",
      host: "1.2.3.4",
      port: 60128,
      model: "M"
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(statesByEntity.get(entityId)).toBe(uc.MediaPlayerStates.On);

    mockEiscp.emit("data", {
      command: "input-selector",
      argument: "net",
      zone: "main",
      iscpCommand: "SLI",
      host: "1.2.3.4",
      port: 60128,
      model: "M"
    });

    await new Promise((resolve) => setTimeout(resolve, 25));

    mockEiscp.emit("data", {
      command: "NLT",
      argument: "Spotify",
      zone: "main",
      iscpCommand: "NLT",
      host: "1.2.3.4",
      port: 60128,
      model: "M"
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(statesByEntity.get(entityId)).toBe(uc.MediaPlayerStates.Playing);

    mockEiscp.emit("data", {
      command: "system-power",
      argument: "standby",
      zone: "main",
      iscpCommand: "PWR",
      host: "1.2.3.4",
      port: 60128,
      model: "M"
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(statesByEntity.get(entityId)).toBe(uc.MediaPlayerStates.Standby);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
