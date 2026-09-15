import { describe, expect, it } from "vitest";

import {
  inferBidComplexity,
  inferCompetitionLevel,
  inferSmeSuitability,
} from "@/ingestion/intelligence/extract";
import type { IntelligenceContext } from "@/ingestion/intelligence/types";
import { findATenderSourceRecord } from "@/ingestion/sources/find-a-tender/seed";
import type { DealRecord } from "@/ingestion/store/types";

function deal(overrides: Partial<DealRecord> = {}): DealRecord {
  return {
    id: "deal-1",
    primarySourceId: "source-fat",
    externalPrimaryId: "000001-2026",
    ocid: "ocds-h6vhtk-fixture1",
    reference: "REF-FIXTURE-1",
    sourceTitle: "Managed IT support for civic offices",
    sourceDescription: "Provision of managed IT support.",
    buyerOrganizationId: "org-1",
    dealType: "PUBLIC_TENDER",
    buyerSector: "PUBLIC",
    stage: "LIVE",
    status: "OPEN",
    mainCategory: "Technology",
    procurementMethod: "open",
    specialRegime: null,
    currency: "GBP",
    valueMinExVat: 250000,
    valueMaxExVat: 250000,
    exactValueText: "£250,000",
    exactLocationText: "Manchester",
    enquiryDeadline: null,
    submissionDeadline: "2026-10-01T12:00:00.000Z",
    awardDecisionDate: null,
    contractStartDate: "2027-01-01",
    contractEndDate: "2029-01-01",
    extensionEndDate: null,
    nextProcurementDate: null,
    estimatedRenewalDate: null,
    smeSuitable: true,
    vcseSuitable: false,
    sourceUrl: "https://www.find-tender.service.gov.uk/Notice/000001-2026",
    applicationUrl: null,
    firstPublishedAt: "2026-09-01T09:00:00.000Z",
    latestSourceAt: "2026-09-01T09:00:00.000Z",
    firstDiscoveredAt: "2026-09-10T12:00:00.000Z",
    lastVerifiedAt: "2026-09-10T12:00:00.000Z",
    dataQualityScore: 80,
    sourceCount: 1,
    normalizedTitle: "managed it support for civic offices",
    ...overrides,
  };
}

function context(overrides: Partial<IntelligenceContext> = {}): IntelligenceContext {
  return {
    deal: deal(),
    source: findATenderSourceRecord({ id: "source-fat" }),
    buyer: null,
    buyerAliases: [],
    lots: [],
    requirements: [],
    awardCriteria: [],
    awards: [],
    documentsCount: 0,
    now: new Date("2026-09-10T12:00:00.000Z"),
    noticeIdentifiers: ["000001-2026"],
    ...overrides,
  };
}

describe("paid intelligence extraction", () => {
  it("derives SME, complexity and competition with evidence", () => {
    const sme = inferSmeSuitability(context());
    expect(sme.level).toBe("HIGH");
    expect(sme.evidence.some((item) => item.field === "sme_suitable")).toBe(true);

    const complexity = inferBidComplexity(
      context({
        lots: [
          {
            id: "1",
            dealId: "deal-1",
            sourceLotId: "1",
            lotNumber: "1",
            sourceTitle: "A",
            sourceDescription: null,
            status: "OPEN",
            currency: "GBP",
            valueMin: 1,
            valueMax: 1,
            exactLocationText: null,
            submissionDeadline: null,
            contractStartDate: null,
            contractEndDate: null,
            extensionEndDate: null,
            smeSuitable: true,
            vcseSuitable: null,
          },
          {
            id: "2",
            dealId: "deal-1",
            sourceLotId: "2",
            lotNumber: "2",
            sourceTitle: "B",
            sourceDescription: null,
            status: "OPEN",
            currency: "GBP",
            valueMin: 1,
            valueMax: 1,
            exactLocationText: null,
            submissionDeadline: null,
            contractStartDate: null,
            contractEndDate: null,
            extensionEndDate: null,
            smeSuitable: true,
            vcseSuitable: null,
          },
        ],
        awardCriteria: [
          { name: "Quality", description: null },
          { name: "Price", description: null },
          { name: "Social value", description: null },
        ],
        documentsCount: 4,
      }),
    );
    expect(complexity.level).toBe("HIGH");

    const competition = inferCompetitionLevel(
      context({ awards: [{ numberOfTenders: 8, numberOfSmeTenders: 3 }] }),
    );
    expect(competition.level).toBe("HIGH");
  });

  it("treats a high turnover barrier as low SME accessibility", () => {
    const sme = inferSmeSuitability(
      context({
        deal: deal({ smeSuitable: true, valueMaxExVat: 100000 }),
        requirements: [
          {
            name: "Economic",
            description: "Minimum turnover £500,000",
            requirementType: "FINANCIAL",
            mandatory: true,
          },
        ],
      }),
    );
    expect(sme.level).toBe("LOW");
  });
});
