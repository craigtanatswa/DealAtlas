import { describe, expect, it } from "vitest";

import { leakScanInputFromContext } from "@/ingestion/preview/generate";
import type { IntelligenceContext } from "@/ingestion/intelligence/types";
import { scanPreviewLeaks, type LeakScanInput } from "@/lib/redaction/scan";

const draft = {
  previewTitle: "Grounds maintenance services",
  previewSummary: "A three year grounds maintenance requirement.",
  requirementsPreview: ["Grounds maintenance"],
  relevanceTags: ["Grounds maintenance"],
};

function context(): IntelligenceContext {
  return {
    source: { name: "Private feed", sourceKey: "private-example" },
    buyerAliases: [],
    noticeIdentifiers: [],
    requirements: [],
    lots: [],
    buyer: null,
    now: new Date("2026-05-01T00:00:00.000Z"),
    deal: {
      ocid: null,
      reference: null,
      externalPrimaryId: "external-1",
      sourceTitle: "RFQ grounds maintenance",
      sourceDescription: "Seeking suppliers.",
      sourceUrl: "https://private.example/tender/1",
      applicationUrl: null,
      exactValueText: null,
      valueMinExVat: null,
      valueMaxExVat: null,
      submissionDeadline: "2026-06-30T12:00:00.000Z",
      enquiryDeadline: null,
      firstPublishedAt: null,
      awardDecisionDate: null,
      contractStartDate: null,
      contractEndDate: null,
      extensionEndDate: null,
      nextProcurementDate: null,
      estimatedRenewalDate: null,
      exactLocationText: null,
      status: "OPEN",
    },
    privateBuyerNames: ["Zarqwell Borough Council"],
    privateBuyerDomains: ["zarqwell.example"],
    privateSourceUrl: "https://secret.private.example/tender/1",
  } as unknown as IntelligenceContext;
}

function scan(overrides: Partial<LeakScanInput>) {
  const base: LeakScanInput = {
    ...draft,
    slug: null,
    broadRegion: null,
    sourceTitle: "RFQ grounds maintenance",
    sourceDescription: "Seeking suppliers.",
    sourceExtraText: [],
    ocid: null,
    reference: null,
    externalPrimaryId: null,
    noticeIdentifiers: [],
    extraReferences: [],
    sourceUrl: null,
    applicationUrl: null,
    sourceName: "Private feed",
    sourceKey: "private-example",
    buyerName: null,
    buyerAliases: [],
    buyerDomain: null,
    buyerEmail: null,
    buyerPhone: null,
    exactValueText: null,
    valueMinExVat: null,
    valueMaxExVat: null,
    submissionDeadline: null,
    exactLocationText: null,
  };
  return scanPreviewLeaks({ ...base, ...overrides });
}

describe("discovery leak inputs", () => {
  it("folds private buyer names, domains and source URLs into the scan", () => {
    const input = leakScanInputFromContext(context(), draft);
    expect(input.buyerAliases).toContain("Zarqwell Borough Council");
    expect(input.buyerDomain).toBe("zarqwell.example");
    expect(input.buyerDomains).toEqual(["zarqwell.example"]);
    expect(input.sourceUrl).toBe("https://secret.private.example/tender/1");
  });

  it("blocks a private buyer domain in an otherwise safe preview", () => {
    const result = scan({
      previewSummary: "Grounds maintenance for zarqwell.example",
      buyerDomains: ["zarqwell.example"],
    });
    expect(result.risk).not.toBe("LOW");
    expect(result.findings.some((finding) => finding.code === "BUYER_DOMAIN")).toBe(true);
  });
});
