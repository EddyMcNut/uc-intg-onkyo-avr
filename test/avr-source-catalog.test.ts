import { describe, it, expect, beforeEach } from "vitest";
import { getAvrSourceCatalog, findAvrSourceId } from "../src/avrSourceCatalog.js";
import { sharedAvrContexts } from "../src/avrContext.js";
import { parseAvrInfo } from "../src/avrInfoStore.js";
import { resetAvrInfo, setAvrInfo } from "./helpers/avrInfo.js";

const ENTITY = "TX-RZ50 1.2.3.4 main";
const PHYSICAL = "TX-RZ50 1.2.3.4";

describe("avrSourceCatalog", () => {
  beforeEach(() => {
    sharedAvrContexts.clear();
    resetAvrInfo(ENTITY);
  });

  it("provides normalized sources and reports complete NRI readiness", () => {
    sharedAvrContexts.get(PHYSICAL).inputs.set([
      { id: "0e", name: "TuneIn Radio" },
      { id: "2b", name: "NET" }
    ]);
    setAvrInfo(
      ENTITY,
      parseAvrInfo(
        '<response><device><selectorlist><selector id="2b" name="NET" /></selectorlist><netservicelist><netservice id="0e" name="TuneIn Radio" value="1" enable="1" /></netservicelist></device></response>'
      )
    );

    expect(getAvrSourceCatalog(ENTITY)).toEqual({
      sources: [
        { id: "2b", name: "NET" },
        { id: "0e", name: "TuneIn Radio" }
      ],
      complete: true
    });
    expect(findAvrSourceId(PHYSICAL, "tunein radio")).toBe("0e");
  });

  it("does not claim complete data when a list is missing", () => {
    setAvrInfo(ENTITY, parseAvrInfo('<response><device><selectorlist><selector id="2b" name="NET" /></selectorlist></device></response>'));
    expect(getAvrSourceCatalog(ENTITY).complete).toBe(false);
    expect(getAvrSourceCatalog("invalid").sources).toEqual([]);
  });
});
