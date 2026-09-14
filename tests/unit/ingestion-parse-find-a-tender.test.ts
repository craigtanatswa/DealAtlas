import { describe, expect, it } from "vitest";

import { parseFindATenderRaw, parseOcdsRelease } from "@/ingestion/sources/find-a-tender/parse";
import { readFindATenderFixture } from "@/tests/helpers/ingestion-fixtures";

const NOW = new Date("2026-09-10T12:00:00.000Z");

describe("Find a Tender OCDS parse", () => {
  it("maps a normal tender onto a canonical candidate with lot, criteria and buyer", () => {
    const [candidate] = parseFindATenderRaw(readFindATenderFixture("normal.json"), NOW);
    expect(candidate.ocid).toBe("ocds-h6vhtk-fixture1");
    expect(candidate.sourceTitle).toContain("Managed IT support");
    expect(candidate.lots).toHaveLength(1);
    expect(candidate.requirements.length).toBeGreaterThan(0);
    expect(candidate.awardCriteria.length).toBeGreaterThan(0);
    expect(candidate.organizations[0]?.identifier?.scheme).toBe("GB-PPON");
    expect(candidate.sourceUrl).toContain("/Notice/000001-2026");
    expect(candidate.valueMaxExVat).toBe(250000);
  });

  it("keeps lots as first-class records", () => {
    const [candidate] = parseFindATenderRaw(
      readFindATenderFixture("multi-lot.json"),
      NOW,
    );
    expect(candidate.lots.map((lot) => lot.sourceLotId)).toEqual(["LOT-1", "LOT-2"]);
    expect(candidate.dealType).toBe("FRAMEWORK");
  });

  it("maps withdrawn notices and awards/contracts when present", () => {
    const [withdrawn] = parseFindATenderRaw(
      readFindATenderFixture("withdrawn.json"),
      NOW,
    );
    expect(withdrawn.status).toBe("WITHDRAWN");

    const [award] = parseFindATenderRaw(readFindATenderFixture("award.json"), NOW);
    expect(award.awards).toHaveLength(1);
    expect(award.contracts).toHaveLength(1);
    expect(award.awards[0]?.supplierPartyIds).toContain("GB-PPON-GGGG-4444-HHHH");
  });

  it("parses a partial planning record without inventing a value", () => {
    const [candidate] = parseFindATenderRaw(
      readFindATenderFixture("partial.json"),
      NOW,
    );
    expect(candidate.stage).toBe("PLANNING");
    expect(candidate.valueMaxExVat).toBeNull();
    expect(candidate.lots).toEqual([]);
  });

  it("rejects malformed releases", () => {
    expect(() => parseOcdsRelease(readFindATenderFixture("malformed.json"))).toThrow(
      /Find a Tender OCDS release/,
    );
  });
});
