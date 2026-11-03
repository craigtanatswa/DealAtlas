import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  GUIDE_CTA_POSITION_ATTR,
  GUIDE_CTA_TARGET_ATTR,
  guideCtaViewProperties,
} from "@/lib/analytics/guide-cta";
import { sanitizeClientEvent } from "@/lib/analytics/sanitize";

const ORIGIN = "https://www.dealatlas.uk";
const ROOT = path.resolve(__dirname, "../..");
const SLUG = "how-to-win-council-contracts";
const SLUG_2 = "how-to-find-public-sector-tenders";
const SLUG_3 = "uk-tender-search";
const SLUG_4 = "council-tenders-uk";
const PUBLISHED = [SLUG, SLUG_2, SLUG_3, SLUG_4];
const UNPUBLISHED_SLUG = "frameworks-and-dynamic-markets";

function fakeLink(attrs: Record<string, string>) {
  return {
    closest: (selector: string) =>
      selector.startsWith("a[") && GUIDE_CTA_TARGET_ATTR in attrs
        ? { getAttribute: (name: string) => attrs[name] ?? null }
        : null,
  };
}

describe("guide CTA viewed analytics", () => {
  it.each(PUBLISHED)("builds guide_cta_viewed for %s with only slug, position and target", (slug) => {
    const element = fakeLink({
      [GUIDE_CTA_TARGET_ATTR]: "signup",
      [GUIDE_CTA_POSITION_ATTR]: "after_answer",
    });
    const properties = guideCtaViewProperties(element, `/guides/${slug}`);
    expect(properties).toEqual({
      guide_slug: slug,
      position: "after_answer",
      target: "signup",
    });
    const sanitized = sanitizeClientEvent(
      {
        event: "guide_cta_viewed",
        properties: {
          token: "phc_TestKey0123456789abcdef",
          distinct_id: "0190a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b",
          $current_url: `${ORIGIN}/guides/${slug}`,
          ...properties!,
          buyer_name: "CANARY BUYER NEVER FREE",
          deal_url: `${ORIGIN}/deals/canary-deal-a1b2c3`,
        },
      },
      { origin: ORIGIN },
    );
    expect(sanitized?.properties).toMatchObject(properties!);
    expect(JSON.stringify(sanitized)).not.toMatch(/CANARY|canary-deal|buyer_name|deal_url/);
  });

  it("sends no guide_cta_viewed off guide pages or for unlisted values", () => {
    const element = fakeLink({
      [GUIDE_CTA_TARGET_ATTR]: "signup",
      [GUIDE_CTA_POSITION_ATTR]: "after_answer",
    });
    expect(guideCtaViewProperties(element, "/deals/some-deal-ab12")).toBeNull();
    expect(guideCtaViewProperties(element, `/guides/${UNPUBLISHED_SLUG}`)).toBeNull();
    expect(
      guideCtaViewProperties(
        fakeLink({
          [GUIDE_CTA_TARGET_ATTR]: "canary-target",
          [GUIDE_CTA_POSITION_ATTR]: "after_answer",
        }),
        `/guides/${SLUG}`,
      ),
    ).toBeNull();
    expect(
      guideCtaViewProperties(
        fakeLink({
          [GUIDE_CTA_TARGET_ATTR]: "signup",
          [GUIDE_CTA_POSITION_ATTR]: "canary-position",
        }),
        `/guides/${SLUG}`,
      ),
    ).toBeNull();
    expect(guideCtaViewProperties(null, `/guides/${SLUG}`)).toBeNull();
  });

  it("wires the click and view listeners in the PostHog client", () => {
    const source = fs.readFileSync(path.join(ROOT, "components/analytics/posthog-analytics.tsx"), "utf8");
    expect(source).toContain('"guide_cta_clicked"');
    expect(source).toContain("guideCtaClickProperties");
    expect(source).toContain('"guide_cta_viewed"');
    expect(source).toContain("guideCtaViewProperties");
    expect(source).toContain("IntersectionObserver");
    expect(source).toContain("threshold: 0.5");
  });
});
