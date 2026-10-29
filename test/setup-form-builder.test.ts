import { describe, expect, it } from "vitest";
import { SetupFormBuilder } from "../src/setupFormBuilder.js";

function values(overrides: Record<string, unknown> = {}): any {
  return {
    modelName: "TX-RZ50",
    ipVal: "192.168.1.2",
    portNum: 60128,
    queueThresholdValue: 100,
    albumArtURLValue: "album_art.cgi",
    listeningModePreferences: {},
    listeningModeNames: {},
    volumeScaleValue: "auto",
    useAvrReportedInputsValue: true,
    idInputSources: {},
    inputSources: [],
    inputSourceDiscoveryAvailable: false,
    volumeDisplayValue: "absolute",
    adjustVolumeDisplValue: true,
    entityNameStyleValue: "short",
    zoneCountValue: 1,
    createSensorsValue: true,
    createTunerPresetsValue: true,
    createRemoteEntityValue: true,
    createDiracSelectEntityValue: true,
    netMenuDelayValue: 500,
    tuneinPresetPositionValue: 1,
    tuneinMenuStyleValue: "mypresets",
    logLevelValue: "warn",
    ...overrides
  };
}

describe("SetupFormBuilder", () => {
  it("builds all setup forms and paginates selectable entries at ten rows", () => {
    const builder = new SetupFormBuilder();
    const base = values();
    expect(builder.buildManualConfigForm(base).settings.length).toBeGreaterThan(0);
    expect(builder.buildManualConfigPage1(base).title).toContain("1/3");
    expect(builder.buildManualConfigPage2(base).title).toContain("2/3");
    expect(builder.buildManualConfigPage3(base).title).toContain("3/4");
    expect(builder.buildManualConfigPage4(base).title).toContain("1/6");
    expect(builder.buildManualConfigPage5(base).title).toContain("2/6");
    expect(builder.buildManualConfigPage6(base).title).toContain("3/6");
    expect(builder.buildManualConfigPage7(base).title).toContain("4/6");
    expect(builder.buildManualConfigPage8(base).title).toContain("5/6");
    expect(builder.buildInitialSetupForm().settings.length).toBeGreaterThan(0);
    expect(builder.buildReconfigureForm().settings.length).toBeGreaterThan(0);
    expect(builder.getInputSourcePageCount(base)).toBeGreaterThan(0);

    const reported = Array.from({ length: 25 }, (_, index) => ({ id: `${index + 1}`, name: `Input ${index + 1}` }));
    const reportedValues = values({ inputSources: reported, inputSourceDiscoveryAvailable: true });
    expect(builder.getInputSourcePageCount(reportedValues)).toBe(3);
    const firstInputPage = builder.buildInputSourcePage(reportedValues, 1, 3);
    expect((firstInputPage.settings as unknown[]).length).toBe(11);
    expect((firstInputPage.settings as any[]).filter((setting) => setting.id.startsWith("ids_")).length).toBe(10);
    expect((firstInputPage.settings as any[]).find((setting) => setting.id.startsWith("ids_"))?.field.dropdown.value).toBe("discovered");
    expect((builder.buildInputSourcePage(reportedValues, 3, 3).settings as unknown[]).length).toBe(6);
  });
});
