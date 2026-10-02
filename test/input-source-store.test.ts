import { describe, it, expect, beforeEach } from "vitest";
import { clearAllAvrInputs, clearAvrInputs, findAvrInputId, findAvrInputName, getAvrInputs, hasAvrInputs, normalizeAvrInputs, setAvrInputs, type AvrInput } from "../src/inputSourceStore.js";

const AVR = "TX-RZ50 192.168.2.103";
const REPORTED: AvrInput[] = [
  { id: "10", name: "BD/DVD" },
  { id: "01", name: "CBL/SAT" },
  { id: "2b", name: "NET" },
  { id: "33", name: "DAB" }
];

describe("inputSourceStore", () => {
  beforeEach(() => clearAllAvrInputs());

  it("stores the inputs sorted by name, in the AVR's own spelling", () => {
    setAvrInputs(AVR, REPORTED);

    expect(getAvrInputs(AVR).map((input) => input.name)).toEqual(["BD/DVD", "CBL/SAT", "DAB", "NET"]);
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
    setAvrInputs(AVR, [
      { id: "10", name: "BD/DVD" },
      { id: "80", name: "Source" }
    ]);
    // The placeholder never enters the list, so storing it again changes nothing.
    expect(setAvrInputs(AVR, [{ id: "10", name: "BD/DVD" }])).toBe(false);
    expect(getAvrInputs(AVR)).toEqual([{ id: "10", name: "BD/DVD" }]);
  });

  it("normalizes the id to lower case hex, as used by SLI", () => {
    setAvrInputs(AVR, [{ id: "2E", name: "BLUETOOTH" }]);

    expect(findAvrInputId(AVR, "bluetooth")).toBe("2e");
    expect(findAvrInputId(AVR, "Bluetooth")).toBe("2e");
  });

  it("looks up inputs by name and by id", () => {
    setAvrInputs(AVR, REPORTED);

    expect(findAvrInputId(AVR, "BD/DVD")).toBe("10");
    expect(findAvrInputName(AVR, "33")).toBe("DAB");
    expect(findAvrInputName(AVR, "ff")).toBeUndefined();
    expect(findAvrInputId(AVR, "not an input")).toBeUndefined();
  });

  it("reports whether anything was collected", () => {
    expect(hasAvrInputs(AVR)).toBe(false);
    setAvrInputs(AVR, REPORTED);
    expect(hasAvrInputs(AVR)).toBe(true);
  });

  it("reports a change only when the effective list differs", () => {
    expect(setAvrInputs(AVR, REPORTED)).toBe(true);
    expect(setAvrInputs(AVR, [...REPORTED].reverse())).toBe(false);
    expect(setAvrInputs(AVR, REPORTED.slice(0, 2))).toBe(true);
  });

  it("forgets the inputs of a single AVR, and an empty collection drops them again", () => {
    setAvrInputs(AVR, REPORTED);
    setAvrInputs(AVR, []);
    expect(hasAvrInputs(AVR)).toBe(false);

    setAvrInputs(AVR, REPORTED);
    clearAvrInputs(AVR);
    expect(getAvrInputs(AVR)).toEqual([]);
  });

  it("keeps the inputs of other AVRs", () => {
    setAvrInputs(AVR, REPORTED);
    setAvrInputs("TX-NR860 192.168.2.104", [{ id: "01", name: "CBL/SAT" }]);

    clearAvrInputs(AVR);

    expect(getAvrInputs("TX-NR860 192.168.2.104")).toEqual([{ id: "01", name: "CBL/SAT" }]);
  });
});
