import { describe, it, expect, beforeEach, afterEach } from "vitest";

const entityId = "TX-RZ50 1.2.3.4 main";
const otherEntityId = "TX-RZ50 1.2.3.4 zone2";

describe("resolveAutoVolumeScale", () => {
  let store: any;
  let resolver: any;

  beforeEach(async () => {
    store = await import("../src/avrInfoStore.js");
    resolver = await import("../src/volumeScaleResolver.js");
  });

  afterEach(() => {
    store.resetAvrInfo(entityId);
  });

  const avr = (volumeScale: unknown, zone = "main") => ({ model: "TX-RZ50", ip: "1.2.3.4", port: 60128, zone, volumeScale }) as any;

  it("does nothing for a scale that was set manually", () => {
    expect(resolver.resolveAutoVolumeScale(avr(80), entityId)).toBeUndefined();
    expect(resolver.resolveAutoVolumeScale(avr(100), entityId)).toBeUndefined();
  });

  it("resolves 0-80 from the value the AVR reports", () => {
    const info = store.parseAvrInfo('<response status="ok"><device id="TX-RZ50"><zonelist><zone id="1" value="1" name="Main" volmax="80" /></zonelist></device></response>');
    store.setAvrInfo(entityId, info);

    const resolution = resolver.resolveAutoVolumeScale(avr("auto"), entityId);

    expect(resolution.scale).toBe(80);
    expect(resolution.reason).toContain("80");
  });

  it("resolves 0-100 from the value the AVR reports", () => {
    const info = store.parseAvrInfo('<response status="ok"><device id="TX-RZ50"><zonelist><zone id="1" value="1" name="Main" volmax="100" /></zonelist></device></response>');
    store.setAvrInfo(entityId, info);

    const resolution = resolver.resolveAutoVolumeScale(avr("auto"), entityId);

    expect(resolution.scale).toBe(100);
    expect(resolution.reason).toContain("100");
  });

  it("reads the volume scale of the requested zone", () => {
    const info = store.parseAvrInfo(
      '<response status="ok"><device id="TX-RZ50"><zonelist><zone id="1" value="1" name="Main" volmax="100" /><zone id="2" value="1" name="Zone2" volmax="80" /></zonelist></device></response>'
    );
    store.setAvrInfo(entityId, info);

    expect(resolver.resolveAutoVolumeScale(avr("auto", "main"), entityId).scale).toBe(100);
    expect(resolver.resolveAutoVolumeScale(avr("auto", "zone2"), otherEntityId).scale).toBe(80);
  });

  it("defaults to 0-100 when the AVR reports no volume scale", () => {
    const info = store.parseAvrInfo('<response status="ok"><device id="TX-RZ50"><zonelist><zone id="1" value="1" name="Main" /></zonelist></device></response>');
    store.setAvrInfo(entityId, info);

    const resolution = resolver.resolveAutoVolumeScale(avr("auto"), entityId);

    expect(resolution.scale).toBe(100);
    expect(resolution.reason).toContain("does not report");
  });

  it("defaults to 0-100 when the AVR reports an unsupported volume scale", () => {
    const info = store.parseAvrInfo('<response status="ok"><device id="TX-RZ50"><zonelist><zone id="1" value="1" name="Main" volmax="120" /></zonelist></device></response>');
    store.setAvrInfo(entityId, info);

    const resolution = resolver.resolveAutoVolumeScale(avr("auto"), entityId);

    expect(resolution.scale).toBe(100);
    expect(resolution.reason).toContain("120");
  });

  it("defaults to 0-100 when no AVR info was collected", () => {
    const resolution = resolver.resolveAutoVolumeScale(avr("auto"), entityId);

    expect(resolution.scale).toBe(100);
    expect(resolution.reason).toContain("does not report");
  });
});
