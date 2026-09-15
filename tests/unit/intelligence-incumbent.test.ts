import { describe, expect, it } from "vitest";

import { classifyIncumbents } from "@/lib/intelligence/incumbents";
import { DEALATLAS_ANALYSIS_LABEL, SOURCE_RECORD_LABEL } from "@/lib/intelligence/types";

describe("incumbent classification", () => {
  it("treats recorded award suppliers as source incumbents", () => {
    const items = classifyIncumbents({
      dealId: "deal-1",
      dealTitle: "Current",
      awards: [
        {
          id: "award-1",
          dealId: "deal-1",
          dealTitle: "Current",
          awardIdentifier: "1",
          awardDate: "2026-01-01",
          awardValue: 100,
          currency: "GBP",
          numberOfTenders: 3,
          suppliers: [{ id: "sup-1", name: "Example Supplier Ltd", awardedValue: 100 }],
        },
      ],
      roles: [],
      organizations: new Map(),
      relatedPreviousAwards: [],
      insightIncumbentId: null,
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.organization.name).toBe("Example Supplier Ltd");
    expect(items[0]?.evidence.label).toBe(SOURCE_RECORD_LABEL);
  });

  it("labels related previous winners as DealAtlas analysis and invents none without evidence", () => {
    const organizations = new Map([
      ["sup-2", { id: "sup-2", name: "Prior Winner Ltd" }],
    ]);
    const inferred = classifyIncumbents({
      dealId: "deal-2",
      dealTitle: "Retender",
      awards: [],
      roles: [],
      organizations,
      relatedPreviousAwards: [
        {
          id: "award-old",
          dealId: "deal-old",
          dealTitle: "Prior",
          awardIdentifier: "1",
          awardDate: "2022-01-01",
          awardValue: 50,
          currency: "GBP",
          numberOfTenders: null,
          suppliers: [{ id: "sup-2", name: "Prior Winner Ltd", awardedValue: 50 }],
        },
      ],
      insightIncumbentId: null,
    });
    expect(inferred[0]?.evidence.label).toBe(DEALATLAS_ANALYSIS_LABEL);

    expect(
      classifyIncumbents({
        dealId: "deal-3",
        dealTitle: "Open tender",
        awards: [],
        roles: [],
        organizations,
        relatedPreviousAwards: [],
        insightIncumbentId: null,
      }),
    ).toEqual([]);
  });
});
