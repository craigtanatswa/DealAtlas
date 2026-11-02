import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ATTRIBUTION_FIELDS,
  attributionFormValues,
  recordGuideCtaClick,
  recordLanding,
  recordPageView,
  resetAttributionForTests,
  startFirstTouchAfterConsent,
} from "@/lib/analytics/attribution";
import { resetAnalyticsConsentForTests, setAnalyticsConsent } from "@/lib/analytics/consent";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  ANALYTICS_FIRST_TOUCH_STORAGE_KEY,
} from "@/lib/analytics/storage-keys";
import { readLocalValue, resetLocalStorageForTests } from "@/lib/analytics/storage";

const ORIGIN = "https://www.dealatlas.uk";
const GUIDE = "uk-tender-search";
const DEAL_SLUG = "canary-deal-a1b2c3";

function resetAll() {
  resetLocalStorageForTests();
  resetAttributionForTests();
  resetAnalyticsConsentForTests();
}

describe("analytics consent and first-touch storage", () => {
  beforeEach(resetAll);
  afterEach(resetAll);

  it("stores and sends nothing before analytics consent", () => {
    recordLanding({
      href: `${ORIGIN}/deals/${DEAL_SLUG}?buyer=CANARY&notice=NTC-998877#apply`,
      referrer: "https://www.google.com/search?q=CANARY+BUYER",
      origin: ORIGIN,
    });
    recordPageView(`/guides/${GUIDE}`);
    recordGuideCtaClick("after_answer", "signup");

    expect(attributionFormValues()).toEqual({});
    expect(readLocalValue(ANALYTICS_FIRST_TOUCH_STORAGE_KEY)).toBeNull();
    expect(readLocalValue(ANALYTICS_CONSENT_STORAGE_KEY)).toBeNull();
  });

  it("keeps first touch, last guide and last CTA after consent", () => {
    setAnalyticsConsent(true);

    recordLanding({
      href: `${ORIGIN}/deals/${DEAL_SLUG}?buyer=CANARY&notice=NTC-998877#apply`,
      referrer: "https://www.google.com/search?q=CANARY+BUYER",
      origin: ORIGIN,
    });
    // Later page views must not replace the first touch.
    recordLanding({
      href: `${ORIGIN}/pricing`,
      referrer: "https://www.bing.com/search?q=CANARY",
      origin: ORIGIN,
    });
    recordPageView(`/guides/${GUIDE}`);
    recordGuideCtaClick("mid", "deals");
    recordGuideCtaClick("after_answer", "signup");

    const values = attributionFormValues();
    expect(values[ATTRIBUTION_FIELDS.firstTouchLandingPath]).toBe("/deals/[deal]");
    expect(values[ATTRIBUTION_FIELDS.firstTouchReferrerDomain]).toBe("google.com");
    expect(values[ATTRIBUTION_FIELDS.signupSourceGuide]).toBe(GUIDE);
    expect(values[ATTRIBUTION_FIELDS.firstTouchGuideCtaPosition]).toBe("after_answer");
    expect(values[ATTRIBUTION_FIELDS.firstTouchGuideCtaTarget]).toBe("signup");

    const stored = readLocalValue(ANALYTICS_FIRST_TOUCH_STORAGE_KEY) ?? "";
    for (const forbidden of [DEAL_SLUG, "CANARY", "NTC-998877", "/search", "?q=", "bing"]) {
      expect(stored).not.toContain(forbidden);
    }
  });

  it("starts first touch at the consent page when consent comes later", () => {
    recordLanding({
      href: `${ORIGIN}/deals/${DEAL_SLUG}?buyer=CANARY&notice=NTC-998877`,
      referrer: "https://www.google.com/search?q=CANARY",
      origin: ORIGIN,
    });
    expect(readLocalValue(ANALYTICS_FIRST_TOUCH_STORAGE_KEY)).toBeNull();

    setAnalyticsConsent(true);
    startFirstTouchAfterConsent({
      href: `${ORIGIN}/guides/${GUIDE}?utm_source=late&utm_campaign=consent`,
      origin: ORIGIN,
    });

    const values = attributionFormValues();
    expect(values[ATTRIBUTION_FIELDS.firstTouchLandingPath]).toBe(`/guides/${GUIDE}`);
    expect(values[ATTRIBUTION_FIELDS.firstTouchReferrerDomain]).toBe("direct");
    expect(values[ATTRIBUTION_FIELDS.utm_source]).toBe("late");
    expect(values[ATTRIBUTION_FIELDS.utm_campaign]).toBe("consent");
    expect(values[ATTRIBUTION_FIELDS.signupSourceGuide]).toBe(GUIDE);

    const stored = readLocalValue(ANALYTICS_FIRST_TOUCH_STORAGE_KEY) ?? "";
    expect(stored).not.toContain(DEAL_SLUG);
    expect(stored).not.toContain("google");
  });

  it("clears first touch on rejection and never resurrects it on re-accept", () => {
    setAnalyticsConsent(true);
    recordLanding({
      href: `${ORIGIN}/deals/${DEAL_SLUG}?buyer=CANARY`,
      referrer: "https://www.google.com/search?q=CANARY",
      origin: ORIGIN,
    });
    expect(attributionFormValues()[ATTRIBUTION_FIELDS.firstTouchLandingPath]).toBe(
      "/deals/[deal]",
    );

    setAnalyticsConsent(false);
    expect(readLocalValue(ANALYTICS_FIRST_TOUCH_STORAGE_KEY)).toBeNull();
    expect(attributionFormValues()).toEqual({});

    setAnalyticsConsent(true);
    startFirstTouchAfterConsent({ href: `${ORIGIN}/pricing`, origin: ORIGIN });
    const values = attributionFormValues();
    expect(values[ATTRIBUTION_FIELDS.firstTouchLandingPath]).toBe("/pricing");
    expect(values[ATTRIBUTION_FIELDS.firstTouchReferrerDomain]).toBe("direct");
    expect(JSON.stringify(values)).not.toContain(DEAL_SLUG);
  });

  it("stores a hostname only and treats same-site referrers as direct", () => {
    setAnalyticsConsent(true);
    recordLanding({
      href: `${ORIGIN}/deals/${DEAL_SLUG}?notice=NTC-998877`,
      referrer: `https://portal.example.gov.uk/notices/NTC-998877?buyer=CANARY&utm_source=leak`,
      origin: ORIGIN,
    });
    let stored = readLocalValue(ANALYTICS_FIRST_TOUCH_STORAGE_KEY) ?? "";
    for (const forbidden of [DEAL_SLUG, "NTC-998877", "CANARY", "/notices", "?buyer", "utm_source"]) {
      expect(stored).not.toContain(forbidden);
    }
    expect(JSON.parse(stored)).toMatchObject({
      landingPath: "/deals/[deal]",
      referrerDomain: "portal.example.gov.uk",
    });

    resetAttributionForTests();
    recordLanding({
      href: `${ORIGIN}/pricing`,
      referrer: `${ORIGIN}/deals/${DEAL_SLUG}?q=CANARY`,
      origin: ORIGIN,
    });
    stored = readLocalValue(ANALYTICS_FIRST_TOUCH_STORAGE_KEY) ?? "";
    expect(JSON.parse(stored)).toMatchObject({
      landingPath: "/pricing",
      referrerDomain: "direct",
    });
    expect(stored).not.toContain(DEAL_SLUG);
  });

  it("ignores CTA values that are not allowlisted", () => {
    setAnalyticsConsent(true);
    recordLanding({
      href: `${ORIGIN}/guides/${GUIDE}`,
      referrer: "",
      origin: ORIGIN,
    });
    recordGuideCtaClick("mid", "deals");
    recordGuideCtaClick("canary-position", "signup");
    recordGuideCtaClick("end", "canary-target");

    const values = attributionFormValues();
    expect(values[ATTRIBUTION_FIELDS.firstTouchGuideCtaPosition]).toBe("mid");
    expect(values[ATTRIBUTION_FIELDS.firstTouchGuideCtaTarget]).toBe("deals");
    expect(JSON.stringify(values)).not.toContain("canary");
  });
});
