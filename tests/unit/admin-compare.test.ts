import { describe, expect, it } from "vitest";

import {
  compareCanonicalToPreview,
  previewContainsCanonicalMarker,
} from "@/lib/admin/compare";

describe("canonical vs preview comparison", () => {
  it("keeps buyer and source URL out of the preview column", () => {
    const rows = compareCanonicalToPreview({
      sourceTitle: "CANARY SOURCE TITLE NEVER FREE",
      sourceDescription: "Exact notice text",
      buyerName: "CANARY BUYER NEVER FREE",
      sourceUrl: "https://canary-source.example/notice",
      reference: "CANARY-REF",
      ocid: "ocds-canary-1",
      exactValueText: "£120,000",
      valueMinExVat: 120000,
      valueMaxExVat: 120000,
      submissionDeadline: "2026-07-01T12:00:00.000Z",
      exactLocationText: "Southwark",
      previewTitle: "Technology opportunity for a public-sector organisation",
      previewSummary: "A public-sector buyer is seeking technology support.",
      valueBand: "£100k–£250k",
      deadlineBand: "Within 30 days",
      broadRegion: "London",
      leakageRisk: "REVIEW",
      isPublished: false,
      unpublishedByAdmin: true,
    });

    const buyer = rows.find((row) => row.field === "Buyer");
    const url = rows.find((row) => row.field === "Source URL");
    const publish = rows.find((row) => row.field === "Publish state");
    expect(buyer?.canonical).toContain("CANARY BUYER NEVER FREE");
    expect(buyer?.preview).toBe("Not included in preview");
    expect(url?.preview).toBe("Not included in preview");
    expect(publish?.preview).toBe("Held unpublished by admin");
  });

  it("detects canonical markers that leaked into preview text", () => {
    expect(
      previewContainsCanonicalMarker(
        "Work for CANARY BUYER NEVER FREE in London",
        "CANARY BUYER NEVER FREE",
      ),
    ).toBe(true);
    expect(
      previewContainsCanonicalMarker(
        "A public-sector organisation seeks support",
        "CANARY BUYER NEVER FREE",
      ),
    ).toBe(false);
  });
});
