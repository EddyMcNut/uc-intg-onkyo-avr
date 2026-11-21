// The setup wizard as the Remote drives it: every step answers exactly the fields of the form the handler returned,
// with the values the form shows (what the user gets by pressing Next), plus what the user changed.
import { describe, it, expect, vi } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";
import SetupHandler from "../src/setupHandler.js";
import { memoryConfigStore } from "./helpers/configStore.js";
import type { AvrConfig, IntegrationConfig } from "../src/configManager.js";
import type { AvrInput } from "../src/inputSourceStore.js";

type Discovery = { inputs: AvrInput[]; available: boolean; model?: string; ip?: string; port?: number };

function createSetup(initial: IntegrationConfig = {}, discovery: Discovery = { inputs: [], available: false }) {
  const configStore = memoryConfigStore(initial);
  const onConfigSaved = vi.fn(async () => {});
  const onConfigCleared = vi.fn(async () => {});
  const queryInputSources = vi.fn(async (_config: { model: string; ip: string; port: number }) => discovery);
  const setup = new SetupHandler({ driver: {} as never, getConfigDirPath: () => undefined, configStore, onConfigSaved, onConfigCleared, queryInputSources, log: console as never });
  return { setup, configStore, onConfigSaved, onConfigCleared, queryInputSources };
}

function title(action: uc.SetupAction): string {
  expect(action).toBeInstanceOf(uc.RequestUserInput);
  return (action as uc.RequestUserInput).title as unknown as string;
}

function settingIds(action: uc.SetupAction): string[] {
  return ((action as uc.RequestUserInput).settings as Array<{ id: string }>).map((setting) => setting.id);
}

// Submit the form as shown, with the given fields changed.
function answer(action: uc.SetupAction, changes: Record<string, string> = {}): uc.UserDataResponse {
  expect(action).toBeInstanceOf(uc.RequestUserInput);
  const values: Record<string, string> = {};
  for (const setting of (action as uc.RequestUserInput).settings as Array<{ id: string; field: Record<string, { value?: unknown }> }>) {
    const field = setting.field;
    const value = field.text?.value ?? field.number?.value ?? field.dropdown?.value ?? field.checkbox?.value;
    if (value !== undefined) values[setting.id] = String(value);
  }
  return new uc.UserDataResponse({ ...values, ...changes });
}

// Press Next until the wizard completes; returns the titles of the pages seen.
async function finish(setup: SetupHandler, action: uc.SetupAction, maxPages = 20): Promise<{ action: uc.SetupAction; titles: string[] }> {
  const titles: string[] = [];
  while (action instanceof uc.RequestUserInput && titles.length < maxPages) {
    titles.push(title(action));
    action = await setup.handle(answer(action));
  }
  return { action, titles };
}

const reconfigure = (setupData: Record<string, string> = {}) => new uc.DriverSetupRequest(true, setupData);

const AVR: AvrConfig = { model: "TX-RZ50", ip: "192.168.1.20", port: 60128, zone: "main", volumeScale: 80, createSensors: false } as AvrConfig;
const OTHER_AVR: AvrConfig = { model: "TX-NR7100", ip: "192.168.1.21", port: 60128, zone: "main" } as AvrConfig;

describe("setup wizard: first setup", () => {
  it("walks Configure → page 1 → 2 → 3 and saves the AVR", async () => {
    const { setup, configStore, onConfigSaved, queryInputSources } = createSetup();

    const initial = await setup.handle(new uc.DriverSetupRequest(false, {}));
    expect(title(initial)).toBe("Initial setup");

    const page1 = await setup.handle(answer(initial));
    expect(title(page1)).toBe("Manual configuration (1/3)");

    const page2 = await setup.handle(answer(page1, { model: "TX-RZ50", ipAddress: "192.168.1.20" }));
    expect(title(page2)).toBe("Manual configuration (2/3)");
    // Input names are probed on the AVR the user just entered, before the pages that use them.
    expect(queryInputSources).toHaveBeenCalledWith({ model: "TX-RZ50", ip: "192.168.1.20", port: 60128 });

    const page3 = await setup.handle(answer(page2, { volumeScale: "100" }));
    expect(title(page3)).toBe("Manual configuration (3/3)");

    // First setup stops after page 3; input sources and listening modes keep their defaults.
    const done = await setup.handle(answer(page3));
    expect(done).toBeInstanceOf(uc.SetupComplete);
    expect(onConfigSaved).toHaveBeenCalledTimes(1);
    expect(configStore.get().avrs).toEqual([expect.objectContaining({ model: "TX-RZ50", ip: "192.168.1.20", zone: "main", volumeScale: 100 })]);
  });

  it("uses the model and address the AVR reports when the probe finds it", async () => {
    const { setup, configStore } = createSetup({}, { inputs: [], available: false, model: "TX-RZ70", ip: "192.168.1.30", port: 60129 });

    const page1 = await setup.handle(answer(await setup.handle(new uc.DriverSetupRequest(false, {}))));
    const { action } = await finish(setup, await setup.handle(answer(page1, { model: "rz", ipAddress: "192.168.1.30" })));

    expect(action).toBeInstanceOf(uc.SetupComplete);
    expect(configStore.get().avrs).toEqual([expect.objectContaining({ model: "TX-RZ70", ip: "192.168.1.30", port: 60129 })]);
  });

  it("shows page 1 again with the errors when the values are invalid", async () => {
    const { setup, onConfigSaved } = createSetup();
    const page1 = await setup.handle(answer(await setup.handle(new uc.DriverSetupRequest(false, {}))));

    const { action } = await finish(setup, await setup.handle(answer(page1, { model: "TX-RZ50", ipAddress: "192.168.1.20", port: "99999" })), 2);

    expect(title(action)).toBe("Manual configuration (1/3)");
    expect(settingIds(action)).toContain("info");
    expect(JSON.stringify((action as uc.RequestUserInput).settings)).toContain("Errors:");
    expect(onConfigSaved).not.toHaveBeenCalled();
  });

  it("reports a setup error when saving fails", async () => {
    const { setup, onConfigSaved } = createSetup();
    onConfigSaved.mockRejectedValueOnce(new Error("disk full"));
    const page1 = await setup.handle(answer(await setup.handle(new uc.DriverSetupRequest(false, {}))));

    const { action } = await finish(setup, await setup.handle(answer(page1, { model: "TX-RZ50", ipAddress: "192.168.1.20" })));

    expect(action).toBeInstanceOf(uc.SetupError);
  });

  it("offers auto-detection again when model and address are left empty and no AVR is found", async () => {
    const { setup } = createSetup();
    vi.spyOn((setup as any).persistenceManager, "performAutoDiscovery").mockResolvedValue({ success: false });
    const page1 = await setup.handle(answer(await setup.handle(new uc.DriverSetupRequest(false, {}))));

    const { action } = await finish(setup, await setup.handle(answer(page1, { model: "", ipAddress: "" })), 2);

    expect(title(action)).toBe("Manual configuration");
    expect(JSON.stringify((action as uc.RequestUserInput).settings)).toContain("Auto-discovery failed");
  });
});

describe("setup wizard: reconfigure", () => {
  it("changes the integration settings of the only AVR and keeps everything else", async () => {
    const existing = { ...AVR, listeningModes: { "01": { name: "Stereo", setting: "dont-include" } } } as AvrConfig;
    const { setup, configStore, onConfigSaved } = createSetup({ avrs: [existing] });

    const menu = await setup.handle(reconfigure());
    const page1 = await setup.handle(reconfigure({ choice: "configure" }));
    expect(menu).toBeInstanceOf(uc.RequestUserInput);
    expect(title(page1)).toBe("Manual configuration (1/3)");

    const { action, titles } = await finish(setup, page1);

    expect(action).toBeInstanceOf(uc.SetupComplete);
    expect(titles).toEqual(["Manual configuration (1/3)", "Manual configuration (2/3)", "Manual configuration (3/3)"]);
    expect(onConfigSaved).toHaveBeenCalledTimes(1);
    expect(configStore.get().avrs![0]).toMatchObject({ model: "TX-RZ50", ip: "192.168.1.20", volumeScale: 80 });
    expect(configStore.get().avrs![0].listeningModes?.["01"]?.setting).toBe("dont-include");
  });

  it("marks a changed volume scale as chosen by the user, not discovered", async () => {
    const { setup, configStore } = createSetup({ avrs: [{ ...AVR, volumeScaleDiscovered: true } as AvrConfig] });
    const page1 = await setup.handle(reconfigure({ choice: "configure" }));
    const page2 = await setup.handle(answer(page1));

    const { action } = await finish(setup, await setup.handle(answer(page2, { volumeScale: "100" })));

    expect(action).toBeInstanceOf(uc.SetupComplete);
    expect(configStore.get().avrs![0]).toMatchObject({ volumeScale: 100, volumeScaleDiscovered: false });
  });

  it("configures the input sources the AVR reports, and marks them as discovered", async () => {
    const existing = { ...AVR, useAvrReportedInputs: true, idInputSources: { "10": { name: "BD/DVD", setting: "discover" } } } as AvrConfig;
    const reported = [
      { id: "10", name: "Blu-ray" },
      { id: "01", name: "CBL/SAT" }
    ];
    const { setup, configStore, queryInputSources } = createSetup({ avrs: [existing] }, { inputs: reported, available: true });

    const first = await setup.handle(reconfigure({ choice: "configure_input_sources" }));
    expect(queryInputSources).toHaveBeenCalledWith({ model: "TX-RZ50", ip: "192.168.1.20", port: 60128 });
    expect(title(first)).toBe("Input Sources (1/1)");
    expect(settingIds(first)).toEqual(expect.arrayContaining(["ids_10", "ids_01"]));

    const { action, titles } = await finish(setup, first);

    // Input-source configuration stops after its own pages.
    expect(action).toBeInstanceOf(uc.SetupComplete);
    expect(titles).toEqual(["Input Sources (1/1)"]);
    expect(configStore.get().avrs![0].idInputSources?.["10"]?.setting).toBe("discovered");
  });

  it("pages through every input source when the AVR cannot report them", async () => {
    const { setup } = createSetup({ avrs: [AVR] });

    const { action, titles } = await finish(setup, await setup.handle(reconfigure({ choice: "configure_input_sources" })));

    expect(action).toBeInstanceOf(uc.SetupComplete);
    expect(titles.length).toBeGreaterThan(1);
    titles.forEach((pageTitle, index) => expect(pageTitle).toBe(`Input Sources (${index + 1}/${titles.length})`));
  });

  it("pages through the listening modes and saves the changed one", async () => {
    const { setup, configStore } = createSetup({ avrs: [AVR] });

    const first = await setup.handle(reconfigure({ choice: "configure_listening_modes" }));
    const firstMode = settingIds(first).find((id) => id.startsWith("lmd_"))!;
    const second = await setup.handle(answer(first, { [firstMode]: "dont-include" }));
    const { action, titles } = await finish(setup, second);

    expect(action).toBeInstanceOf(uc.SetupComplete);
    const total = titles.length + 1;
    expect(title(first)).toBe(`Listening Modes (1/${total})`);
    expect(titles.at(-1)).toBe(`Listening Modes (${total}/${total})`);
    expect(configStore.get().avrs![0].listeningModes?.[firstMode.substring(4).toUpperCase()]?.setting).toBe("dont-include");
  });

  it("asks which AVR first when more than one is configured, and asks again for an unknown one", async () => {
    const { setup, queryInputSources } = createSetup({ avrs: [AVR, OTHER_AVR] });

    const selection = await setup.handle(reconfigure({ choice: "configure_input_sources" }));
    expect(title(selection)).toContain("Select AVR");

    const again = await setup.handle(new uc.UserDataResponse({ selectedAvr: "TX-XX 10.0.0.1" }));
    expect(title(again)).toContain("Select AVR");
    expect(queryInputSources).not.toHaveBeenCalled();

    const first = await setup.handle(new uc.UserDataResponse({ selectedAvr: "TX-NR7100 192.168.1.21" }));
    expect(title(first)).toMatch(/^Input Sources \(1\//);
    expect(queryInputSources).toHaveBeenCalledWith({ model: "TX-NR7100", ip: "192.168.1.21", port: 60128 });
  });

  it("starts the integration settings of the selected AVR", async () => {
    const { setup } = createSetup({ avrs: [AVR, OTHER_AVR] });
    await setup.handle(reconfigure({ choice: "configure" }));

    const page1 = await setup.handle(new uc.UserDataResponse({ selectedAvr: "TX-NR7100 192.168.1.21" }));

    expect(title(page1)).toBe("Manual configuration (1/3)");
    expect(settingIds(page1)).toContain("model");
    expect(JSON.stringify((page1 as uc.RequestUserInput).settings)).toContain("192.168.1.21");
  });
});

describe("setup wizard: the full flow", () => {
  // Reached through "Configure" outside a first setup (e.g. after a restore in the same session): after page 3 the
  // input-source and listening-mode pages follow before the configuration is saved.
  it("continues with the input sources and listening modes after page 3", async () => {
    const { setup, onConfigSaved } = createSetup({ avrs: [AVR] });

    const page1 = await setup.handle(new uc.UserDataResponse({ restore_from_backup: "false" }));
    const { action, titles } = await finish(setup, page1, 40);

    expect(action).toBeInstanceOf(uc.SetupComplete);
    expect(titles.slice(0, 3)).toEqual(["Manual configuration (1/3)", "Manual configuration (2/3)", "Manual configuration (3/3)"]);
    expect(titles.some((pageTitle) => pageTitle.startsWith("Input Sources"))).toBe(true);
    expect(titles.at(-1)).toMatch(/^Listening Modes \((\d+)\/\1\)$/);
    expect(onConfigSaved).toHaveBeenCalledTimes(1);
  });
});

describe("setup wizard: backup, restore and delete", () => {
  it("routes the reconfigure menu choices to their forms", async () => {
    const { setup } = createSetup({ avrs: [AVR] });

    expect(title(await setup.handle(reconfigure({ choice: "backup" })))).toMatch(/backup/i);
    expect(title(await setup.handle(reconfigure({ choice: "restore" })))).toMatch(/restore/i);
    expect(settingIds(await setup.handle(reconfigure({ choice: "delete_config" })))).toContain("confirm_delete_config");
  });

  it("clears the config once deletion is confirmed, and reports a failure", async () => {
    const { setup, onConfigCleared } = createSetup({ avrs: [AVR] });

    expect(await setup.handle(reconfigure({ confirm_delete_config: "true" }))).toBeInstanceOf(uc.SetupComplete);
    expect(onConfigCleared).toHaveBeenCalledTimes(1);

    onConfigCleared.mockRejectedValueOnce(new Error("busy"));
    expect(await setup.handle(new uc.UserDataResponse({ action: "delete_config", confirm_delete_config: "true" }))).toBeInstanceOf(uc.SetupError);
  });

  it("asks for confirmation before deleting from a user-data response", async () => {
    const { setup, onConfigCleared } = createSetup({ avrs: [AVR] });

    const confirm = await setup.handle(new uc.UserDataResponse({ action: "delete_config" }));

    expect(settingIds(confirm)).toContain("confirm_delete_config");
    expect(onConfigCleared).not.toHaveBeenCalled();
  });

  it("reports a setup error when a valid restore cannot be applied", async () => {
    const { setup } = createSetup();
    vi.spyOn((setup as any).persistenceManager, "restoreConfiguration").mockRejectedValue(new Error("disk full"));

    const result = await setup.handle(new uc.UserDataResponse({ restore_from_backup: "true", restore_data: JSON.stringify({ config: { avrs: [AVR] } }) }));

    expect(result).toBeInstanceOf(uc.SetupError);
  });

  it("completes when the backup form comes back with its data", async () => {
    const { setup } = createSetup({ avrs: [AVR] });

    expect(await setup.handle(new uc.UserDataResponse({ action: "backup", backup_data: '{"config":{}}' }))).toBeInstanceOf(uc.SetupComplete);
    expect(await setup.handle(new uc.UserDataResponse({ backup_data: '{"config":{}}' }))).toBeInstanceOf(uc.SetupComplete);
  });

  it("shows the reconfigure menu for an empty response and starts the chosen flow from an action", async () => {
    const { setup } = createSetup({ avrs: [AVR] });

    expect(settingIds(await setup.handle(new uc.UserDataResponse({})))).toContain("choice");
    expect(title(await setup.handle(new uc.UserDataResponse({ action: "configure" })))).toBe("Manual configuration (1/3)");
    expect(title(await setup.handle(new uc.UserDataResponse({ action: "configure_input_sources" })))).toMatch(/^Input Sources/);
    expect(title(await setup.handle(new uc.UserDataResponse({ action: "configure_listening_modes" })))).toMatch(/^Listening Modes/);
    expect(await setup.handle(new uc.UserDataResponse({ action: "something-else" }))).toBeInstanceOf(uc.SetupComplete);
  });
});
