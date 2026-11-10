import { describe, expect, it } from "vitest";
import { WebhookPayloadSchema } from "@dodopayments/core/schemas";

import {
  BILLING_FIXTURE_PRODUCTS,
  BILLING_FIXTURE_USER_ID,
  applyBillingEvent,
  billingWebhookFixtures,
  createMemoryBillingStore,
  extractBillingEvent,
} from "@/lib/billing";
import { buildCheckoutSessionBody } from "@/lib/billing/checkout-session";
import { FOUNDING_COPY, FOUNDING_FULL_MESSAGE } from "@/lib/billing/founding-ui";
import {
  FOUNDING_NOT_ELIGIBLE_MESSAGE,
  FOUNDING_UNAVAILABLE_MESSAGE,
} from "@/lib/billing/founding";
import {
  LIFETIME_DUPLICATE_USER_FLAG,
  LIFETIME_OVER_CAP_FLAG,
} from "@/lib/billing/apply";
import { planLabel, priceLabel } from "@/lib/billing/display";
import {
  isLifetimeProduct,
  parseCheckoutRequest,
  selectCheckoutProduct,
  shouldReserveFoundingSlot,
} from "@/lib/billing/plans";
import type { PlanProductMap } from "@/lib/billing/types";
import { liveDodoConfigErrors } from "@/lib/env/production";
import { resolveEntitlement } from "@/lib/entitlements/policy";
import {
  ENTITLEMENT_FIXTURE_ALLOWLIST,
  ENTITLEMENT_FIXTURE_NOW,
  ENTITLEMENT_FIXTURE_PRODUCT_ID,
  createSubscriptionFixture,
} from "@/lib/entitlements/fixtures";

const products: PlanProductMap = {
  ...BILLING_FIXTURE_PRODUCTS,
  FOUNDING_LIFETIME: "pdt_lifetime_fixture",
};

function extract(payload: Record<string, unknown>) {
  return extractBillingEvent(
    WebhookPayloadSchema.parse(payload),
    JSON.stringify(payload),
    null,
    products,
  );
}

function lifetimeGrantEvent(paymentId = "pay_lifetime_1", userId = BILLING_FIXTURE_USER_ID) {
  return extract(
    billingWebhookFixtures.lifetimePayment({
      payment_id: paymentId,
      subscription_id: null,
      product_cart: [{ product_id: products.FOUNDING_LIFETIME, quantity: 1 }],
      metadata: { user_id: userId, plan_key: "founding_lifetime" },
    }),
  );
}

describe("lifetime checkout", () => {
  it("offers lifetime through its own plan key and never falls back to annual", () => {
    expect(parseCheckoutRequest({ planKey: "founding_lifetime" })).toEqual({
      ok: true,
      planKey: "founding_lifetime",
    });
    expect(parseCheckoutRequest({ planKey: "FOUNDING" }).ok).toBe(false);
    expect(shouldReserveFoundingSlot("founding_lifetime", products)).toBe(true);
    expect(
      selectCheckoutProduct({
        planKey: "founding_lifetime",
        products,
        reservation: "reserved",
      }),
    ).toEqual({
      ok: true,
      productId: products.FOUNDING_LIFETIME,
      founding: true,
    });
    expect(isLifetimeProduct(products.FOUNDING_LIFETIME, products)).toBe(true);
    expect(isLifetimeProduct(products.PRO_ANNUAL, products)).toBe(false);
  });

  it("builds a one-time checkout session with lifetime metadata", () => {
    const body = buildCheckoutSessionBody({
      planKey: "founding_lifetime",
      products,
      userId: BILLING_FIXTURE_USER_ID,
      email: "buyer@example.com",
      returnUrl: "https://www.dealatlas.example/checkout/success",
    });
    expect(body.product_cart).toEqual([
      { product_id: products.FOUNDING_LIFETIME, quantity: 1 },
    ]);
    expect(body.metadata).toEqual({
      user_id: BILLING_FIXTURE_USER_ID,
      plan_key: "founding_lifetime",
    });
    expect(body.subscription_data).toBeUndefined();
    expect(body.billing_currency).toBe("GBP");
  });

  it("has lifetime customer copy without founding wording", () => {
    const copy = JSON.stringify(FOUNDING_COPY);
    expect(copy).not.toMatch(/founding/i);
    expect(FOUNDING_UNAVAILABLE_MESSAGE).not.toMatch(/founding/i);
    expect(FOUNDING_NOT_ELIGIBLE_MESSAGE).not.toMatch(/founding/i);
    expect(FOUNDING_FULL_MESSAGE).toBe(FOUNDING_UNAVAILABLE_MESSAGE);
    expect(priceLabel("founding_lifetime")).toBe("£250 one-time");
    expect(planLabel("founding_lifetime", null, true, "lifetime")).toBe(
      "Pro Lifetime deal",
    );
    expect(planLabel("PRO_ANNUAL", "ANNUAL", true)).toBe("Pro annual");
  });
});

describe("lifetime webhook extraction and application", () => {
  it("extracts the one-time payment and records the lifetime term", () => {
    const event = lifetimeGrantEvent();
    expect(event.payment).toMatchObject({
      paymentId: "pay_lifetime_1",
      subscriptionId: null,
      succeeded: true,
      lifetime: true,
      lifetimeProductId: products.FOUNDING_LIFETIME,
      userId: BILLING_FIXTURE_USER_ID,
      planKey: "founding_lifetime",
      totalAmount: 25000,
    });
    expect(event.reversal).toBeNull();
  });

  it("grants once and treats a replay as a duplicate", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });
    const event = lifetimeGrantEvent();
    expect(await applyBillingEvent(event, store)).toEqual({
      outcome: "applied",
    });
    expect(store.lifetimeGrants).toHaveLength(1);
    expect(store.foundingSlots).toEqual([
      { userId: BILLING_FIXTURE_USER_ID, status: "active" },
    ]);
    expect(await applyBillingEvent(event, store)).toEqual({
      outcome: "duplicate",
    });
    expect(store.lifetimeGrants).toHaveLength(1);
  });

  it("does not grant a lifetime payment without a resolvable profile", async () => {
    const store = createMemoryBillingStore();
    expect(await applyBillingEvent(lifetimeGrantEvent(), store)).toEqual({
      outcome: "unresolved",
    });
    expect(store.lifetimeGrants).toHaveLength(0);
  });

  it("still grants after the cap and keeps the extra out of the slots", async () => {
    const users = Array.from(
      { length: 26 },
      (_, index) =>
        `a0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );
    const store = createMemoryBillingStore({ profileIds: users });
    const applied: Array<{ providerEventId: string }> = [];
    for (const [index, userId] of users.entries()) {
      const event = lifetimeGrantEvent(`pay_cap_${index}`, userId);
      expect(await applyBillingEvent(event, store)).toEqual({
        outcome: "applied",
      });
      applied.push(event);
    }
    expect(store.lifetimeGrants).toHaveLength(26);
    expect(store.foundingSlots).toHaveLength(25);
    expect(store.foundingCapFallbacks).toHaveLength(1);

    const overCap = applied[25]!;
    expect(store.events.get(overCap.providerEventId)).toMatchObject({
      status: "PROCESSED",
      processingError: LIFETIME_OVER_CAP_FLAG,
    });
    expect(store.events.get(applied[0]!.providerEventId)?.processingError).toBeNull();
    expect(LIFETIME_OVER_CAP_FLAG).not.toContain(users[25]!);
  });

  it("flags a second lifetime payment for the same user for refund review", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });
    expect(await applyBillingEvent(lifetimeGrantEvent("pay_first"), store)).toEqual({
      outcome: "applied",
    });

    const second = lifetimeGrantEvent("pay_second");
    expect(await applyBillingEvent(second, store)).toEqual({
      outcome: "applied",
    });
    expect(store.lifetimeGrants).toHaveLength(1);
    expect(store.events.get(second.providerEventId)).toMatchObject({
      status: "PROCESSED",
      processingError: LIFETIME_DUPLICATE_USER_FLAG,
    });
    expect(LIFETIME_DUPLICATE_USER_FLAG).not.toContain(BILLING_FIXTURE_USER_ID);
  });

  it("revokes on refund and does not re-grant a replay after the refund", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });
    await applyBillingEvent(lifetimeGrantEvent(), store);

    const refund = extract(
      billingWebhookFixtures.lifetimeRefund({
        payment_id: "pay_lifetime_1",
      }),
    );
    expect(refund.reversal).toEqual({
      paymentId: "pay_lifetime_1",
      kind: "refund",
    });
    expect(await applyBillingEvent(refund, store)).toEqual({
      outcome: "applied",
    });
    expect(store.lifetimeGrants[0]?.status).toBe("revoked");
    expect(store.foundingSlots[0]?.status).toBe("ended");
    expect(await applyBillingEvent(refund, store)).toEqual({
      outcome: "duplicate",
    });

    const replay = lifetimeGrantEvent();
    replay.providerEventId = "evt_lifetime_replay_after_refund";
    expect(await applyBillingEvent(replay, store)).toEqual({
      outcome: "duplicate",
    });
    expect(store.lifetimeGrants[0]?.status).toBe("revoked");
  });

  it("revokes on a lost dispute but records and ignores a won dispute", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });
    await applyBillingEvent(lifetimeGrantEvent(), store);

    const won = extract(
      billingWebhookFixtures.lifetimeDispute("dispute.won", {
        payment_id: "pay_lifetime_1",
        dispute_status: "dispute_won",
      }),
    );
    expect(won.reversal).toBeNull();
    expect(await applyBillingEvent(won, store)).toEqual({ outcome: "ignored" });
    expect(store.lifetimeGrants[0]?.status).toBe("active");

    const lost = extract(
      billingWebhookFixtures.lifetimeDispute("dispute.lost", {
        payment_id: "pay_lifetime_1",
        dispute_status: "dispute_lost",
      }),
    );
    expect(lost.reversal).toEqual({
      paymentId: "pay_lifetime_1",
      kind: "dispute",
    });
    expect(await applyBillingEvent(lost, store)).toEqual({
      outcome: "applied",
    });
    expect(store.lifetimeGrants[0]?.status).toBe("revoked");
  });

  it("ignores a refund for a payment with no lifetime grant", async () => {
    const store = createMemoryBillingStore();
    const refund = extract(
      billingWebhookFixtures.lifetimeRefund({ payment_id: "pay_unknown" }),
    );
    expect(await applyBillingEvent(refund, store)).toEqual({
      outcome: "ignored",
    });
  });
});

describe("lifetime entitlement", () => {
  const lifetime = {
    status: "active" as const,
    dodoProductId: products.FOUNDING_LIFETIME ?? null,
    grantedAt: "2026-06-01T00:00:00.000Z",
  };

  it("grants Pro for lifetime regardless of subscription period", () => {
    const entitlement = resolveEntitlement(
      createSubscriptionFixture({
        status: "EXPIRED",
        currentPeriodEnd: "2025-01-01T00:00:00.000Z",
      }),
      ENTITLEMENT_FIXTURE_NOW,
      new Set([products.FOUNDING_LIFETIME!]),
      lifetime,
    );
    expect(entitlement).toEqual({
      plan: "PRO",
      status: "ACTIVE",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      billingInterval: null,
      planKey: "founding_lifetime",
      term: "lifetime",
    });
  });

  it("fails closed for an unknown lifetime product or revoked grant", () => {
    expect(
      resolveEntitlement(
        null,
        ENTITLEMENT_FIXTURE_NOW,
        ENTITLEMENT_FIXTURE_ALLOWLIST,
        lifetime,
      ).plan,
    ).toBe("FREE");
    expect(
      resolveEntitlement(null, ENTITLEMENT_FIXTURE_NOW, new Set(), {
        ...lifetime,
        dodoProductId: ENTITLEMENT_FIXTURE_PRODUCT_ID,
      }).plan,
    ).toBe("FREE");
    expect(
      resolveEntitlement(
        null,
        ENTITLEMENT_FIXTURE_NOW,
        new Set([products.FOUNDING_LIFETIME!]),
        { ...lifetime, status: "revoked" },
      ).plan,
    ).toBe("FREE");
  });

  it("keeps the subscription term when there is no lifetime grant", () => {
    const entitlement = resolveEntitlement(
      createSubscriptionFixture(),
      ENTITLEMENT_FIXTURE_NOW,
      ENTITLEMENT_FIXTURE_ALLOWLIST,
      null,
    );
    expect(entitlement.term).toBe("monthly");
    expect(entitlement.plan).toBe("PRO");
  });
});

describe("lifetime live environment", () => {
  const live = {
    DODO_PAYMENTS_ENVIRONMENT: "live_mode" as const,
    DODO_PAYMENTS_API_KEY: "dodo_live_prod_key",
    DODO_PAYMENTS_WEBHOOK_KEY: "whsec_live_example_secret",
    DODO_PAYMENTS_RETURN_URL: "https://www.dealatlas.example/checkout/success",
    DODO_PRO_MONTHLY_PRODUCT_ID: "pdt_0Npk9UeAQUpFBQDttq6lS",
    DODO_PRO_ANNUAL_PRODUCT_ID: "pdt_1Npk9UeAQUpFBQDttq6lS",
    DODO_FOUNDING_PRODUCT_ID: "pdt_2Npk9UeAQUpFBQDttq6lS",
  };

  it("leaves lifetime optional and accepts a distinct live id", () => {
    expect(liveDodoConfigErrors(live)).toEqual([]);
    expect(
      liveDodoConfigErrors({
        ...live,
        DODO_FOUNDING_LIFETIME_PRODUCT_ID: "pdt_3Npk9UeAQUpFBQDttq6lS",
      }),
    ).toEqual([]);
  });

  it("rejects malformed, fixture, or reused lifetime ids", () => {
    expect(
      liveDodoConfigErrors({
        ...live,
        DODO_FOUNDING_LIFETIME_PRODUCT_ID: "pdt_short",
      }).join("\n"),
    ).toMatch(/DODO_FOUNDING_LIFETIME_PRODUCT_ID/);
    expect(
      liveDodoConfigErrors({
        ...live,
        DODO_FOUNDING_LIFETIME_PRODUCT_ID: "pdt_dealatlas_founding_lifetime",
      }).join("\n"),
    ).toMatch(/DODO_FOUNDING_LIFETIME_PRODUCT_ID/);
    expect(
      liveDodoConfigErrors({
        ...live,
        DODO_FOUNDING_LIFETIME_PRODUCT_ID: live.DODO_FOUNDING_PRODUCT_ID,
      }).join("\n"),
    ).toMatch(/must not reuse another product id/);
  });
});
