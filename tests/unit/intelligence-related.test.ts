import { describe, expect, it } from "vitest";

import { relateProcurements } from "@/lib/intelligence/related";
import { DEALATLAS_ANALYSIS_LABEL, SOURCE_RECORD_LABEL } from "@/lib/intelligence/types";
import type { IntelligenceDealRef } from "@/lib/intelligence/types";

function deal(
  id: string,
  extra: Partial<IntelligenceDealRef> & { buyerOrganizationId?: string | null } = {},
) {
  return {
    id,
    sourceTitle: extra.sourceTitle ?? id,
    status: extra.status ?? "AWARDED",
    stage: extra.stage ?? "CONTRACT",
    dealType: extra.dealType ?? "AWARD",
    mainCategory: extra.mainCategory ?? "Facilities",
    buyerSector: extra.buyerSector ?? "PUBLIC",
    currency: "GBP",
    valueMinExVat: null,
    valueMaxExVat: null,
    firstPublishedAt: extra.firstPublishedAt ?? null,
    contractStartDate: extra.contractStartDate ?? null,
    contractEndDate: extra.contractEndDate ?? null,
    extensionEndDate: extra.extensionEndDate ?? null,
    nextProcurementDate: extra.nextProcurementDate ?? null,
    estimatedRenewalDate: extra.estimatedRenewalDate ?? null,
    awardDecisionDate: extra.awardDecisionDate ?? null,
    buyerOrganizationId: extra.buyerOrganizationId ?? "buyer-1",
  };
}

describe("related procurements", () => {
  it("keeps source related-process links", () => {
    const current = deal("current", {
      contractStartDate: "2026-01-01",
      buyerOrganizationId: "buyer-1",
    });
    const previous = deal("previous", {
      contractEndDate: "2025-12-01",
      buyerOrganizationId: "buyer-1",
    });
    const related = relateProcurements({
      currentDealId: "current",
      current,
      buyerId: "buyer-1",
      others: [previous],
      links: [
        {
          dealId: "current",
          relatedDealId: "previous",
          relationshipType: "related_process",
          confidence: 1,
        },
      ],
    });

    expect(related).toHaveLength(1);
    expect(related[0]?.evidence.label).toBe(SOURCE_RECORD_LABEL);
    expect(related[0]?.direction).toBe("previous");
  });

  it("infers sequenced same-buyer category deals as DealAtlas analysis", () => {
    const current = deal("current", {
      contractStartDate: "2026-04-01",
      mainCategory: "IT",
    });
    const previous = deal("previous", {
      contractEndDate: "2026-03-01",
      mainCategory: "IT",
    });
    const related = relateProcurements({
      currentDealId: "current",
      current,
      buyerId: "buyer-1",
      others: [previous],
      links: [],
    });
    expect(related).toHaveLength(1);
    expect(related[0]?.evidence.label).toBe(DEALATLAS_ANALYSIS_LABEL);
    expect(related[0]?.direction).toBe("previous");
  });

  it("does not invent links across buyers or without dates/category", () => {
    const current = deal("current", {
      mainCategory: "IT",
      buyerOrganizationId: "buyer-1",
    });
    const otherBuyer = deal("other", {
      mainCategory: "IT",
      buyerOrganizationId: "buyer-2",
      contractEndDate: "2025-01-01",
    });
    const sameBuyerNoCategory = deal("uncat", {
      mainCategory: null,
      buyerOrganizationId: "buyer-1",
      contractEndDate: "2025-01-01",
    });

    expect(
      relateProcurements({
        currentDealId: "current",
        current,
        buyerId: "buyer-1",
        others: [otherBuyer, sameBuyerNoCategory],
        links: [],
      }),
    ).toEqual([]);
  });
});
