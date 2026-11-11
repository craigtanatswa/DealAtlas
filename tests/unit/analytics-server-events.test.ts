import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ATTRIBUTION_FIELDS } from "@/lib/analytics/attribution";
import { captureServerEvent, serverAnalyticsKey } from "@/lib/analytics/server";
import {
  buildProSubscribedEvent,
  buildUserSignedUpEvent,
  planAmountGbp,
  serverCaptureBody,
} from "@/lib/analytics/server-events";

const USER = "3f2b7c1e-9a4d-4c8e-8b1f-2d6e5a7c9b10";
const KEY = "phc_TestKey0123456789abcdef";

function reader(values: Record<string, string>) {
  return (name: string) => values[name] ?? null;
}

describe("server analytics events", () => {
  it("builds user_signed_up from cleaned, allowlisted first-touch attribution only", () => {
    const event = buildUserSignedUpEvent({
      userId: USER,
      read: reader({
        [ATTRIBUTION_FIELDS.firstTouchLandingPath]: "/deals/canary-deal-a1b2c3?q=CANARY#apply",
        [ATTRIBUTION_FIELDS.firstTouchReferrerDomain]: "https://www.google.com/search?q=CANARY+BUYER",
        [ATTRIBUTION_FIELDS.firstTouchGuideCtaPosition]: "after_answer",
        [ATTRIBUTION_FIELDS.firstTouchGuideCtaTarget]: "signup",
        [ATTRIBUTION_FIELDS.utm_source]: "newsletter",
        [ATTRIBUTION_FIELDS.utm_medium]: "email",
        [ATTRIBUTION_FIELDS.utm_campaign]: "<script>",
        [ATTRIBUTION_FIELDS.utm_term]: "council tenders",
        [ATTRIBUTION_FIELDS.utm_content]: "hero cta",
        [ATTRIBUTION_FIELDS.signupSourceGuide]: "how-to-win-council-contracts",
        email: "buyer@canary.example",
        buyer_name: "CANARY BUYER",
        deal_url: "https://portal.example/notices/NTC-998877",
      }),
    });
    expect(event).toEqual({
      event: "user_signed_up",
      distinctId: USER,
      uuid: expect.stringMatching(/^[0-9a-f-]{36}$/),
      properties: {
        first_touch_landing_path: "/deals/[deal]",
        first_touch_referrer_domain: "google",
        first_touch_guide_cta: { position: "after_answer", target: "signup" },
        utm_source: "newsletter",
        utm_medium: "email",
        utm_term: "council tenders",
        utm_content: "hero cta",
        signup_source_guide: "how-to-win-council-contracts",
      },
      setOnce: {
        first_touch_landing_path: "/deals/[deal]",
        first_touch_referrer_domain: "google",
        first_touch_guide_cta: { position: "after_answer", target: "signup" },
        utm_source: "newsletter",
        utm_medium: "email",
        utm_term: "council tenders",
        utm_content: "hero cta",
      },
    });
    const serialised = JSON.stringify(event);
    for (const forbidden of [
      "canary-deal-a1b2c3",
      "CANARY",
      "/search",
      "?q=",
      "<script>",
      "buyer@canary",
      "NTC-998877",
      "portal.example",
    ]) {
      expect(serialised).not.toContain(forbidden);
    }
    expect(Object.keys(event!.properties).sort()).toEqual([
      "first_touch_guide_cta",
      "first_touch_landing_path",
      "first_touch_referrer_domain",
      "signup_source_guide",
      "utm_content",
      "utm_medium",
      "utm_source",
      "utm_term",
    ].sort());
  });

  it.each([
    ["https://www.google.com/search?q=CANARY+BUYER", "google"],
    ["https://www.bing.com:8443/path?q=1#top", "bing"],
    ["www.linkedin.com/feed/?trk=CANARY", "linkedin"],
    ["portal.example-council.gov.uk", "other"],
    ["www.google.com", "google"],
    ["buyer-portal.example.gov.uk", "other"],
    ["https://www.dealatlas.uk/deals/canary-deal-a1b2c3?q=x", "direct"],
    ["https://app.dealatlas.uk/deals/canary-deal-a1b2c3", "direct"],
    ["", "direct"],
    ["/deals/canary-deal-a1b2c3", "direct"],
    ["javascript:alert(1)", "direct"],
  ])("reduces referrer %s to %s", (referrer, expected) => {
    const event = buildUserSignedUpEvent({
      userId: USER,
      read: reader({ [ATTRIBUTION_FIELDS.firstTouchReferrerDomain]: referrer }),
    });
    expect(event!.properties.first_touch_referrer_domain).toBe(expected);
    const serialised = JSON.stringify(event);
    for (const forbidden of ["/search", "?q=", "CANARY", "trk=", "/deals/", "#top", "8443"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("re-buckets raw hostname inputs on the server before user_signed_up and $set_once", () => {
    const cases: Array<[string, string]> = [
      ["www.google.com", "google"],
      ["portal.example-council.gov.uk", "other"],
      ["buyer-portal.example-tenders.gov.uk", "other"],
    ];
    for (const [referrer, expected] of cases) {
      const event = buildUserSignedUpEvent({
        userId: USER,
        read: reader({ [ATTRIBUTION_FIELDS.firstTouchReferrerDomain]: referrer }),
      });
      expect(event!.properties.first_touch_referrer_domain, referrer).toBe(expected);
      expect(event!.setOnce!.first_touch_referrer_domain, referrer).toBe(expected);
      expect(JSON.stringify(event), referrer).not.toContain(referrer);
    }
  });

  it("normalises the first-touch landing path and guide slug allowlist", () => {
    const cases: Array<[string, string]> = [
      ["/deals/canary-deal-a1b2c3?q=CANARY#apply", "/deals/[deal]"],
      ["/guides/how-to-win-council-contracts?utm_source=canary", "/guides/how-to-win-council-contracts"],
      ["/guides/canary-deal-a1b2c3?q=CANARY", "/guides/[guide]"],
      ["/guides/frameworks-and-dynamic-markets", "/guides/[guide]"],
      ["/pricing?ref=CANARY#faq", "/pricing"],
      ["/categories/technology?x=1", "/categories/technology"],
    ];
    for (const [input, expected] of cases) {
      const event = buildUserSignedUpEvent({
        userId: USER,
        read: reader({ [ATTRIBUTION_FIELDS.firstTouchLandingPath]: input }),
      });
      expect(event!.properties.first_touch_landing_path, input).toBe(expected);
      expect(JSON.stringify(event), input).not.toMatch(/[?#]|canary/i);
    }
  });

  it("records the last guide CTA position and target in any accepted shape", () => {
    const expected = { position: "after_answer", target: "signup" };
    const cases: Array<[Record<string, string>, unknown]> = [
      [
        {
          [ATTRIBUTION_FIELDS.firstTouchGuideCtaPosition]: "after_answer",
          [ATTRIBUTION_FIELDS.firstTouchGuideCtaTarget]: "signup",
        },
        expected,
      ],
      [
        {
          [ATTRIBUTION_FIELDS.firstTouchGuideCta]: JSON.stringify(expected),
        },
        expected,
      ],
      [{ [ATTRIBUTION_FIELDS.firstTouchGuideCta]: "after_answer:signup" }, expected],
      [
        {
          [ATTRIBUTION_FIELDS.firstTouchGuideCtaPosition]: "canary",
          [ATTRIBUTION_FIELDS.firstTouchGuideCtaTarget]: "signup",
        },
        undefined,
      ],
      [{ [ATTRIBUTION_FIELDS.firstTouchGuideCta]: "canary:buyer" }, undefined],
    ];
    for (const [fields, value] of cases) {
      const event = buildUserSignedUpEvent({ userId: USER, read: reader(fields) });
      expect(event!.properties.first_touch_guide_cta, JSON.stringify(fields)).toEqual(value);
      expect(JSON.stringify(event)).not.toContain("canary");
    }
  });

  it("never carries deal ids, deal URLs, notice ids, buyer data or full referrers", () => {
    const event = buildUserSignedUpEvent({
      userId: USER,
      read: reader({
        [ATTRIBUTION_FIELDS.firstTouchLandingPath]:
          "/deals/canary-deal-a1b2c3?buyer=CANARY%20BUYER&notice=NTC-998877#contacts",
        [ATTRIBUTION_FIELDS.firstTouchReferrerDomain]:
          "https://portal.example.gov.uk/notices/NTC-998877?buyer=CANARY+BUYER",
        [ATTRIBUTION_FIELDS.firstTouchGuideCtaPosition]: "after_answer",
        [ATTRIBUTION_FIELDS.firstTouchGuideCtaTarget]: "signup",
        [ATTRIBUTION_FIELDS.signupSourceGuide]: "uk-tender-search",
        [ATTRIBUTION_FIELDS.utm_source]: "newsletter",
        [ATTRIBUTION_FIELDS.utm_medium]: "email",
        [ATTRIBUTION_FIELDS.utm_campaign]: "launch",
        [ATTRIBUTION_FIELDS.utm_term]: "council tenders",
        [ATTRIBUTION_FIELDS.utm_content]: "hero cta",
        email: "buyer@canary.example",
        buyer_name: "CANARY BUYER",
        deal_url: "https://portal.example.gov.uk/notices/NTC-998877",
        deal_id: "3f2b7c1e-9a4d-4c8e-8b1f-2d6e5a7c9b10",
        ip: "203.0.113.77",
      }),
    });
    expect(event!.properties).toEqual({
      first_touch_landing_path: "/deals/[deal]",
      first_touch_referrer_domain: "other",
      first_touch_guide_cta: { position: "after_answer", target: "signup" },
      signup_source_guide: "uk-tender-search",
      utm_source: "newsletter",
      utm_medium: "email",
      utm_campaign: "launch",
      utm_term: "council tenders",
      utm_content: "hero cta",
    });
    expect(Object.keys(event!.properties).sort()).toEqual([
      "first_touch_guide_cta",
      "first_touch_landing_path",
      "first_touch_referrer_domain",
      "signup_source_guide",
      "utm_campaign",
      "utm_content",
      "utm_medium",
      "utm_source",
      "utm_term",
    ].sort());
    for (const bannedKey of [
      "email",
      "buyer",
      "buyer_name",
      "deal_id",
      "deal_url",
      "ip",
      "name",
      "url",
    ]) {
      expect(event!.properties, bannedKey).not.toHaveProperty(bannedKey);
    }
    const serialised = JSON.stringify(event).toLowerCase();
    for (const forbidden of [
      "canary",
      "ntc-998877",
      "notice",
      "buyer@",
      "/notices",
      "?buyer",
      "#contacts",
      "canary-deal",
      "portal.example",
      "203.0.113.77",
    ]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("ignores unknown guides and invalid user ids", () => {
    expect(
      buildUserSignedUpEvent({
        userId: USER,
        read: reader({ [ATTRIBUTION_FIELDS.signupSourceGuide]: "canary-deal-a1b2c3" }),
      })!.properties,
    ).toEqual({});
    expect(buildUserSignedUpEvent({ userId: "buyer@canary.example" })).toBeNull();
  });

  it("builds pro_subscribed with plan and amount_gbp from plan config", () => {
    const event = buildProSubscribedEvent({
      userId: USER,
      providerEventId: "evt_123",
      plan: "monthly",
    });
    expect(event!.properties).toEqual({ plan: "monthly", amount_gbp: 39 });
    expect(JSON.stringify(event)).not.toContain("evt_123");
    expect(planAmountGbp("founding")).toBe(250);
    expect(planAmountGbp("annual")).toBeGreaterThan(planAmountGbp("founding"));
  });

  it("uses a deterministic UUID per webhook event", () => {
    const a = buildProSubscribedEvent({ userId: USER, providerEventId: "evt_1", plan: "annual" });
    const b = buildProSubscribedEvent({ userId: USER, providerEventId: "evt_1", plan: "annual" });
    const c = buildProSubscribedEvent({ userId: USER, providerEventId: "evt_2", plan: "annual" });
    expect(a!.uuid).toBe(b!.uuid);
    expect(a!.uuid).not.toBe(c!.uuid);
  });

  it("serialises only the allowlisted body", () => {
    const event = buildProSubscribedEvent({ userId: USER, providerEventId: "evt_1", plan: "annual" })!;
    const body = serverCaptureBody(KEY, event, new Date("2026-10-19T12:00:00Z"));
    expect(Object.keys(body).sort()).toEqual(["api_key", "distinct_id", "event", "properties", "timestamp", "uuid"]);
    expect(Object.keys(body.properties).sort()).toEqual(["$geoip_disable", "$lib", "amount_gbp", "plan"]);
  });

  it("is disabled without a key or when server capture is off", async () => {
    expect(serverAnalyticsKey({})).toBeNull();
    expect(serverAnalyticsKey({ NEXT_PUBLIC_POSTHOG_KEY: "not-a-key" })).toBeNull();
    expect(
      serverAnalyticsKey({ NEXT_PUBLIC_POSTHOG_KEY: KEY, DEALATLAS_ANALYTICS_UPSTREAM: "off" }),
    ).toBeNull();
    const fetchImpl = vi.fn();
    const event = buildProSubscribedEvent({ userId: USER, providerEventId: "evt_1", plan: "annual" });
    await captureServerEvent(event, { env: {}, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts to the EU host and never throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network"));
    const event = buildProSubscribedEvent({ userId: USER, providerEventId: "evt_1", plan: "annual" });
    await expect(
      captureServerEvent(event, { env: { NEXT_PUBLIC_POSTHOG_KEY: KEY }, fetchImpl }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]![0]).toBe("https://eu.i.posthog.com/i/v0/e/");
  });

  it("allows app-triggered events with no user agent", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const event = buildProSubscribedEvent({ userId: USER, providerEventId: "evt_1", plan: "annual" });
    await captureServerEvent(event, { env: { NEXT_PUBLIC_POSTHOG_KEY: KEY }, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("drops an explicitly automated or empty user agent", async () => {
    const event = buildProSubscribedEvent({ userId: USER, providerEventId: "evt_1", plan: "annual" });
    for (const userAgent of [
      "",
      "   ",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36",
      null,
    ]) {
      const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
      await captureServerEvent(event, {
        env: { NEXT_PUBLIC_POSTHOG_KEY: KEY },
        fetchImpl,
        userAgent,
      });
      expect(fetchImpl, String(userAgent)).not.toHaveBeenCalled();
    }
  });

  it("sends for an explicitly normal browser user agent", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const event = buildProSubscribedEvent({ userId: USER, providerEventId: "evt_1", plan: "annual" });
    await captureServerEvent(event, {
      env: { NEXT_PUBLIC_POSTHOG_KEY: KEY },
      fetchImpl,
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});