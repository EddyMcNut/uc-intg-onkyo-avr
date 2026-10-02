import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const here = dirname(fileURLToPath(import.meta.url));

// Real NRIQSTN response captured from a TX-RZ50, with serial/MAC/IP redacted.
const realResponseXml = readFileSync(resolve(here, "fixtures/nri-response.xml"), "utf-8");

describe("avrInfoStore", () => {
  let store: any;
  const validEntityId = "TX-RZ50 1.2.3.4 main";
  const otherZoneEntityId = "TX-RZ50 1.2.3.4 zone2";
  const invalidEntityId = "bad";

  beforeEach(async () => {
    store = await import("../src/avrInfoStore.js");
  });

  afterEach(() => {
    store.resetAvrInfo(validEntityId);
    vi.resetModules();
  });

  describe("parseAvrInfo", () => {
    it("parses the real NRIQSTN payload", () => {
      const info = store.parseAvrInfo(realResponseXml);
      expect(info).not.toBeNull();
      expect(info.model).toBe("TX-RZ50");
      expect(info.firmwareVersion).toBe("R145-1119-1284-0034-0000");
      expect(info.presetCount).toBe(40);
      expect(info.presets).toHaveLength(40);
    });

    it("returns the DAB presets in slot order with trimmed names", () => {
      const info = store.parseAvrInfo(realResponseXml);
      const dabPresets = info.presets.filter((p: any) => p.band === store.PRESET_BAND_DAB);

      // The AVR stores slots as two-digit hex ids, so id "01".."19" is 25 slots.
      expect(dabPresets).toHaveLength(25);
      expect(dabPresets[0]).toEqual({ slot: 1, name: "R10 80s", band: "2", freq: "0" });
      expect(dabPresets[2].name).toBe("QTop40");
      expect(dabPresets[24]).toEqual({ slot: 25, name: "R10 6070", band: "2", freq: "0" });

      // Slot numbers must be strictly ascending so they map to the AVR's own numbering.
      const slots = dabPresets.map((p: any) => p.slot);
      expect([...slots].sort((a: number, b: number) => a - b)).toEqual(slots);
    });

    it("separates FM presets from DAB presets", () => {
      const info = store.parseAvrInfo(realResponseXml);
      const tuner = info.presets.filter((p: any) => p.band === store.PRESET_BAND_FM);

      expect(tuner).toHaveLength(1);
      expect(tuner[0]).toEqual({ slot: 40, name: "STRKSTAD", band: "1", freq: "107.20" });
    });

    it("treats empty slots as band 0 with an empty name", () => {
      const info = store.parseAvrInfo(realResponseXml);
      const empty = info.presets.filter((p: any) => p.band === store.PRESET_BAND_EMPTY);

      expect(empty).toHaveLength(14);
      expect(empty.every((p: any) => p.name === "")).toBe(true);
    });

    it("parses net services, zones and tuner bands", () => {
      const info = store.parseAvrInfo(realResponseXml);

      expect(info.netServices.length).toBeGreaterThan(0);
      expect(info.netServices.find((s: any) => s.id === "0e")?.name).toBe("TuneIn Radio");

      expect(info.zones).toHaveLength(4);
      expect(info.zones[0]).toEqual({ id: 1, name: "Main", enabled: true, volMax: 100 });
      // Zone 4 is disabled on this AVR and reports no usable volume maximum.
      expect(info.zones[3]).toEqual({ id: 4, name: "Zone4", enabled: false, volMax: 0 });

      expect(info.tunerBands).toEqual([{ band: "FM", min: 87500, max: 108000, step: 50 }]);
    });

    it("flags which net services need an account", () => {
      const info = store.parseAvrInfo(realResponseXml);

      // The AVR sends placeholder credentials for services it has no login for, and omits both
      // attributes for services that need no account at all.
      expect(info.netServices.find((s: any) => s.name === "TuneIn Radio")?.hasAccount).toBe(true);
      expect(info.netServices.find((s: any) => s.name === "Spotify")?.hasAccount).toBe(false);
      expect(info.netServices.find((s: any) => s.name === "AirPlay")?.hasAccount).toBe(false);
    });

    it("parses the available inputs", () => {
      const info = store.parseAvrInfo(realResponseXml);

      expect(info.selectors).toHaveLength(14);
      expect(info.selectors.find((s: any) => s.id === "33")).toEqual({ id: "33", name: "DAB" });
      expect(info.selectors.find((s: any) => s.id === "24")).toEqual({ id: "24", name: "FM" });
      expect(info.selectors.find((s: any) => s.id === "2b")).toEqual({ id: "2b", name: "NET" });
    });

    it("parses capability flags and control ranges, keeping them distinct from live state", () => {
      const info = store.parseAvrInfo(realResponseXml);

      expect(info.controls.length).toBe(70);

      // Flag-style controls carry availability, not a current value.
      expect(info.controls.find((c: any) => c.id === "DolbyAtmos")?.value).toBe("1");
      expect(info.controls.find((c: any) => c.id === "MCACC")?.value).toBe("0");

      // Range-style controls carry their limits.
      expect(info.controls.find((c: any) => c.id === "Vocal/Dialog")).toMatchObject({ value: "1", min: 0, max: 5, step: 1 });
      expect(info.controls.find((c: any) => c.id === "Center Level")).toMatchObject({ value: "1", zone: 1, min: -12, max: 12 });

      // Listening-mode capability entries carry the code and remote position.
      expect(info.controls.find((c: any) => c.id === "LMD Movie/TV")).toMatchObject({ value: "1", code: "MOVIE", position: "1" });
    });

    it("handles a payload with embedded newlines", () => {
      const info = store.parseAvrInfo(realResponseXml.replace(/(<\/device>)/, "\n$1\r\n"));
      expect(info.model).toBe("TX-RZ50");
      expect(info.presets).toHaveLength(40);
    });

    it("unescapes XML entities in attribute values", () => {
      const xml =
        '<?xml version="1.0"?><response status="ok"><device id="X"><model>M</model><friendlyname></friendlyname><firmwareversion>v</firmwareversion><presetlist count="1"><preset id="01" band="2" freq="0" name="Rock &amp; Roll &lt;FM&gt;" /></presetlist></device></response>';
      const info = store.parseAvrInfo(xml);
      expect(info.presets[0].name).toBe("Rock & Roll <FM>");
    });

    it("reads two-digit hex ids beyond 9", () => {
      const xml =
        '<?xml version="1.0"?><response status="ok"><device id="X"><model>M</model><friendlyname></friendlyname><firmwareversion>v</firmwareversion><presetlist count="1"><preset id="1a" band="1" freq="88.10" name="Radio" /></presetlist></device></response>';
      const info = store.parseAvrInfo(xml);
      expect(info.presets[0].slot).toBe(26);
    });

    it("returns null for payloads that are not AVR information", () => {
      expect(store.parseAvrInfo("")).toBeNull();
      expect(store.parseAvrInfo("not xml at all")).toBeNull();
      expect(store.parseAvrInfo('<?xml version="1.0"?><response status="ok"><popup/></response>')).toBeNull();
    });

    it("attributes elements to the list they appear in, whichever order they come", () => {
      // The real payload lists zones, then presets, then controls, so section tracking has to
      // follow document order rather than assume a fixed layout.
      const xml =
        '<?xml version="1.0"?><response status="ok"><device id="X"><model>M</model><friendlyname></friendlyname><firmwareversion>v</firmwareversion><controllist count="1"><control id="TUNER Control" value="1" /></controllist><presetlist count="1"><preset id="01" band="2" freq="0" name="A" /></presetlist></device></response>';
      const info = store.parseAvrInfo(xml);
      expect(info.presets).toHaveLength(1);
      expect(info.controls).toHaveLength(1);
      expect(info.controls[0].id).toBe("TUNER Control");
    });

    it("does not leak presets or controls out of their list", () => {
      // A <control> appearing after the preset list must not be collected as a preset, and a
      // <preset> must not be collected as a control.
      const xml =
        '<?xml version="1.0"?><response status="ok"><device id="X"><model>M</model><friendlyname></friendlyname><firmwareversion>v</firmwareversion><presetlist count="1"><preset id="01" band="2" freq="0" name="A" /></presetlist><controllist count="1"><preset id="02" band="2" freq="0" name="B" /><control id="TUNER Control" value="1" /></controllist></device></response>';
      const info = store.parseAvrInfo(xml);
      expect(info.presets).toHaveLength(1);
      expect(info.presets[0].name).toBe("A");
      expect(info.controls).toHaveLength(1);
      expect(info.controls[0].id).toBe("TUNER Control");
    });
  });

  describe("store accessors", () => {
    beforeEach(() => {
      store.setAvrInfo(validEntityId, store.parseAvrInfo(realResponseXml));
    });

    it("stores and reads back per physical AVR, shared across zones", () => {
      expect(store.getAvrInfo(validEntityId)).not.toBeNull();
      // The receiver info is physical, so a different zone of the same AVR sees the same snapshot.
      expect(store.getAvrInfo(otherZoneEntityId)).toBe(store.getAvrInfo(validEntityId));
    });

    it("returns null for an invalid entityId", () => {
      expect(store.getAvrInfo(invalidEntityId)).toBeNull();
      expect(store.listDabPresets(invalidEntityId)).toEqual([]);
    });

    it("listDabPresets returns only populated DAB slots", () => {
      const presets = store.listDabPresets(validEntityId);
      expect(presets).toHaveLength(25);
      expect(presets.every((p: any) => p.band === store.PRESET_BAND_DAB && p.name !== "")).toBe(true);
      expect(presets.map((p: any) => p.slot)).toEqual([...presets.map((p: any) => p.slot)].sort((a: number, b: number) => a - b));
    });

    it("listFmPresets returns only FM slots", () => {
      const presets = store.listFmPresets(validEntityId);
      expect(presets).toHaveLength(1);
      expect(presets[0].band).toBe(store.PRESET_BAND_FM);
    });

    it("exposes the inputs and services the AVR actually reports", () => {
      expect(store.listSelectors(validEntityId).map((s: any) => s.name)).toContain("DAB");

      // The AVR's own spelling, which differs from the integration's internal service ids.
      const names = store.listNetServiceNames(validEntityId);
      expect(names).toContain("TuneIn Radio");
      expect(names).toContain("TIDAL");
      expect(names).toContain("Amazon Music");
    });

    it("getControlValue reads a control flag by id", () => {
      expect(store.getControlValue(validEntityId, "DolbyAtmos")).toBe("1");
      expect(store.getControlValue(validEntityId, "NoSuchControl")).toBeUndefined();
    });

    it("getAvrVolumeScale reads the maximum display volume of the requested zone", () => {
      expect(store.getAvrVolumeScale(validEntityId, "main")).toBe(100);
      expect(store.getAvrVolumeScale(validEntityId, "zone2")).toBe(100);
    });

    it("getAvrVolumeScale is undefined when the AVR reports no volume scale", () => {
      const info = store.parseAvrInfo(realResponseXml);
      info.zones = [{ id: 1, name: "Main", enabled: true }];
      store.setAvrInfo(validEntityId, info);

      expect(store.getAvrVolumeScale(validEntityId, "main")).toBeUndefined();
    });

    it("getAvrVolumeScale falls back to another zone when the requested zone reports none", () => {
      const info = store.parseAvrInfo(realResponseXml);
      // A zone the AVR has switched off reports 0 rather than its volume range.
      info.zones = [
        { id: 4, name: "Zone4", enabled: false, volMax: 0 },
        { id: 1, name: "Main", enabled: true, volMax: 80 }
      ];
      store.setAvrInfo(validEntityId, info);

      expect(store.getAvrVolumeScale(validEntityId, "zone4")).toBe(80);
      expect(store.getAvrVolumeScale(validEntityId, "unknownzone")).toBe(80);
    });

    it("getAvrVolumeScale is undefined when nothing was collected", () => {
      store.resetAvrInfo(validEntityId);
      expect(store.getAvrVolumeScale(validEntityId, "main")).toBeUndefined();
    });

    it("resetAvrInfo clears the snapshot", () => {
      store.resetAvrInfo(validEntityId);
      expect(store.getAvrInfo(validEntityId)).toBeNull();
      expect(store.listDabPresets(validEntityId)).toEqual([]);
    });
  });

  describe("isAvrInfoStale", () => {
    it("is true when nothing was collected yet", () => {
      expect(store.isAvrInfoStale(validEntityId)).toBe(true);
    });

    it("is false right after collecting", () => {
      store.setAvrInfo(validEntityId, store.parseAvrInfo(realResponseXml));
      expect(store.isAvrInfoStale(validEntityId)).toBe(false);
    });

    it("is true again once the snapshot exceeds the TTL", () => {
      const info = store.parseAvrInfo(realResponseXml);
      info.collectedAt = Date.now() - store.AVR_INFO_TTL - 1000;
      store.setAvrInfo(validEntityId, info);
      expect(store.isAvrInfoStale(validEntityId)).toBe(true);
    });
  });
});
