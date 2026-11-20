import { describe, expect, it } from "vitest";
import { getMenuBrowseService, xmlBrowseSelectCommand } from "../src/menuBrowseServices.js";
import { tidalStore } from "../src/tidalBrowserStore.js";
import { deezerStore } from "../src/deezerBrowserStore.js";
import { musicServerStore } from "../src/musicServerBrowserStore.js";
import { hasServiceCapability } from "../src/networkServices.js";

describe("menuBrowseServices registry", () => {
  it.each([
    ["tidal", "Tidal", tidalStore, "NSV1B0"],
    ["deezer", "Deezer", deezerStore, "NSV120"],
    ["music-server", "Music Server", musicServerStore, "NSV000"]
  ] as const)("describes %s", (id, label, store, selectSource) => {
    const service = getMenuBrowseService(id);
    expect(service).toMatchObject({ id, label, modernSelectSourceCommand: selectSource });
    expect(service?.store).toBe(store);
    expect(hasServiceCapability(id, "browse")).toBe(true);
  });

  it("has no entry for TuneIn, other services or unknown ids", () => {
    for (const id of ["tunein", "spotify", "unknown", "toString", ""]) expect(getMenuBrowseService(id)).toBeUndefined();
  });

  it("builds the NLAI select command with a zero-based index and a minimum layer of 1", () => {
    expect(xmlBrowseSelectCommand(1, undefined)).toBe("NLAI010000----");
    expect(xmlBrowseSelectCommand(5, 2)).toBe("NLAI020004----");
    expect(xmlBrowseSelectCommand(300, 0x1b)).toBe("NLAI1B012B----");
    expect(xmlBrowseSelectCommand(0, 0)).toBe("NLAI010000----");
  });
});
