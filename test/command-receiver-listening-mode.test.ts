/// <reference types="node" />
import test from "ava";
import type { IntegrationAPI } from "@unfoldedcircle/integration-api";
import * as uc from "@unfoldedcircle/integration-api";
import fs from "fs";
import os from "os";
import { pathToFileURL } from "url";
import path from "path";

function mkTmpDir(prefix = "onkyo-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test.serial("CommandReceiver preserves user-configured listeningModeOptions across IFA/source events", async (t) => {
  const tmp = mkTmpDir();
  try {
    const crModule = (await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/commandReceiver.js")).href)) as any;
    const ConfigModule = (await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/configManager.js")).href)) as any;
    const { CommandReceiver } = crModule;
    const { ConfigManager, setConfigDir } = ConfigModule;
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
    const receiver = new CommandReceiver(mockDriver, onkyoCfg, mockEiscp as any, "v-test");
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
    t.true(selectUpdates.length > 0, "listening_mode options should be updated at least once");

    const lastOptions = selectUpdates[selectUpdates.length - 1].attrs.options;
    t.deepEqual(lastOptions, ["stereo", "straight-decode"]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test.serial("CommandReceiver sets media player state to Playing only for ON+NET+album-art subsources", async (t) => {
  const tmp = mkTmpDir();
  try {
    const crModule = (await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/commandReceiver.js")).href)) as any;
    const ConfigModule = (await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/configManager.js")).href)) as any;
    const { CommandReceiver } = crModule;
    const { ConfigManager, setConfigDir } = ConfigModule;
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
    const receiver = new CommandReceiver(mockDriver, onkyoCfg, mockEiscp as any, "v-test");
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
    t.is(statesByEntity.get(entityId), uc.MediaPlayerStates.On);

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
    t.is(statesByEntity.get(entityId), uc.MediaPlayerStates.Playing);

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
    t.is(statesByEntity.get(entityId), uc.MediaPlayerStates.Standby);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
