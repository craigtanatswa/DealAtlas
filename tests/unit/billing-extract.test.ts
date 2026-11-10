import { describe, expect, it } from "vitest";

import {
  WebhookPayloadSchema,
  type WebhookPayload,
} from "@dodopayments/core/schemas";

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

describe("dispute reversal is decided by event type", () => {
  function disputeWithoutStatus(type: string) {
    const payload = billingWebhookFixtures.lifetimeDispute(type, {
      payment_id: "pay_lifetime_1",
    });
    delete payload.data.dispute_status;
    return extractBillingEvent(
      // The provider schema requires dispute_status; this test proves the
      // extractor still decides by event type when a payload omits it.
      payload as unknown as WebhookPayload,
      JSON.stringify(payload),
      `evt_${type}`,
      BILLING_FIXTURE_PRODUCTS,
    );
  }

  it.each([
    "dispute.opened",
    "dispute.challenged",
    "dispute.accepted",
    "dispute.lost",
  ])("reverses on %s even when dispute_status is missing", (type) => {
    expect(disputeWithoutStatus(type).reversal).toEqual({
      paymentId: "pay_lifetime_1",
      kind: "dispute",
    });
  });

  it.each(["dispute.won", "dispute.cancelled", "dispute.expired"])(
    "records and ignores %s without a reversal",
    (type) => {
      expect(disputeWithoutStatus(type).reversal).toBeNull();
    },
  );
});
