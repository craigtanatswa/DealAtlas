import { describe, expect, it, vi } from "vitest";

import { WebhookPayloadSchema } from "@dodopayments/core/schemas";

import {
  BILLING_FIXTURE_PRODUCTS,
  BILLING_FIXTURE_SUBSCRIPTION_ID,
  BILLING_FIXTURE_USER_ID,
  applyBillingEvent,
  billingWebhookFixtures,
  createMemoryBillingStore,
  disputeWebhookFixture,
  extractBillingEvent,
  paymentWebhookFixture,
  refundWebhookFixture,
} from "@/lib/billing";
import {
  DISPUTE_LOG_ONLY_NOTE,
  DISPUTE_NO_ACTION_NOTE,
  SUBSCRIPTION_ALREADY_REVOKED_NOTE,
  SUBSCRIPTION_CANCEL_FAILED_FLAG,
  SUBSCRIPTION_PARTIAL_REFUND_NOTE,
  SUBSCRIPTION_REFUND_REVIEW_FLAG,
  SUBSCRIPTION_REVERSAL_UNRESOLVED_FLAG,
  SUBSCRIPTION_REVOKED_TERMINAL_NOTE,
} from "@/lib/billing/apply";
import {
  ENTITLEMENT_FIXTURE_NOW,
  resolveEntitlement,
} from "@/lib/entitlements";

const PAYMENT_ID = "pay_dealatlas_fixture";
const MONTHLY_TOTAL = 3900;

type Store = ReturnType<typeof createMemoryBillingStore>;

function incoming(payload: Record<string, unknown>, webhookId: string) {
  return extractBillingEvent(
    WebhookPayloadSchema.parse(payload),
    JSON.stringify(payload),
    webhookId,
    BILLING_FIXTURE_PRODUCTS,
  );
}

function incomingRaw(payload: Record<string, unknown>, webhookId: string) {
  return extractBillingEvent(
    payload as unknown as Parameters<typeof extractBillingEvent>[0],
    JSON.stringify(payload),
    webhookId,
    BILLING_FIXTURE_PRODUCTS,
  );
}

function incomingAt(
  payload: Record<string, unknown>,
  webhookId: string,
  timestamp: string,
) {
  return incoming({ ...payload, timestamp }, webhookId);
}

function fixtureAllowlist(): ReadonlySet<string> {
  return new Set([
    BILLING_FIXTURE_PRODUCTS.PRO_MONTHLY,
    BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
    ...BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL_LEGACY,
    ...(BILLING_FIXTURE_PRODUCTS.FOUNDING_ANNUAL
      ? [BILLING_FIXTURE_PRODUCTS.FOUNDING_ANNUAL]
      : []),
  ]);
}

function entitlementFromStore(store: Store) {
  const row = store.subscriptions.find((item) => item.isCurrent) ?? null;
  if (!row) {
    return resolveEntitlement(null, ENTITLEMENT_FIXTURE_NOW, fixtureAllowlist());
  }
  return resolveEntitlement(
    {
      userId: row.userId,
      isCurrent: row.isCurrent,
      status: row.status,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      currentPeriodStart: row.currentPeriodStart,
      currentPeriodEnd: row.currentPeriodEnd,
      planKey: row.planKey,
      billingInterval: row.billingInterval,
      dodoProductId: row.dodoProductId,
      revokedAt: row.revokedAt,
    },
    ENTITLEMENT_FIXTURE_NOW,
    fixtureAllowlist(),
  );
}

async function seedPayment(
  store: Store,
  options: {
    paymentId?: string;
    subscriptionId?: string;
    totalAmount?: number;
    currency?: string;
    webhookId?: string;
  } = {},
) {
  const event = incoming(
    paymentWebhookFixture("payment.succeeded", {
      payment_id: options.paymentId ?? PAYMENT_ID,
      subscription_id: options.subscriptionId ?? BILLING_FIXTURE_SUBSCRIPTION_ID,
      total_amount: options.totalAmount ?? MONTHLY_TOTAL,
      currency: options.currency ?? "GBP",
      metadata: {},
    }),
    options.webhookId ?? "evt_payment_succeeded",
  );
  await applyBillingEvent(event, store);
  return event;
}

async function activeStore(options: { seedPayment?: boolean } = {}) {
  const store = createMemoryBillingStore({
    profileIds: [BILLING_FIXTURE_USER_ID],
  });
  expect(
    await applyBillingEvent(
      incomingAt(
        billingWebhookFixtures.monthlyActive(),
        "evt_active",
        "2026-06-01T12:00:00.000Z",
      ),
      store,
    ),
  ).toEqual({ outcome: "applied" });
  expect(entitlementFromStore(store).plan).toBe("PRO");
  if (options.seedPayment !== false) {
    await seedPayment(store);
  }
  return store;
}

function subscriptionRefund(overrides: Record<string, unknown> = {}) {
  return refundWebhookFixture("refund.succeeded", {
    payment_id: PAYMENT_ID,
    refund_id: "ref_dealatlas_fixture",
    amount: MONTHLY_TOTAL,
    currency: "GBP",
    is_partial: false,
    metadata: {},
    ...overrides,
  }) as Record<string, unknown>;
}

function realDispute(eventType: string, overrides: Record<string, unknown> = {}) {
  const payload = disputeWebhookFixture(eventType, {
    amount: String(MONTHLY_TOTAL),
    currency: "GBP",
    payment_id: PAYMENT_ID,
    dispute_id: `dsp_${eventType.replace(/\W/g, "_")}`,
    ...overrides,
  });
  const data = { ...payload.data };
  delete data.customer;
  delete data.subscription_id;
  return { ...payload, data } as Record<string, unknown>;
}

describe("subscription refund and chargeback revocation", () => {
  it("resolves a refund from the stored payment.succeeded event before provider lookup", async () => {
    const store = await activeStore();
    const cancel = vi.fn(async () => {});
    const retrievePayment = vi.fn(async () => null);

    const event = incoming(subscriptionRefund(), "evt_refund_local_payment");
    expect(
      await applyBillingEvent(event, store, {
        cancelSubscription: cancel,
        retrievePayment,
      }),
    ).toEqual({ outcome: "applied" });

    expect(entitlementFromStore(store).plan).toBe("FREE");
    expect(retrievePayment).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(BILLING_FIXTURE_SUBSCRIPTION_ID);
  });

  it("revokes Pro and cancels Dodo once for a full refund", async () => {
    const store = await activeStore();
    const cancel = vi.fn(async () => {});
    const event = incoming(subscriptionRefund(), "evt_refund_full");

    expect(
      await applyBillingEvent(event, store, { cancelSubscription: cancel }),
    ).toEqual({ outcome: "applied" });
    expect(entitlementFromStore(store).plan).toBe("FREE");

    const row = store.subscriptions[0];
    expect(row?.status).toBe("EXPIRED");
    expect(row?.revokedAt).toBeTruthy();
    expect(row?.revokeReason).toBe("refund");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(BILLING_FIXTURE_SUBSCRIPTION_ID);

    // Same webhook id: duplicate, no second provider cancel.
    expect(
      await applyBillingEvent(event, store, { cancelSubscription: cancel }),
    ).toEqual({ outcome: "duplicate" });
    // New webhook, same refund id: the durable refund identity is still a duplicate.
    expect(
      await applyBillingEvent(
        incoming(subscriptionRefund(), "evt_refund_full_retry"),
        store,
        { cancelSubscription: cancel },
      ),
    ).toEqual({ outcome: "duplicate" });
    // New refund id but the subscription is already revoked: no re-cancel.
    const secondRefund = incoming(
      subscriptionRefund({ refund_id: "ref_second_fixture" }),
      "evt_refund_second",
    );
    expect(
      await applyBillingEvent(secondRefund, store, {
        cancelSubscription: cancel,
      }),
    ).toEqual({ outcome: "ignored" });
    expect(store.events.get(secondRefund.providerEventId)?.processingError).toBe(
      SUBSCRIPTION_ALREADY_REVOKED_NOTE,
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("revokes an annual subscription when the refund matches the payment total", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });
    await applyBillingEvent(
      incomingAt(
        billingWebhookFixtures.annualActive(),
        "evt_annual",
        "2026-06-01T12:00:00.000Z",
      ),
      store,
    );
    await seedPayment(store, {
      totalAmount: 5000,
      webhookId: "evt_annual_payment",
    });

    const cancel = vi.fn(async () => {});
    await applyBillingEvent(
      incoming(subscriptionRefund({ amount: 5000 }), "evt_refund_annual"),
      store,
      { cancelSubscription: cancel },
    );

    expect(entitlementFromStore(store).plan).toBe("FREE");
    expect(store.subscriptions[0]).toMatchObject({
      status: "EXPIRED",
      revokeReason: "refund",
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("classifies against the tax-inclusive payment total, not pre-tax recurring amount", async () => {
    const store = await activeStore();
    const cancel = vi.fn(async () => {});

    const event = incoming(
      subscriptionRefund({ amount: 3300 }),
      "evt_refund_partial_tax_inclusive",
    );
    await applyBillingEvent(event, store, { cancelSubscription: cancel });

    expect(entitlementFromStore(store).plan).toBe("PRO");
    expect(store.subscriptions[0]?.revokedAt).toBeNull();
    expect(store.events.get(event.providerEventId)?.processingError).toBe(
      SUBSCRIPTION_PARTIAL_REFUND_NOTE,
    );
    expect(cancel).not.toHaveBeenCalled();
  });

  it("keeps Pro for a partial refund without cancelling", async () => {
    const store = await activeStore();
    const cancel = vi.fn(async () => {});

    const event = incoming(
      subscriptionRefund({ amount: 1000 }),
      "evt_refund_partial",
    );
    await applyBillingEvent(event, store, { cancelSubscription: cancel });

    expect(entitlementFromStore(store).plan).toBe("PRO");
    expect(store.subscriptions[0]?.revokedAt).toBeNull();
    expect(store.events.get(event.providerEventId)?.processingError).toBe(
      SUBSCRIPTION_PARTIAL_REFUND_NOTE,
    );
    expect(cancel).not.toHaveBeenCalled();
  });

  it("keeps Pro and flags review when the refund currency cannot be compared", async () => {
    const store = await activeStore();
    const cancel = vi.fn(async () => {});

    const event = incoming(
      subscriptionRefund({ amount: MONTHLY_TOTAL, currency: "USD" }),
      "evt_refund_unknown",
    );
    await applyBillingEvent(event, store, { cancelSubscription: cancel });

    expect(entitlementFromStore(store).plan).toBe("PRO");
    expect(store.subscriptions[0]?.revokedAt).toBeNull();
    expect(store.events.get(event.providerEventId)?.processingError).toBe(
      SUBSCRIPTION_REFUND_REVIEW_FLAG,
    );
    expect(cancel).not.toHaveBeenCalled();
  });

  it("falls back to a read-only provider payment lookup when no local event exists", async () => {
    const store = await activeStore({ seedPayment: false });
    const cancel = vi.fn(async () => {});
    const retrievePayment = vi.fn(async () => ({
      subscriptionId: BILLING_FIXTURE_SUBSCRIPTION_ID,
      totalAmount: MONTHLY_TOTAL,
      currency: "GBP",
    }));

    await applyBillingEvent(
      incoming(subscriptionRefund(), "evt_refund_provider_lookup"),
      store,
      { cancelSubscription: cancel, retrievePayment },
    );

    expect(retrievePayment).toHaveBeenCalledWith(PAYMENT_ID);
    expect(entitlementFromStore(store).plan).toBe("FREE");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("does not revoke, flag and never cancels when the payment cannot be resolved", async () => {
    const store = await activeStore({ seedPayment: false });
    const cancel = vi.fn(async () => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const retrievePayment = vi.fn(async () => {
      throw new Error("provider unavailable");
    });

    const event = incoming(
      subscriptionRefund(),
      "evt_refund_unresolvable_payment",
    );
    try {
      expect(
        await applyBillingEvent(event, store, {
          cancelSubscription: cancel,
          retrievePayment,
        }),
      ).toEqual({ outcome: "ignored" });
    } finally {
      warn.mockRestore();
    }

    expect(entitlementFromStore(store).plan).toBe("PRO");
    expect(store.subscriptions[0]?.revokedAt).toBeNull();
    expect(store.events.get(event.providerEventId)).toMatchObject({
      status: "PROCESSED",
      processingError: SUBSCRIPTION_REVERSAL_UNRESOLVED_FLAG,
    });
    expect(cancel).not.toHaveBeenCalled();
    expect(retrievePayment).toHaveBeenCalledWith(PAYMENT_ID);
  });

  it("flags review without cancelling when no payment lookup is available", async () => {
    const store = await activeStore({ seedPayment: false });
    const cancel = vi.fn(async () => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const event = incoming(
      subscriptionRefund({ refund_id: "ref_no_lookup_fixture" }),
      "evt_refund_no_lookup",
    );
    try {
      expect(
        await applyBillingEvent(event, store, { cancelSubscription: cancel }),
      ).toEqual({ outcome: "ignored" });
    } finally {
      warn.mockRestore();
    }

    expect(entitlementFromStore(store).plan).toBe("PRO");
    expect(store.subscriptions[0]?.revokedAt).toBeNull();
    expect(store.events.get(event.providerEventId)).toMatchObject({
      status: "PROCESSED",
      processingError: SUBSCRIPTION_REVERSAL_UNRESOLVED_FLAG,
    });
    expect(cancel).not.toHaveBeenCalled();
  });

  it.each([
    ["dispute.accepted", "evt_dispute_accepted"],
    ["dispute.lost", "evt_dispute_lost"],
  ])("revokes Pro and cancels Dodo for %s", async (eventType, webhookId) => {
    const store = await activeStore();
    const cancel = vi.fn(async () => {});

    const event = incomingRaw(realDispute(eventType), webhookId);
    expect(event.reversal).toEqual({
      paymentId: PAYMENT_ID,
      kind: "dispute",
    });

    await applyBillingEvent(event, store, { cancelSubscription: cancel });

    expect(entitlementFromStore(store).plan).toBe("FREE");
    expect(store.subscriptions[0]).toMatchObject({
      status: "EXPIRED",
      revokeReason: "dispute",
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["dispute.opened", DISPUTE_LOG_ONLY_NOTE],
    ["dispute.challenged", DISPUTE_LOG_ONLY_NOTE],
  ])("logs %s without revoking", async (eventType, note) => {
    const store = await activeStore();
    const cancel = vi.fn(async () => {});

    const event = incomingRaw(realDispute(eventType), `evt_${eventType}`);
    expect(
      await applyBillingEvent(event, store, { cancelSubscription: cancel }),
    ).toEqual({ outcome: "ignored" });

    expect(entitlementFromStore(store).plan).toBe("PRO");
    expect(store.events.get(event.providerEventId)?.processingError).toBe(note);
    expect(cancel).not.toHaveBeenCalled();
  });

  it.each([
    "dispute.won",
    "dispute.cancelled",
    "dispute.expired",
  ])("keeps Pro for %s", async (eventType) => {
    const store = await activeStore();
    const cancel = vi.fn(async () => {});

    const event = incomingRaw(realDispute(eventType), `evt_${eventType}`);
    expect(
      await applyBillingEvent(event, store, { cancelSubscription: cancel }),
    ).toEqual({ outcome: "ignored" });

    expect(entitlementFromStore(store).plan).toBe("PRO");
    expect(store.subscriptions[0]?.revokedAt).toBeNull();
    expect(store.events.get(event.providerEventId)?.processingError).toBe(
      DISPUTE_NO_ACTION_NOTE,
    );
    expect(cancel).not.toHaveBeenCalled();
  });

  it("never revokes another customer's subscription for an unrelated payment", async () => {
    const store = await activeStore({ seedPayment: false });
    store.subscriptions.push({
      userId: "b2000000-0000-4000-8000-000000000099",
      dodoCustomerId: "cus_dealatlas_fixture",
      dodoSubscriptionId: "sub_other_customer",
      dodoProductId: BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
      planKey: "PRO_ANNUAL",
      status: "ACTIVE",
      billingInterval: "ANNUAL",
      currentPeriodStart: "2026-06-01T00:00:00.000Z",
      currentPeriodEnd: "2027-06-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      lastProviderEventAt: "2026-06-01T00:00:00.000Z",
      isCurrent: true,
    });
    const cancel = vi.fn(async () => {});

    const event = incoming(
      subscriptionRefund({ payment_id: "pay_unrelated_fixture" }),
      "evt_refund_unrelated_customer",
    );
    await applyBillingEvent(event, store, { cancelSubscription: cancel });

    expect(store.events.get(event.providerEventId)).toMatchObject({
      status: "PROCESSED",
      processingError: SUBSCRIPTION_REVERSAL_UNRESOLVED_FLAG,
    });
    expect(store.subscriptions.every((row) => row.revokedAt == null)).toBe(true);
    expect(cancel).not.toHaveBeenCalled();
  });

  it.each([
    [
      "subscription.active",
      () => billingWebhookFixtures.monthlyActive(),
      "evt_late_active",
    ],
    [
      "subscription.renewed",
      () => billingWebhookFixtures.renewed(),
      "evt_late_renewed",
    ],
    [
      "subscription.updated",
      () => billingWebhookFixtures.updated(),
      "evt_late_updated",
    ],
  ])(
    "does not re-grant or clear the marker on later %s for the same subscription",
    async (_eventType, fixture, webhookId) => {
      const store = await activeStore();
      const cancel = vi.fn(async () => {});
      await applyBillingEvent(
        incoming(subscriptionRefund(), "evt_refund_terminal"),
        store,
        { cancelSubscription: cancel },
      );

      const event = incoming(fixture(), webhookId);
      expect(
        await applyBillingEvent(event, store, {
          cancelSubscription: cancel,
        }),
      ).toEqual({ outcome: "ignored" });
      expect(store.events.get(webhookId)?.processingError).toBe(
        SUBSCRIPTION_REVOKED_TERMINAL_NOTE,
      );
      expect(store.subscriptions[0]).toMatchObject({
        status: "EXPIRED",
        revokeReason: "refund",
      });
      expect(store.subscriptions[0]?.revokedAt).toBeTruthy();
      expect(entitlementFromStore(store).plan).toBe("FREE");
      expect(cancel).toHaveBeenCalledTimes(1);
    },
  );

  it("still grants Pro for a new subscription id after a revoke", async () => {
    const store = await activeStore();
    await applyBillingEvent(
      incoming(subscriptionRefund(), "evt_refund_resub"),
      store,
      { cancelSubscription: async () => {} },
    );

    const payload = billingWebhookFixtures.monthlyActive();
    const newSubscription = incomingAt(
      {
        ...payload,
        data: { ...payload.data, subscription_id: "sub_new_after_revoke" },
      },
      "evt_new_subscription",
      "2026-06-03T12:00:00.000Z",
    );
    expect(await applyBillingEvent(newSubscription, store)).toEqual({
      outcome: "applied",
    });

    expect(store.subscriptions).toHaveLength(2);
    expect(store.subscriptions[0]?.revokedAt).toBeTruthy();
    expect(store.subscriptions[1]?.revokedAt).toBeNull();
    expect(entitlementFromStore(store).plan).toBe("PRO");
  });

  it("keeps the local revoke and flags review when provider cancellation fails", async () => {
    const store = await activeStore();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cancel = vi.fn(async () => {
      throw new Error("provider unavailable");
    });

    const event = incoming(subscriptionRefund(), "evt_cancel_fail");
    try {
      expect(
        await applyBillingEvent(event, store, {
          cancelSubscription: cancel,
        }),
      ).toEqual({ outcome: "applied" });
    } finally {
      // Assertions below use the captured calls before restoring the spy.
    }

    expect(entitlementFromStore(store).plan).toBe("FREE");
    expect(store.subscriptions[0]?.revokedAt).toBeTruthy();
    expect(store.events.get(event.providerEventId)).toMatchObject({
      status: "PROCESSED",
      processingError: SUBSCRIPTION_CANCEL_FAILED_FLAG,
    });
    const logs = warn.mock.calls.map((call) => call.map(String).join(" ")).join("\n");
    expect(logs).toContain(SUBSCRIPTION_CANCEL_FAILED_FLAG);
    expect(logs).not.toContain(BILLING_FIXTURE_SUBSCRIPTION_ID);
    expect(logs).not.toContain(PAYMENT_ID);
    expect(logs).not.toContain("pro@example.com");
    warn.mockRestore();
  });
});
