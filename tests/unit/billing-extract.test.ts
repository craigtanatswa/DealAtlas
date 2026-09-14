import { describe, expect, it } from "vitest";

import { WebhookPayloadSchema } from "@dodopayments/core/schemas";

import {
  BILLING_FIXTURE_PRODUCTS,
  BILLING_FIXTURE_USER_ID,
  billingWebhookFixtures,
  extractBillingEvent,
} from "@/lib/billing";

function extract(payload: ReturnType<typeof billingWebhookFixtures.monthlyActive>) {
  const rawBody = JSON.stringify(payload);
  return extractBillingEvent(
    WebhookPayloadSchema.parse(payload),
    rawBody,
    "evt_fixture",
    BILLING_FIXTURE_PRODUCTS,
  );
}

describe("billing webhook extract", () => {
  it("parses official subscription fixture payloads", () => {
    for (const fixture of [
      billingWebhookFixtures.monthlyActive(),
      billingWebhookFixtures.annualActive(),
      billingWebhookFixtures.renewed(),
      billingWebhookFixtures.onHold(),
      billingWebhookFixtures.cancelledPeriodEnd(),
      billingWebhookFixtures.failed(),
      billingWebhookFixtures.expired(),
      billingWebhookFixtures.planChangedAnnual(),
      billingWebhookFixtures.paymentSucceeded(),
      billingWebhookFixtures.paymentFailed(),
    ]) {
      const parsed = WebhookPayloadSchema.safeParse(fixture);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
  });

  it("maps monthly active metadata to the authenticated user", () => {
    const event = extract(billingWebhookFixtures.monthlyActive());
    expect(event.providerEventId).toBe("evt_fixture");
    expect(event.subscription?.userId).toBe(BILLING_FIXTURE_USER_ID);
    expect(event.subscription?.planKey).toBe("PRO_MONTHLY");
    expect(event.subscription?.status).toBe("ACTIVE");
    expect(event.subscription?.productKnown).toBe(true);
  });

  it("does not treat unknown products as Pro", () => {
    const event = extract(billingWebhookFixtures.unknownProduct());
    expect(event.subscription?.productKnown).toBe(false);
    expect(event.subscription?.status).toBe("UNKNOWN");
  });
});
