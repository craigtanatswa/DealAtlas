import { WebhookPayloadSchema } from "@dodopayments/core/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getServerEnv = vi.hoisted(() => vi.fn());
const storeState = vi.hoisted(() => ({ current: null as unknown }));
const writes = vi.hoisted(() => ({
  insertReceivedEvent: vi.fn(),
  markEvent: vi.fn(),
  upsertCurrentSubscription: vi.fn(),
  grantLifetime: vi.fn(),
  revokeLifetime: vi.fn(),
  revokeSubscription: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({ getServerEnv }));
vi.mock("@/lib/billing/store", () => ({
  createBillingStore: () => storeState.current,
}));
vi.mock("@/lib/billing/config", async () => {
  const fixtures = await import("@/lib/billing/fixtures");
  return { requirePlanProductMap: () => fixtures.BILLING_FIXTURE_PRODUCTS };
});
vi.mock("@/lib/billing/reconcile", () => ({
  reconcileDodoSubscription: vi.fn(async () => null),
  cancelDodoSubscription: vi.fn(async () => {}),
  retrieveDodoPayment: vi.fn(async () => null),
  retrieveDodoPaymentForScope: vi.fn(async () => null),
}));
vi.mock("@/lib/billing/founding-db", () => ({
  syncFoundingSlot: vi.fn(async () => {}),
}));
vi.mock("@/lib/analytics/server", () => ({
  captureServerEvent: vi.fn(async () => {}),
}));

import {
  BILLING_FIXTURE_LIFETIME_PRODUCT_ID,
  BILLING_FIXTURE_PRODUCTS,
  BILLING_FIXTURE_SUBSCRIPTION_ID,
  BILLING_FIXTURE_USER_ID,
  applyBillingEvent,
  billingWebhookFixtures,
  createMemoryBillingStore,
  extractBillingEvent,
  paymentWebhookFixture,
  subscriptionWebhookFixture,
} from "@/lib/billing";
import { getAllowedProductIds } from "@/lib/billing/allowed-products";
import {
  FOREIGN_PRODUCT_WEBHOOK_NOTE,
  classifyEventProductScope,
} from "@/lib/billing/product-scope";
import { processVerifiedDodoWebhook } from "@/lib/billing/process";
import type { StoredSubscription } from "@/lib/billing/types";

const FAKE_ENV = {
  DODO_PRO_MONTHLY_PRODUCT_ID: "pdt_test_monthly",
  DODO_PRO_ANNUAL_PRODUCT_ID: "pdt_test_annual",
  DODO_FOUNDING_PRODUCT_ID: "pdt_test_founding",
  DODO_FOUNDING_LIFETIME_PRODUCT_ID: "pdt_test_lifetime",
  DODO_PRO_ANNUAL_LEGACY_PRODUCT_IDS: "pdt_test_legacy",
};

function fixtureAllowlist(): ReadonlySet<string> {
  return getAllowedProductIds({
    DODO_PRO_MONTHLY_PRODUCT_ID: BILLING_FIXTURE_PRODUCTS.PRO_MONTHLY,
    DODO_PRO_ANNUAL_PRODUCT_ID: BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
    DODO_PRO_ANNUAL_LEGACY_PRODUCT_IDS:
      BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL_LEGACY.join(","),
    DODO_FOUNDING_LIFETIME_PRODUCT_ID: BILLING_FIXTURE_LIFETIME_PRODUCT_ID,
  });
}

function scoped(
  payload: { type: string; data: Record<string, unknown> },
  store: ReturnType<typeof createMemoryBillingStore>,
  allowedProductIds: ReadonlySet<string> = fixtureAllowlist(),
) {
  return classifyEventProductScope({
    eventType: payload.type,
    data: payload.data,
    allowedProductIds,
    store,
  });
}

function storedSubscription(
  overrides: Partial<StoredSubscription> = {},
): StoredSubscription {
  return {
    userId: BILLING_FIXTURE_USER_ID,
    dodoCustomerId: "cus_scope",
    dodoSubscriptionId: "sub_scope",
    dodoProductId: BILLING_FIXTURE_PRODUCTS.PRO_MONTHLY,
    planKey: "PRO_MONTHLY",
    status: "ACTIVE",
    billingInterval: "MONTHLY",
    currentPeriodStart: "2026-06-01T00:00:00.000Z",
    currentPeriodEnd: "2026-07-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    lastProviderEventAt: "2026-06-01T12:00:00.000Z",
    isCurrent: true,
    ...overrides,
  };
}

function assertNoBillingWrites(
  store: ReturnType<typeof createMemoryBillingStore>,
): void {
  expect(store.events.size).toBe(0);
  expect(store.subscriptions).toHaveLength(0);
  expect(store.lifetimeGrants).toHaveLength(0);
}

describe("classifyEventProductScope", () => {
  it("marks a foreign subscription product as foreign without writing", async () => {
    const store = createMemoryBillingStore();
    const payload = subscriptionWebhookFixture("subscription.active", {
      product_id: "pdt_foreign_starter",
    });

    expect(await scoped(payload, store)).toBe("foreign");
    assertNoBillingWrites(store);
  });

  it("marks a foreign product cart on payment.failed as foreign without writing", async () => {
    const store = createMemoryBillingStore();
    const payload = paymentWebhookFixture("payment.failed", {
      status: "failed",
      subscription_id: null,
      product_cart: [{ product_id: "pdt_foreign_starter", quantity: 1 }],
    });

    expect(await scoped(payload, store)).toBe("foreign");
    assertNoBillingWrites(store);
  });

  it("marks a live subscription product as ours and still applies it", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });
    const payload = billingWebhookFixtures.monthlyActive();

    expect(await scoped(payload, store)).toBe("ours");

    const event = extractBillingEvent(
      WebhookPayloadSchema.parse(payload),
      JSON.stringify(payload),
      "evt_live_scope",
      BILLING_FIXTURE_PRODUCTS,
    );
    expect(await applyBillingEvent(event, store)).toEqual({
      outcome: "applied",
    });
    expect(store.subscriptions).toHaveLength(1);
    expect(store.subscriptions[0]?.dodoProductId).toBe(
      BILLING_FIXTURE_PRODUCTS.PRO_MONTHLY,
    );
  });

  it("marks a live lifetime payment cart as ours", async () => {
    const store = createMemoryBillingStore();
    const payload = billingWebhookFixtures.lifetimePayment();

    expect(await scoped(payload, store)).toBe("ours");
  });

  it("marks a missing product id with no known link as foreign", async () => {
    const store = createMemoryBillingStore();

    expect(
      await scoped(
        {
          type: "payment.succeeded",
          data: {
            payment_id: "pay_scope_unknown",
            metadata: {},
            customer: { customer_id: "cus_scope_unknown" },
          },
        },
        store,
      ),
    ).toBe("foreign");
  });

  it("marks a missing product id as ours when the subscription is known", async () => {
    const store = createMemoryBillingStore({
      subscriptions: [storedSubscription()],
    });

    expect(
      await scoped(
        {
          type: "subscription.updated",
          data: { subscription_id: "sub_scope", metadata: {}, customer: {} },
        },
        store,
      ),
    ).toBe("ours");
  });

  it("marks a missing product id as ours when the metadata user exists", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });

    expect(
      await scoped(
        {
          type: "subscription.updated",
          data: {
            metadata: { user_id: BILLING_FIXTURE_USER_ID },
            customer: {},
          },
        },
        store,
      ),
    ).toBe("ours");
  });

  it("keeps a lifetime refund ours and revokes the grant", async () => {
    const store = createMemoryBillingStore({
      lifetimeGrants: [
        {
          userId: BILLING_FIXTURE_USER_ID,
          dodoPaymentId: "pay_dealatlas_lifetime",
          dodoCustomerId: null,
          dodoProductId: BILLING_FIXTURE_LIFETIME_PRODUCT_ID,
          status: "active",
          totalAmount: 25000,
          currency: "GBP",
          grantedAt: "2026-06-01T12:00:00.000Z",
          revokedAt: null,
          revokeReason: null,
          grantEventId: "evt_lifetime_grant",
          revokeEventId: null,
        },
      ],
    });
    const payload = billingWebhookFixtures.lifetimeRefund();

    expect(await scoped(payload, store)).toBe("ours");

    const event = extractBillingEvent(
      WebhookPayloadSchema.parse(payload),
      JSON.stringify(payload),
      "evt_lifetime_refund_scope",
      BILLING_FIXTURE_PRODUCTS,
    );
    expect(await applyBillingEvent(event, store)).toEqual({
      outcome: "applied",
    });
    expect(store.lifetimeGrants[0]?.status).toBe("revoked");
  });

  it("resolves an unknown refund payment through the provider to a known subscription", async () => {
    const store = createMemoryBillingStore({
      subscriptions: [
        storedSubscription({
          dodoCustomerId: "cus_scope_elsewhere",
          dodoSubscriptionId: "sub_scope_remote",
        }),
      ],
    });
    const retrievePayment = vi.fn(async () => ({
      subscriptionId: "sub_scope_remote",
      totalAmount: 25000,
      currency: "GBP",
    }));

    const scope = await classifyEventProductScope({
      eventType: "refund.succeeded",
      data: {
        payment_id: "pay_scope_remote",
        metadata: {},
        customer: { customer_id: "cus_scope_unknown" },
      },
      allowedProductIds: fixtureAllowlist(),
      store,
      retrievePayment,
    });

    expect(scope).toBe("ours");
    expect(retrievePayment).toHaveBeenCalledWith("pay_scope_remote");
  });

  it("marks an unknown refund payment foreign when the provider returns nothing", async () => {
    const store = createMemoryBillingStore();
    const retrievePayment = vi.fn(async () => null);

    const scope = await classifyEventProductScope({
      eventType: "refund.succeeded",
      data: {
        payment_id: "pay_scope_unknown",
        metadata: {},
        customer: { customer_id: "cus_scope_unknown" },
      },
      allowedProductIds: fixtureAllowlist(),
      store,
      retrievePayment,
    });

    expect(scope).toBe("foreign");
    expect(retrievePayment).toHaveBeenCalledWith("pay_scope_unknown");
  });

  it("uses the provider cart before the subscription for an unknown refund", async () => {
    const store = createMemoryBillingStore({
      subscriptions: [
        storedSubscription({ dodoSubscriptionId: "sub_scope_remote" }),
      ],
    });
    const data = {
      payment_id: "pay_scope_remote",
      metadata: {},
      customer: { customer_id: "cus_scope_unknown" },
    };

    const allowlisted = await classifyEventProductScope({
      eventType: "refund.succeeded",
      data,
      allowedProductIds: fixtureAllowlist(),
      store,
      retrievePayment: vi.fn(async () => ({
        subscriptionId: "sub_scope_unknown",
        totalAmount: 25000,
        currency: "GBP",
        productIds: [BILLING_FIXTURE_PRODUCTS.PRO_MONTHLY],
      })),
    });
    expect(allowlisted).toBe("ours");

    const foreign = await classifyEventProductScope({
      eventType: "refund.succeeded",
      data,
      allowedProductIds: fixtureAllowlist(),
      store,
      retrievePayment: vi.fn(async () => ({
        subscriptionId: "sub_scope_remote",
        totalAmount: 25000,
        currency: "GBP",
        productIds: ["pdt_foreign_starter"],
      })),
    });
    expect(foreign).toBe("foreign");
  });

  it("uses the provider subscription when the refund cart is empty", async () => {
    const store = createMemoryBillingStore({
      subscriptions: [
        storedSubscription({ dodoSubscriptionId: "sub_scope_remote" }),
      ],
    });
    const retrievePayment = vi.fn(async () => ({
      subscriptionId: "sub_scope_remote",
      totalAmount: 25000,
      currency: "GBP",
      productIds: [],
    }));

    const scope = await classifyEventProductScope({
      eventType: "refund.succeeded",
      data: {
        payment_id: "pay_scope_remote",
        metadata: {},
        customer: { customer_id: "cus_scope_unknown" },
      },
      allowedProductIds: fixtureAllowlist(),
      store,
      retrievePayment,
    });

    expect(scope).toBe("ours");
    expect(retrievePayment).toHaveBeenCalledWith("pay_scope_remote");
  });

  it("fails safe to ours when a lookup throws", async () => {
    const store = createMemoryBillingStore();
    vi.spyOn(store, "profileExists").mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    expect(
      await scoped(
        {
          type: "subscription.updated",
          data: {
            metadata: { user_id: BILLING_FIXTURE_USER_ID },
            customer: {},
          },
        },
        store,
      ),
    ).toBe("ours");
  });

  it("treats every product id as foreign when the allowlist is empty", async () => {
    const store = createMemoryBillingStore();
    const empty = getAllowedProductIds({});
    expect(empty.size).toBe(0);

    expect(
      await scoped(billingWebhookFixtures.monthlyActive(), store, empty),
    ).toBe("foreign");
  });

  it("uses the deployment allowlist helper for a configured fake product", async () => {
    const store = createMemoryBillingStore();

    expect(
      await scoped(
        {
          type: "subscription.active",
          data: {
            product_id: "pdt_test_monthly",
            metadata: {},
            customer: {},
          },
        },
        store,
        getAllowedProductIds(FAKE_ENV),
      ),
    ).toBe("ours");
  });
});

describe("processVerifiedDodoWebhook product scope", () => {
  function spyStore() {
    return {
      getEvent: vi.fn(async () => null),
      insertReceivedEvent: writes.insertReceivedEvent,
      markEvent: writes.markEvent,
      profileExists: vi.fn(async () => false),
      getSubscriptionByDodoId: vi.fn(async () => null),
      getSubscriptionByCustomerId: vi.fn(async () => null),
      getCurrentSubscription: vi.fn(async () => null),
      upsertCurrentSubscription: writes.upsertCurrentSubscription,
      grantLifetime: writes.grantLifetime,
      revokeLifetime: writes.revokeLifetime,
      revokeSubscription: writes.revokeSubscription,
      getPaymentFacts: vi.fn(async () => null),
      getLifetimeGrantByPayment: vi.fn(async () => null),
    };
  }

  beforeEach(() => {
    storeState.current = spyStore();
    getServerEnv.mockReset();
    getServerEnv.mockReturnValue({
      DODO_PRO_MONTHLY_PRODUCT_ID: BILLING_FIXTURE_PRODUCTS.PRO_MONTHLY,
      DODO_PRO_ANNUAL_PRODUCT_ID: BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
      DODO_FOUNDING_LIFETIME_PRODUCT_ID: BILLING_FIXTURE_LIFETIME_PRODUCT_ID,
    });
    for (const spy of Object.values(writes)) {
      spy.mockReset();
    }
  });

  it("acknowledges and ignores a foreign product with no store writes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const payload = subscriptionWebhookFixture("subscription.active", {
        product_id: "pdt_foreign_starter",
      });

      const result = await processVerifiedDodoWebhook({
        payload: WebhookPayloadSchema.parse(payload),
        rawBody: JSON.stringify(payload),
        webhookId: "evt_foreign_scope",
      });

      expect(result).toEqual({ outcome: "ignored" });
      for (const spy of Object.values(writes)) {
        expect(spy).not.toHaveBeenCalled();
      }

      expect(warn).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(
        String(warn.mock.calls[0]?.[0]),
      ) as Record<string, unknown>;
      expect(logged.level).toBe("warn");
      expect(logged.msg).toBe(FOREIGN_PRODUCT_WEBHOOK_NOTE);
      expect(logged.event).toBe("dodo_webhook_foreign_product");
      expect(logged.eventType).toBe("subscription.active");
      expect(logged.job).toBe("dodo-webhook");
      expect(Object.keys(logged).sort()).toEqual(
        ["event", "eventType", "job", "level", "msg", "ts"].sort(),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("applies an allowlisted subscription renewal and stores it", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });
    storeState.current = store;
    const payload = subscriptionWebhookFixture("subscription.renewed", {
      product_id: BILLING_FIXTURE_PRODUCTS.PRO_MONTHLY,
    });

    expect(await scoped(payload, store)).toBe("ours");

    const result = await processVerifiedDodoWebhook({
      payload: WebhookPayloadSchema.parse(payload),
      rawBody: JSON.stringify(payload),
      webhookId: "evt_scope_renewed",
    });

    expect(result).toEqual({ outcome: "applied" });
    expect(store.events.get("evt_scope_renewed")?.status).toBe("PROCESSED");
    expect(store.subscriptions).toHaveLength(1);
    expect(store.subscriptions[0]?.dodoSubscriptionId).toBe(
      BILLING_FIXTURE_SUBSCRIPTION_ID,
    );
  });

  it("processes a renewal payment without a product cart when the subscription is known", async () => {
    const store = createMemoryBillingStore({
      subscriptions: [storedSubscription()],
    });
    storeState.current = store;
    const payload = paymentWebhookFixture("payment.succeeded", {
      subscription_id: "sub_scope",
      product_cart: null,
    });

    expect(await scoped(payload, store)).toBe("ours");

    const result = await processVerifiedDodoWebhook({
      payload: WebhookPayloadSchema.parse(payload),
      rawBody: JSON.stringify(payload),
      webhookId: "evt_scope_renewal_payment",
    });

    expect(result).toEqual({ outcome: "ignored" });
    expect(store.events.get("evt_scope_renewal_payment")?.status).toBe(
      "PROCESSED",
    );
  });
});
