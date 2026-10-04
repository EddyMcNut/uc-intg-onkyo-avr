import { describe, it, expect } from "vitest";
import { eiscpCommands } from "../src/eiscp-commands.js";

type CommandDef = {
  name: string;
  description: string;
  values: Record<string, { name?: string | string[]; description: string }>;
};

const commands = eiscpCommands.commands as unknown as Record<string, CommandDef>;

describe("eiscpCommands opcodes renamed to their real spec titles", () => {
  // These three were copy-pasted from unrelated descriptors in the original table. The opcodes are
  // NAF = NET/USB Add Favorite List, NRF = Remove Favorite List and NRI = Receiver/AVR Information,
  // not anything to do with album art or reference info.
  it("names NAF and NRF as the favorite list commands", () => {
    expect(commands.NAF.name).toBe("net-usb-add-favorite-list");
    expect(commands.NRF.name).toBe("net-usb-remove-favorite-list");
  });

  it("names NRI as avr-info and documents its XML reply", () => {
    expect(commands.NRI.name).toBe("avr-info");
    expect(commands.NRI.values.xml.name).toBe("xml");
    expect(commands.NRI.values.xml.description).toMatch(/preset/i);
    expect(commands.NRI.values.QSTN.name).toBe("query");
  });

  it("documents NAF's real index argument", () => {
    expect(commands.NAF.values.xxxx.name).toBe("index");
    expect(commands.NAF.values.xxxx.description).toMatch(/0000-FFFF/);
  });

  // The album-art image types are not NAF's payload, but an earlier version of this table used them
  // and incoming frames may still decode that way, so they must keep resolving to a name.
  it("keeps the album art image type values on NAF alongside the index value", () => {
    expect(commands.NAF.values["0"].name).toBe("bmp");
    expect(commands.NAF.values["1"].name).toBe("jpeg");
    expect(commands.NAF.values["2"].name).toBe("url");
    expect(commands.NAF.values.n.name).toBe("no-image");
  });

  it("documents the real image types on NJA, where they belong", () => {
    const desc = commands.NJA.values["tp{xx}{xx}{xx}{xx}{xx}{xx}"].description;
    // 0:BMP, 1:JPEG, 2:URL, n:No Image
    expect(desc).toMatch(/2:URL/);
    expect(desc).toMatch(/n:No Image/);
  });
});
