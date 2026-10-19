import { describe, expect, it } from "vitest";

import { dealPathGate, isLegacyPublicSlug } from "@/lib/deals/public-slug";

const DEAL_ID = "11111111-1111-4111-8111-111111111111";
const TEMPLATE = {
  slug: "road-maintenance-notice-ab12cd34",
  dealId: DEAL_ID,
  isPublished: true,
  leakageRisk: "LOW",
  unpublishedByAdmin: false,
};

describe("legacy public slugs", () => {
  it("treats a deal-id suffix and a title-only slug as legacy", () => {
    expect(isLegacyPublicSlug("road-maintenance-notice-11111111", DEAL_ID)).toBe(true);
    expect(isLegacyPublicSlug("road-maintenance-notice", DEAL_ID)).toBe(true);
    expect(isLegacyPublicSlug(TEMPLATE.slug, DEAL_ID)).toBe(false);
  });

  it("does not resolve a legacy slug or a slug that is not the published row", () => {
    expect(
      dealPathGate({
        pathname: "/deals/road-maintenance-notice-11111111",
        retired: false,
        match: { ...TEMPLATE, slug: "road-maintenance-notice-11111111" },
      }),
    ).toBe("gone");
    expect(
      dealPathGate({
        pathname: "/deals/older-title-format",
        retired: false,
        match: { ...TEMPLATE, slug: "older-title-format" },
      }),
    ).toBe("gone");
    expect(
      dealPathGate({
        pathname: "/deals/road-maintenance-notice-11111111",
        retired: false,
        match: null,
      }),
    ).toBe("missing");
    expect(
      dealPathGate({
        pathname: `/deals/${TEMPLATE.slug}`,
        retired: false,
        match: TEMPLATE,
      }),
    ).toBe("next");
    expect(dealPathGate({ pathname: "/deals/sitemap.xml", retired: false, match: null })).toBe("next");
  });
});