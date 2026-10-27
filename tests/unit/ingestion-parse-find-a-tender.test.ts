import { describe, expect, it } from "vitest";

import { createFindATenderAdapter } from "@/ingestion/sources/find-a-tender/adapter";
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
    expect(candidate.status).toBe("UPCOMING");
    expect(candidate.valueMaxExVat).toBeNull();
    expect(candidate.lots).toEqual([]);
  });

  it("accepts selection criteria when appliesTo is a list and numbers is one object", () => {
    const [candidate] = parseFindATenderRaw(
      readFindATenderFixture("selection-criteria.json"),
      NOW,
    );
    expect(candidate.sourceTitle).toContain("Sprinkler");
    expect(candidate.requirements.map((item) => item.name)).toContain("suitability");
    expect(candidate.awardCriteria.map((item) => item.name)).toContain("Price");
  });

  it("follows links.next inside the same window and filters stages by release tag", async () => {
    const urls: string[] = [];
    const adapter = createFindATenderAdapter({
      now: () => NOW,
      http: {
        async getJson(url) {
          urls.push(url);
          if (!url.includes("cursor=")) {
            return {
              url,
              status: 200,
              contentType: "application/json",
              body: {
                releases: [
                  { id: "000001-2026", ocid: "ocds-h6vhtk-fixture1", tag: ["tender"] },
                  { id: "000003-2026", ocid: "ocds-h6vhtk-fixture3", tag: ["award", "contract"] },
                ],
                links: {
                  next: "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=100&updatedFrom=2026-09-03T12:00:00&updatedTo=2026-09-10T12:00:00&stages=tender&cursor=dXBkYXRlZEZyb209MjAyNi0wOS0wM1QxMjowMDowMHx1cGRhdGVkVG89MjAyNi0wOS0xMFQxMjowMDowMHxuZXh0Q3Vyc29yPTE=",
                },
              },
              rawText: "{}",
            };
          }
          return {
            url,
            status: 200,
            contentType: "application/json",
            body: { releases: [{ id: "000002-2026", ocid: "ocds-h6vhtk-fixture2", tag: ["planning", "tender"] }] },
            rawText: "{}",
          };
        },
      },
    });
    const first = await adapter.discover(undefined, {
      limit: 100,
      updatedFrom: "2026-09-03T12:00:00",
      updatedTo: "2026-09-10T12:00:00",
      stages: "tender",
    });
    const second = await adapter.discover(first.nextCursor, {
      limit: 100,
      updatedFrom: "2026-09-03T12:00:00",
      updatedTo: "2026-09-10T12:00:00",
      stages: "tender",
    });
    expect(first.items).toHaveLength(1);
    expect(second.items[0]?.externalRecordId).toBe("000002-2026");
    expect(first.items.map((item) => item.externalRecordId)).toEqual(["000001-2026"]);
    expect(urls.some((url) => url.includes("stages="))).toBe(false);
    expect(urls[1]).toContain("cursor=");
    expect(urls[1]).toContain("updatedFrom=2026-09-03T12%3A00%3A00");
  });

  it("rejects malformed releases", () => {
    expect(() => parseOcdsRelease(readFindATenderFixture("malformed.json"))).toThrow(
      /Find a Tender OCDS release/,
    );
  });
});
