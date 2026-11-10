import { describe, expect, it, vi } from "vitest";

import { WebhookPayloadSchema } from "@dodopayments/core/schemas";

import {
  BILLING_FIXTURE_PRODUCTS,
  BILLING_FIXTURE_SUBSCRIPTION_ID,
  BILLING_FIXTURE_USER_ID,
  applyBillingEvent,
  billingWebhookFixtures,
  createMemoryBillingStore,
  extractBillingEvent,
} from "@/lib/billing";
import {
  SUBSCRIPTION_ALREADY_REVOKED_NOTE,
  SUBSCRIPTION_CANCEL_FAILED_FLAG,
  SUBSCRIPTION_PARTIAL_REFUND_NOTE,
  SUBSCRIPTION_REFUND_REVIEW_FLAG,
  SUBSCRIPTION_REVOKED_TERMINAL_NOTE,
} from "@/lib/billing/apply";
import {
  ENTITLEMENT_FIXTURE_NOW,
  resolveEntitlement,
} from "@/lib/entitlements";

type Payload = ReturnType<typeof billingWebhookFixtures.monthlyActive>;

function incoming(payload: Payload, webhookId: string) {
  return extractBillingEvent(
    WebhookPayloadSchema.parse(payload),
    JSON.stringify(payload),
    webhookId,
    BILLING_FIXTURE_PRODUCTS,
  );
}

function incomingAt(payload: Payload, webhookId: string, timestamp: string) {
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

function entitlementFromStore(
  store: ReturnType<typeof createMemoryBillingStore>,
) {
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

async function activeStore() {
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
  return store;
}

function subscriptionRefund(overrides: Record<string, unknown> = {}) {
  return billingWebhookFixtures.lifetimeRefund({
    payment_id: "pay_dealatlas_fixture",
    metadata: {},
    ...overrides,
  });
}

describe("subscription refund and chargeback revocation", () => {
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

  it("revokes an annual subscription using its stored recurring total", async () => {
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
    expect(store.subscriptions[0]?.recurringAmount).toBe(35000);

    const cancel = vi.fn(async () => {});
    await applyBillingEvent(
      incoming(subscriptionRefund({ amount: 35000 }), "evt_refund_annual"),
      store,
      { cancelSubscription: cancel },
    );

    expect(entitlementFromStore(store).plan).toBe("FREE");
    expect(store.subscriptions[0]).toMatchObject({
      status: "EXPIRED",
      revokeReason: "refund",
      recurringAmount: 35000,
    });
    expect(cancel).toHaveBeenCalledTimes(1);
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
      subscriptionRefund({ amount: 3900, currency: "USD" }),
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

  it.each([
    ["dispute.accepted", "evt_dispute_accepted"],
    ["dispute.lost", "evt_dispute_lost"],
  ])("revokes Pro and cancels Dodo for %s", async (eventType, webhookId) => {
    const store = await activeStore();
    const cancel = vi.fn(async () => {});

    await applyBillingEvent(
      incoming(
        billingWebhookFixtures.lifetimeDispute(eventType as string, {
          amount: "3900",
          payment_id: "pay_dealatlas_fixture",
        }) as Payload,
        webhookId,
      ),
      store,
      { cancelSubscription: cancel },
    );

    expect(entitlementFromStore(store).plan).toBe("FREE");
    expect(store.subscriptions[0]).toMatchObject({
      status: "EXPIRED",
      revokeReason: "dispute",
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("does not re-grant or clear the marker on later events for the same subscription", async () => {
    const store = await activeStore();
    const cancel = vi.fn(async () => {});
    await applyBillingEvent(
      incoming(subscriptionRefund(), "evt_refund_terminal"),
      store,
      { cancelSubscription: cancel },
    );

    const lateActive = incomingAt(
      billingWebhookFixtures.monthlyActive(),
      "evt_late_active",
      "2026-06-03T12:00:00.000Z",
    );
    expect(
      await applyBillingEvent(lateActive, store, { cancelSubscription: cancel }),
    ).toEqual({ outcome: "ignored" });
    expect(store.events.get("evt_late_active")?.processingError).toBe(
      SUBSCRIPTION_REVOKED_TERMINAL_NOTE,
    );
    expect(store.subscriptions[0]).toMatchObject({
      status: "EXPIRED",
      revokeReason: "refund",
    });
    expect(store.subscriptions[0]?.revokedAt).toBeTruthy();
    expect(entitlementFromStore(store).plan).toBe("FREE");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

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
      } as Payload,
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
    expect(logs).not.toContain("pay_dealatlas_fixture");
    expect(logs).not.toContain("pro@example.com");
    warn.mockRestore();
  });
});
