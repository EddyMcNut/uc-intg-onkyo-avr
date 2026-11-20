import { describe, it, expect, beforeEach } from "vitest";
import { normalizeAvrInputs, type AvrInput } from "../src/inputSourceStore.js";
import { AvrContextRegistry } from "../src/avrContext.js";

const registry = new AvrContextRegistry();

const AVR = "TX-RZ50 192.168.2.103";
const REPORTED: AvrInput[] = [
  { id: "10", name: "BD/DVD" },
  { id: "01", name: "CBL/SAT" },
  { id: "2b", name: "NET" },
  { id: "33", name: "DAB" }
];

describe("inputSourceStore", () => {
  beforeEach(() => registry.clear());

  it("stores the inputs sorted by name, in the AVR's own spelling", () => {
    registry.get(AVR).inputs.set(REPORTED);

    expect(
      registry
        .get(AVR)
        .inputs.list()
        .map((input) => input.name)
    ).toEqual(["BD/DVD", "CBL/SAT", "DAB", "NET"]);
  });

  it("drops entries without an id or a name and duplicates of id or name", () => {
    const inputs = normalizeAvrInputs([
      { id: "", name: "Nothing" },
      { id: "10", name: "  " },
      { id: "10", name: "BD/DVD" },
      { id: "2b", name: "NET" },
      { id: "2c", name: "net" }
    ]);

    expect(inputs).toEqual([
      { id: "10", name: "BD/DVD" },
      { id: "2b", name: "NET" }
    ]);
  });

  it("drops the placeholder entry some AVRs report as 'Source', whatever case it uses", () => {
    const inputs = normalizeAvrInputs([
      { id: "80", name: "Source" },
      { id: "81", name: "SOURCE" },
      { id: "82", name: " source " },
      // A real input that only starts with something else is kept, including names that merely
      // contain the word, e.g. "TV Source".
      { id: "83", name: "Source TV" },
      { id: "10", name: "BD/DVD" }
    ]);

    expect(inputs).toEqual(
      [
        { id: "83", name: "Source TV" },
        { id: "10", name: "BD/DVD" }
      ].sort((a, b) => a.name.localeCompare(b.name))
    );
  });

  it("reports a change when only the placeholder entry disappears", () => {
    registry.get(AVR).inputs.set([
      { id: "10", name: "BD/DVD" },
      { id: "80", name: "Source" }
    ]);
    // The placeholder never enters the list, so storing it again changes nothing.
    expect(registry.get(AVR).inputs.set([{ id: "10", name: "BD/DVD" }])).toBe(false);
    expect(registry.get(AVR).inputs.list()).toEqual([{ id: "10", name: "BD/DVD" }]);
  });

  it("normalizes the id to lower case hex, as used by SLI", () => {
    registry.get(AVR).inputs.set([{ id: "2E", name: "BLUETOOTH" }]);

    expect(registry.get(AVR).inputs.findId("bluetooth")).toBe("2e");
    expect(registry.get(AVR).inputs.findId("Bluetooth")).toBe("2e");
  });

  it("looks up inputs by name and by id", () => {
    registry.get(AVR).inputs.set(REPORTED);

    expect(registry.get(AVR).inputs.findId("BD/DVD")).toBe("10");
    expect(registry.get(AVR).inputs.findName("33")).toBe("DAB");
    expect(registry.get(AVR).inputs.findName("ff")).toBeUndefined();
    expect(registry.get(AVR).inputs.findId("not an input")).toBeUndefined();
  });

  it("reports whether anything was collected", () => {
    expect(registry.get(AVR).inputs.has()).toBe(false);
    registry.get(AVR).inputs.set(REPORTED);
    expect(registry.get(AVR).inputs.has()).toBe(true);
  });

  it("reports a change only when the effective list differs", () => {
    expect(registry.get(AVR).inputs.set(REPORTED)).toBe(true);
    expect(registry.get(AVR).inputs.set([...REPORTED].reverse())).toBe(false);
    expect(registry.get(AVR).inputs.set(REPORTED.slice(0, 2))).toBe(true);
  });

  it("forgets the inputs of a single AVR, and an empty collection drops them again", () => {
    registry.get(AVR).inputs.set(REPORTED);
    registry.get(AVR).inputs.set([]);
    expect(registry.get(AVR).inputs.has()).toBe(false);

    registry.get(AVR).inputs.set(REPORTED);
    registry.get(AVR).inputs.clear();
    expect(registry.get(AVR).inputs.list()).toEqual([]);
  });

  it("keeps the inputs of other AVRs", () => {
    registry.get(AVR).inputs.set(REPORTED);
    registry.get("TX-NR860 192.168.2.104").inputs.set([{ id: "01", name: "CBL/SAT" }]);

    registry.get(AVR).inputs.clear();

    expect(registry.get("TX-NR860 192.168.2.104").inputs.list()).toEqual([{ id: "01", name: "CBL/SAT" }]);
  });
});
