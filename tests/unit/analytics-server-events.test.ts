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
  it("builds user_signed_up from cleaned, allowlisted attribution only", () => {
    const event = buildUserSignedUpEvent({
      userId: USER,
      read: reader({
        [ATTRIBUTION_FIELDS.firstLandingPath]: "/deals/canary-deal-a1b2c3?q=CANARY",
        [ATTRIBUTION_FIELDS.firstReferrerDomain]: "https://www.google.com/search?q=x",
        [ATTRIBUTION_FIELDS.utm_source]: "newsletter",
        [ATTRIBUTION_FIELDS.utm_medium]: "email",
        [ATTRIBUTION_FIELDS.utm_campaign]: "<script>",
        [ATTRIBUTION_FIELDS.signupSourceGuide]: "how-to-win-council-contracts",
        email: "buyer@canary.example",
      }),
    });
    expect(event).toEqual({
      event: "user_signed_up",
      distinctId: USER,
      uuid: expect.stringMatching(/^[0-9a-f-]{36}$/),
      properties: {
        first_landing_path: "/deals/[deal]",
        first_referrer_domain: "www.google.com",
        utm_source: "newsletter",
        utm_medium: "email",
        signup_source_guide: "how-to-win-council-contracts",
      },
      setOnce: {
        first_landing_path: "/deals/[deal]",
        first_referrer_domain: "www.google.com",
      },
    });
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
    expect(planAmountGbp("founding")).toBe(290);
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
});
