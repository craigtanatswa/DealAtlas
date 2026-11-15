// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { proMonthlyShort } from "@/lib/billing/founding-ui";
import { DISPLAY_PRICING } from "@/lib/constants";
import { marketingPageMetadata } from "@/lib/seo/metadata";
import { PRICING_META_DESCRIPTION, PUBLIC_PAGE_COPY } from "@/lib/seo/pages";
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
  requirements_preview: ["ISO 9001"],
  relevance_tags: ["lighting"],
  freshness_label: null,
};

function stickyBarText(founding?: { offered: boolean; sold_out: boolean }) {
  const { container } = render(
    <DealPreviewDetail deal={toPublicDealPreview(BASE)} unlock={{ mode: "free", founding }} />,
  );
  const bar = container.querySelector("div.fixed.bottom-0");
  expect(bar).not.toBeNull();
  return bar?.textContent ?? "";
}

describe("mobile sticky unlock bar", () => {
  it.each([
    ["Lifetime available", { offered: true, sold_out: false }],
    ["Lifetime sold out", { offered: true, sold_out: true }],
    ["Lifetime not offered", undefined],
  ])("leads with the Pro monthly price when %s", (_label, founding) => {
    const text = stickyBarText(founding);
    expect(text).toContain(`Unlock with Pro · from ${proMonthlyShort()}`);
    expect(text).toContain("from £19/mo");
    expect(text).not.toMatch(/Pro[^£]*£250/);
    expect(text).not.toContain("£250");
    expect(text).not.toMatch(/founding/i);
  });

  it("derives the price from DISPLAY_PRICING", () => {
    expect(proMonthlyShort()).toBe(DISPLAY_PRICING.proMonthly.replace("/month", "/mo"));
  });
});

describe("/pricing meta description", () => {
  const meta = marketingPageMetadata({ ...PUBLIC_PAGE_COPY.pricing, origin: "https://www.dealatlas.uk" });

  it("is buyer-facing copy built from DISPLAY_PRICING", () => {
    expect(PRICING_META_DESCRIPTION).toBe(
      "DealAtlas pricing: Free, Pro £19/month or £180/year, Lifetime £250 one-time. All prices include VAT.",
    );
    expect(PRICING_META_DESCRIPTION).toContain(DISPLAY_PRICING.proMonthly);
    expect(PRICING_META_DESCRIPTION).toContain(DISPLAY_PRICING.proAnnual);
    expect(PRICING_META_DESCRIPTION).toContain(DISPLAY_PRICING.proLifetime);
  });

  it("carries no internal wording or Pro-£250 pairing in description, OpenGraph or Twitter", () => {
    const descriptions = [
      meta.description,
      meta.openGraph?.description,
      meta.twitter?.description,
    ];
    for (const description of descriptions) {
      expect(description).toBe(PRICING_META_DESCRIPTION);
      expect(description).not.toMatch(/commercial copy/i);
      expect(description).not.toMatch(/server-configured/i);
      expect(description).not.toMatch(/Pro £250/);
      expect(description).not.toMatch(/founding/i);
    }
  });
});
