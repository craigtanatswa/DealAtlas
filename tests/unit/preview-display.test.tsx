// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DealCard } from "@/components/deals/deal-card";
import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import {
  categoryLabel,
  disclosed,
  distinctSpecificSector,
  keyDatesRemainder,
} from "@/lib/preview/display";
import { toDealCardData, toPublicDealPreview, type PreviewDtoFields } from "@/lib/search/dto";

afterEach(cleanup);

describe("display helpers", () => {
  it("maps raw goods/works/services to proper names", () => {
    expect(categoryLabel("goods")).toBe("Goods and supplies");
    expect(categoryLabel("Works")).toBe("Construction and works");
    expect(categoryLabel("services")).toBe("Services");
    expect(categoryLabel("Healthcare")).toBe("Healthcare");
    expect(categoryLabel("UNKNOWN")).toBeNull();
    expect(categoryLabel(null)).toBeNull();
  });

  it("hides UNKNOWN and Not disclosed placeholders", () => {
    for (const value of ["UNKNOWN", "Not disclosed", "Undisclosed", "Not stated", " ", null]) {
      expect(disclosed(value)).toBeNull();
    }
    expect(disclosed("3–5 years")).toBe("3–5 years");
  });

  it("hides specificSector when it repeats goods or the category", () => {
    const goods = ["Construction work"];
    expect(distinctSpecificSector("Construction work", goods, "Construction")).toBeNull();
    expect(distinctSpecificSector("construction work", goods, null)).toBeNull();
    expect(distinctSpecificSector("Healthcare", [], "Healthcare")).toBeNull();
    expect(distinctSpecificSector("Health services", goods, "Healthcare")).toBe("Health services");
  });

  it("drops keyDates parts that repeat the bands already shown", () => {
    const keyDates = "Closing window Within 30 days. Contract term 3–5 years";
    expect(
      keyDatesRemainder(keyDates, { deadlineBand: "Within 30 days", durationBand: "3–5 years" }),
    ).toBeNull();
    expect(keyDatesRemainder(keyDates, { deadlineBand: "Within 30 days" })).toBe(
      "Contract term 3–5 years",
    );
    expect(
      keyDatesRemainder("Closing window Within 7 days. Contract term Not disclosed", {}),
    ).toBe("Closing window Within 7 days");
  });
});

const ROW: PreviewDtoFields = {
  slug: "construction-work-for-a-public-organisation-deadbeef",
  preview_title: "Construction work for a public organisation",
  preview_summary: "A public organisation is procuring construction work through a public tender.",
  deal_type: "PUBLIC_TENDER",
  buyer_sector: "PUBLIC",
  stage: "LIVE",
  status: "OPEN",
  main_category: "works",
  broad_region: "Wales",
  value_band: "Undisclosed",
  deadline_band: "Within 30 days",
  duration_band: "Not disclosed",
  sme_suitability: "UNKNOWN",
  bid_complexity: "MEDIUM",
  competition_level: "UNKNOWN",
  requirements_preview: [
    "goodsServices: Construction work",
    "specificSector: Construction work",
    "keyDates: Closing window Within 30 days",
    "scope: Covers construction work for a public organisation, delivered within Wales.",
  ],
  relevance_tags: [],
  freshness_label: null,
};

describe("free preview surfaces hide duplicates and placeholders", () => {
  it("detail page", () => {
    const { container } = render(<DealPreviewDetail deal={toPublicDealPreview(ROW)} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Construction and works");
    expect(text).not.toMatch(/\bworks\b(?! )/);
    expect(text).not.toMatch(/Not disclosed|Undisclosed|UNKNOWN|Not stated/);
    expect(text).not.toContain("Sector");
    expect(text).not.toContain("Closing window Within 30 days");
    expect(text).not.toContain("Contract term");
    expect(text).toContain("Bid complexity");
    expect(text).not.toContain("SME suitability");
    expect(text).toContain("Covers construction work for a public organisation, delivered within Wales.");
  });

  it("card", () => {
    const { container } = render(<DealCard deal={toDealCardData(toPublicDealPreview(ROW))} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Construction and works");
    expect(text).not.toMatch(/Not disclosed|Undisclosed|UNKNOWN|not stated/i);
    expect(text).not.toContain("SME fit");
    expect(text).not.toContain("Closing window");
  });
});
