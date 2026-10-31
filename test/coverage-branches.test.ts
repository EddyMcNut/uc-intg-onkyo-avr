import { describe, expect, it, vi } from "vitest";
import { normalizeAvrConfig, normalizeLearnedListeningModes, parseBoolean, parseSelectOptions, parseVolumeScale, resolveVolumeScale } from "../src/configConstants.js";
import { getKnownListeningModes, normalizeListeningModePreferences, normalizeListeningModes, resolveListeningModePreferences, resolveListeningModes } from "../src/listeningModePreferences.js";
import { ConfigManager } from "../src/configManager.js";
import { findLearnedListeningModeCode, findLearnedListeningModeName, getLearnedListeningModes, learnListeningMode } from "../src/learnedListeningModeStore.js";
import { parseAvrInfo } from "../src/avrInfoStore.js";
import { ZoneAgnosticUpdateProcessor } from "../src/zoneAgnosticUpdateProcessor.js";
import { EiscpDriver } from "../src/eiscp.js";

describe("configuration branch coverage", () => {
  it("handles every select-option sentinel and invalid input type", () => {
    expect(parseSelectOptions(null)).toBeNull();
    expect(parseSelectOptions(undefined)).toBe("all");
    expect(parseSelectOptions("")).toBe("all");
    expect(parseSelectOptions(" none ")).toBeNull();
    expect(parseSelectOptions("all")).toBe("all");
    expect(parseSelectOptions(" a; b, c ")).toEqual(["a", "b", "c"]);
    expect(parseSelectOptions([])).toBe("all");
    expect(parseSelectOptions(["none"])).toBeNull();
    expect(parseSelectOptions(["all"])).toBe("all");
    expect(parseSelectOptions(["a", "b"])).toEqual(["a", "b"]);
    expect(parseSelectOptions(42)).toEqual([]);
    expect(parseBoolean(null, true)).toBe(true);
    expect(parseBoolean("TRUE", false)).toBe(true);
    expect(parseBoolean("false", true)).toBe(false);
    expect(parseBoolean(1, false)).toBe(false);
    expect(parseVolumeScale("80")).toBe(80);
    expect(parseVolumeScale("100")).toBe(100);
    expect(parseVolumeScale("bad")).toBe("auto");
    expect(resolveVolumeScale("bad")).toBe(100);
  });

  it("normalizes invalid and non-default AVR values", () => {
    const normalized = normalizeAvrConfig({
      model: "M",
      ip: "1.2.3.4",
      port: 70000 as any,
      zone: "main",
      queueThreshold: -1 as any,
      albumArtURL: "  art.png ",
      volumeDisplay: "relative",
      entityNameStyle: "long",
      useAvrReportedInputs: "false" as any,
      adjustVolumeDispl: "false" as any,
      createSensors: "false" as any,
      createTunerPresets: "false" as any,
      createRemoteEntity: "false" as any,
      createDiracSelectEntity: "false" as any,
      netMenuDelay: "bad" as any,
      tuneinPresetPosition: 11 as any,
      tuneinMenuStyle: "full",
      listeningModes: [] as any
    });
    expect(normalized.port).toBe(60128);
    expect(normalized.queueThreshold).toBe(100);
    expect(normalized.albumArtURL).toBe("art.png");
    expect(normalized.volumeDisplay).toBe("relative");
    expect(normalized.entityNameStyle).toBe("long");
    expect(normalized.createSensors).toBe(false);
    expect(normalized.netMenuDelay).toBe(500);
    expect(normalized.tuneinPresetPosition).toBe(1);
    expect(normalized.listeningModes).toEqual({});
  });

  it("normalizes learned listening mode payloads", () => {
    expect(normalizeLearnedListeningModes(null)).toEqual([]);
    expect(
      normalizeLearnedListeningModes([
        { code: "0a", name: "  Learned " },
        { code: "0A", name: "Updated" }
      ])
    ).toEqual([{ code: "0A", name: "Updated" }]);
    expect(normalizeLearnedListeningModes([{ modes: [{ code: "01", name: "Direct" }] }, { code: "bad", name: "x" }, { code: "02", name: "" }])).toEqual([{ code: "01", name: "Direct" }]);
    expect(normalizeLearnedListeningModes([{ code: "01", name: "x".repeat(251) }, 4 as any])).toEqual([]);
  });
});

describe("listening mode branch coverage", () => {
  it("filters and normalizes malformed preference stores", () => {
    const known = getKnownListeningModes();
    const stereo = known.find((mode) => mode.aliases.includes("stereo"))!;
    expect(normalizeListeningModePreferences(null)).toEqual({});
    expect(normalizeListeningModePreferences([])).toEqual({});
    expect(normalizeListeningModePreferences({ [stereo.code]: " stereo " })).toEqual({ [stereo.code]: "stereo" });
    expect(normalizeListeningModePreferences({ [stereo.code]: "disable", ZZ: "bad" })).toEqual({ [stereo.code]: "disable" });

    expect(normalizeListeningModes(null)).toEqual({});
    expect(
      normalizeListeningModes([
        {
          modes: [
            { code: "0a", name: " Learned " },
            { code: "bad", name: "Nope" }
          ]
        }
      ])
    ).toEqual({ "0A": { name: "Learned", setting: "discover" } });
    expect(normalizeListeningModes({ "00": { name: "stereo", setting: "stereo" }, bad: {}, "01": null })).toEqual({ "00": { name: "stereo", setting: "stereo" } });
  });

  it("resolves learned, disabled, duplicate and unknown modes", () => {
    const known = getKnownListeningModes();
    const stereo = known.find((mode) => mode.aliases.includes("stereo"))!;
    const direct = known.find((mode) => mode.aliases.includes("direct"))!;
    const preferences = { [stereo.code]: "discover", [direct.code]: "disable", FF: "discover" };
    expect(resolveListeningModePreferences(undefined, [])).toBeUndefined();
    expect(
      resolveListeningModePreferences(preferences, [
        { code: stereo.code, name: "AVR Stereo" },
        { code: "FF", name: "Future" }
      ])
    ).toEqual(["AVR Stereo", "Future"]);
    expect(resolveListeningModes({ "00": { name: "same", setting: "discover" }, "01": { name: "same", setting: "discovered" }, "02": { name: "off", setting: "disable" } }, [])).toEqual(["same"]);
  });
});

describe("learned mode store branches", () => {
  it("handles malformed entities, lookups, learning and duplicates", () => {
    ConfigManager.save({ avrs: [{ model: "M", ip: "1.2.3.4", port: 60128, zone: "main", listeningModes: { "00": { name: "Stereo", setting: "stereo" } } }] });
    expect(getLearnedListeningModes("bad")).toEqual([]);
    expect(findLearnedListeningModeCode("M 1.2.3.4", " stereo ")).toBe("00");
    expect(findLearnedListeningModeCode("M 1.2.3.4", "missing")).toBeUndefined();
    expect(findLearnedListeningModeName("M 1.2.3.4", "00")).toBe("Stereo");
    expect(findLearnedListeningModeName("M 1.2.3.4", "ff")).toBeUndefined();
    expect(learnListeningMode("bad", { code: "01", name: "Bad" })).toBe(false);
    expect(learnListeningMode("M 1.2.3.4 main", { code: "01", name: "Direct" })).toBe(true);
    expect(learnListeningMode("M 1.2.3.4 main", { code: "01", name: "Direct" })).toBe(false);
    expect(learnListeningMode("M 1.2.3.4 main", { code: "80", name: "Dolby Audio - Surr", source: "stm", audioFormat: "PCM Stereo", inputChannels: "2.0 ch" })).toBe(true);
    expect(learnListeningMode("M 1.2.3.4 main", { code: "80", name: "Dolby Atmos", source: "stm", audioFormat: "Dolby Atmos", inputChannels: "5.1 ch" })).toBe(true);
    expect(getLearnedListeningModes("M 1.2.3.4 main", "stm", "PCM Stereo", "2.0 ch").map((mode) => mode.name)).toContain("Dolby Audio - Surr");
    expect(getLearnedListeningModes("M 1.2.3.4 main", "stm", "Dolby Atmos", "5.1 ch").map((mode) => mode.name)).toContain("Dolby Atmos");
    expect(learnListeningMode("M 1.2.3.4 main", { code: "bad", name: "Bad" })).toBe(false);
  });
});

describe("AVR information parser branches", () => {
  it("rejects incomplete XML and parses all supported sections", () => {
    expect(parseAvrInfo("")).toBeNull();
    expect(parseAvrInfo("<response />")).toBeNull();
    const xml = `<response><device><model>TX</model><friendlyname>Living &amp; Room</friendlyname><firmwareversion>1.2</firmwareversion><presetlist count="2"><preset id="01" name=" Station &amp; One " band="1" freq="101.2"/><preset id="zz"/></presetlist><netservicelist><netservice id="0E" name="TuneIn" enable="07" account="x"/><netservice id="0F" name="Other" enable="false"/><netservice id="10" name="Bool" enable="true"/><netservice id="11" name="Missing"/></netservicelist><selectorlist><selector id="0A" name="BD/DVD"/></selectorlist><controllist><control id="MVL" value="20" zone="2" min="0" max="80" step="1" code="01" position="A"/><control id="X" value="x" zone="bad" min="bad"/></controllist><zonelist><zone id="1" name="Main" value="1" volmax="80"/><zone id="2" name="Zone 2" value="false"/></zonelist><tuners><tuner band="1" min="87" max="108" step="1"/></tuners></device></response>`;
    const info = parseAvrInfo(xml)!;
    expect(info.model).toBe("TX");
    expect(info.friendlyName).toContain("Living");
    expect(info.presets).toHaveLength(1);
    expect(info.netServices).toHaveLength(4);
    expect(info.netServices.map((service) => service.enabled)).toEqual([true, false, true, false]);
    expect(info.selectors[0].id).toBe("0a");
    expect(info.controls[0]).toMatchObject({ zone: 2, min: 0, max: 80, step: 1 });
    expect(info.controls[1].zone).toBeUndefined();
    expect(info.zones).toHaveLength(2);
    expect(info.tunerBands[0].step).toBe(1);
  });
});

describe("zone-agnostic processor branches", () => {
  function makeProcessor() {
    const driver = { updateEntityAttributes: () => true } as any;
    const state = {
      getSource: () => "net",
      getSubSource: () => "",
      getEntitiesBySource: () => [],
      getEntitiesByPhysicalAvrAndSource: () => [],
      setSource: () => true,
      setSubSource: () => true,
      getAudioFormat: () => "",
      setAudioFormat: () => true
    } as any;
    const eiscp = { raw: vi.fn().mockResolvedValue(undefined) } as any;
    return new ZoneAgnosticUpdateProcessor(driver, { avrs: [] }, eiscp, state) as any;
  }

  it("covers fallback zones, IFA defaults and song-info requests", async () => {
    const processor = makeProcessor();
    expect(processor.ensureNonEmpty(["zone2"], "main")).toEqual(["zone2"]);
    expect(processor.ensureNonEmpty([], "main")).toEqual(["main"]);
    expect(processor.isNowPlayingDisplay("Spotify / Track", "spotify")).toBe(true);
    expect(processor.isNowPlayingDisplay("Spotify", "spotify")).toBe(false);
    await processor.maybeRequestSongInfo("Unknown", 1);
    await processor.maybeRequestSongInfo("spotify", 0);
    await processor.maybeRequestSongInfo("spotify", 1);
    expect(processor.eiscpInstance.raw).toHaveBeenCalledTimes(3);
    await processor.handleIfa("M 1.2.3.4 main", "main", undefined, async () => undefined);
    await processor.handleIfa("M 1.2.3.4 main", "main", { audioInputValue: "PCM", audioOutputValue: "Stereo", listeningMode: "stereo" }, async () => undefined);
  });

  it("covers service lookup and TuneIn configuration branches", async () => {
    const processor = makeProcessor();
    expect(processor.getServiceAdapter("not-a-service")).toBeUndefined();
    expect(await processor.isTuneInFullMenu("invalid")).toBe(false);
    processor.clearTuneInBrowseMarkers("M 1.2.3.4 main");
    processor.resetZone("M 1.2.3.4 main");
    await processor.maybeUpdateImage("M 1.2.3.4 main");
  });
});

describe("eISCP command routing branches", () => {
  it("covers NSS, NSV, TIP validation and unmapped LMD values", async () => {
    const driver = new EiscpDriver({ model: "M", host: "1.2.3.4", netMenuDelay: 0, tuneinPresetPosition: 2 }) as any;
    const raw = vi.spyOn(driver, "raw").mockResolvedValue(undefined);
    expect(driver.extractNSSCode("NSS01")).toBe("NSS01");
    expect(driver.extractNSSCode("SLINSSxx")).toBeUndefined();
    expect(driver.extractNSSCode("NOPE")).toBeUndefined();
    expect(driver.isTIPCommand("TIP01")).toBe(true);
    expect(driver.isTIPCommand("TIPGG")).toBe(false);
    await driver.sendIscp("NSV0A0", "zone2");
    expect(raw).toHaveBeenCalledWith("NSV0A0");
    raw.mockClear();
    await driver.sendIscp("TIP01", "main");
    expect(raw).toHaveBeenCalledWith("NTCTOP");
    raw.mockClear();
    await driver.sendIscp("NSS01", "main");
    expect(raw).toHaveBeenCalledWith("NTCTOP");
    expect(driver.commandToIscp("listening-mode", "not-known", "main")).toBe("LMDnot-known");
    expect(driver.commandToIscp("listening-mode", "Stereo", "main")).toBe("LMD00");
  });

  it("covers waitForConnect success, close, error and timeout paths", async () => {
    const driver = new EiscpDriver({ model: "M", host: "1.2.3.4" }) as any;
    driver.isConnected = true;
    await expect(driver.waitForConnect()).resolves.toBeUndefined();
    driver.isConnected = false;
    const closePromise = driver.waitForConnect(1000);
    driver.emit("close");
    await expect(closePromise).rejects.toThrow("Connection closed");
    const errorPromise = driver.waitForConnect(1000);
    driver.emit("error", new Error("failed"));
    await expect(errorPromise).rejects.toThrow("failed");
    await expect(driver.waitForConnect(1)).rejects.toThrow("Timeout");
  });
});
