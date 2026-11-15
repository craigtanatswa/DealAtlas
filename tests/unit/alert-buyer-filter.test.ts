import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { previewMatchesFilters } from "@/lib/alerts/evaluate";

const preview = {
  deal_id: "11111111-1111-4111-8111-111111111111",
  slug: "ted-private-buyer-preview",
  preview_title: "IT services for a private organisation",
  preview_summary: "A private organisation needs IT services.",
  main_category: "Technology",
  broad_region: "London",
  value_band: "£250k–£500k",
  deadline_band: "Within 14 days",
  deal_type: "PUBLIC_TENDER",
  buyer_sector: "PRIVATE",
  buyer_type: "PRIVATE",
  status: "OPEN",
  updated_at: "2026-11-15T12:00:00.000Z",
};

describe("alert buyer sector filter", () => {
  it("does not match a PUBLIC filter for a reclassified private TED buyer", () => {
    expect(
      previewMatchesFilters(preview, { buyerSector: "PUBLIC" }),
    ).toBe(false);
  });

  it("matches a PRIVATE filter for a reclassified private TED buyer", () => {
    expect(
      previewMatchesFilters(preview, { buyerSector: "PRIVATE" }),
    ).toBe(true);
  });

  it("matches PUBLIC for education and healthcare buyers with legacy sectors", () => {
    for (const buyerSector of ["EDUCATION", "HEALTHCARE"] as const) {
      expect(
        previewMatchesFilters(
          { ...preview, buyer_sector: buyerSector, buyer_type: "PUBLIC" },
          { buyerSector: "PUBLIC" },
        ),
      ).toBe(true);
      expect(
        previewMatchesFilters(
          { ...preview, buyer_sector: buyerSector, buyer_type: "PUBLIC" },
          { buyerSector: "PRIVATE" },
        ),
      ).toBe(false);
    }
  });

  it("matches PRIVATE for nonprofit and private buyers", () => {
    for (const buyerSector of ["NONPROFIT", "PRIVATE"] as const) {
      expect(
        previewMatchesFilters(
          { ...preview, buyer_sector: buyerSector, buyer_type: "PRIVATE" },
          { buyerSector: "PRIVATE" },
        ),
      ).toBe(true);
      expect(
        previewMatchesFilters(
          { ...preview, buyer_sector: buyerSector, buyer_type: "PRIVATE" },
          { buyerSector: "PUBLIC" },
        ),
      ).toBe(false);
    }
  });

  it("keeps legacy sector filters on buyer_sector", () => {
    expect(
      previewMatchesFilters(
        { ...preview, buyer_sector: "NONPROFIT", buyer_type: "PRIVATE" },
        { buyerSector: "NONPROFIT" },
      ),
    ).toBe(true);
    expect(
      previewMatchesFilters(
        { ...preview, buyer_sector: "EDUCATION", buyer_type: "PUBLIC" },
        { buyerSector: "EDUCATION" },
      ),
    ).toBe(true);
  });
});
