// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { DealProCard } from "@/components/deals/deal-pro-card";
import { positiveFitLabel, readableRequirementLines } from "@/lib/preview/fit";
import { toPublicDealPreview, type PreviewDtoFields } from "@/lib/search/dto";

afterEach(cleanup);

const BASE: PreviewDtoFields = {
  slug: "street-lighting-for-a-public-organisation-deadbeef",
  preview_title: "Street lighting for a public organisation",
  preview_summary: "A public organisation is procuring street lighting through a public tender.",
  deal_type: "PUBLIC_TENDER",
  buyer_sector: "PUBLIC",
  stage: "LIVE",
  status: "OPEN",
  main_category: "works",
  broad_region: "Wales",
  value_band: "£1m–£5m",
  deadline_band: "Within 30 days",
  duration_band: "3–5 years",
  sme_suitability: "HIGH",
  bid_complexity: "LOW",
  competition_level: "UNKNOWN",
  requirements_preview: [
    "Similar schemes delivered in the last 5 years",
    "ISO 9001",
    "financial capacity evidence",
  ],
  relevance_tags: ["lighting"],
  freshness_label: null,
};

function detail(row: Partial<PreviewDtoFields> = {}, unlock?: Parameters<typeof DealPreviewDetail>[0]["unlock"]) {
  return render(<DealPreviewDetail deal={toPublicDealPreview({ ...BASE, ...row })} unlock={unlock} />);
}

describe("fit labels show positive fit only", () => {
  it("maps levels", () => {
    expect(positiveFitLabel("HIGH")).toBe("High");
    expect(positiveFitLabel("MEDIUM")).toBe("Medium");
    expect(positiveFitLabel("LOW")).toBeNull();
    expect(positiveFitLabel("UNKNOWN")).toBeNull();
    expect(positiveFitLabel(null)).toBeNull();
  });

  it("hides Low, unknown and Not stated on the deal page", () => {
    const { container } = detail();
    expect(screen.getByText("SME suitability")).toBeTruthy();
    expect(screen.queryByText("Bid complexity")).toBeNull();
    expect(screen.queryByText("Competition")).toBeNull();
    expect(container.textContent).not.toMatch(/Not stated|\bLow\b/);
  });

  it("drops SME suitability when Low", () => {
    detail({ sme_suitability: "LOW", bid_complexity: "MEDIUM" });
    expect(screen.queryByText("SME suitability")).toBeNull();
    expect(screen.getByText("Bid complexity")).toBeTruthy();
  });

  it("keeps the disclaimer as small footer text", () => {
    detail();
    const note = screen.getByText(/Fit labels are DealAtlas analysis/);
    expect(note.className).toContain("text-xs");
  });
});

describe("requirement lines", () => {
  it("drops fragments under 3 words or with no verb", () => {
    expect(
      readableRequirementLines([
        "Similar schemes delivered in the last 5 years",
        "Night-time working with traffic management",
        "ISO 9001",
        "financial capacity evidence",
      ]),
    ).toEqual([
      "Similar schemes delivered in the last 5 years",
      "Night-time working with traffic management",
    ]);
  });

  it("drops the section and the 'none listed' line when nothing is left", () => {
    const { container } = detail({ requirements_preview: ["financial capacity evidence", "evidence of comparable delivery"] });
    expect(container.textContent).not.toMatch(/No general requirements/);
    expect(screen.queryByText("Products and services required")).toBeNull();
  });
});

describe("payment pending (?upgraded=1)", () => {
  it("hides the buy buttons and the sticky unlock bar", () => {
    const { container } = detail({}, { mode: "free", paymentPending: true });
    expect(screen.getAllByText("Confirming your payment…").length).toBeGreaterThan(0);
    expect(container.querySelector("input[name='planKey']")).toBeNull();
    expect(screen.queryByText(/Start Pro/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Unlock" })).toBeNull();
  });

  it("shows the buy buttons when not pending", () => {
    render(<DealProCard mode="free" alertsHref="/app/alerts" />);
    expect(screen.getByRole("button", { name: /Start Pro/ })).toBeTruthy();
    expect(screen.queryByText("Confirming your payment…")).toBeNull();
  });
});
