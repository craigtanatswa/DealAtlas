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
import { resolveEntitlement, ENTITLEMENT_FIXTURE_NOW } from "@/lib/entitlements";

function incoming(
  payload: ReturnType<typeof billingWebhookFixtures.monthlyActive>,
  webhookId: string,
) {
  return extractBillingEvent(
    WebhookPayloadSchema.parse(payload),
    JSON.stringify(payload),
    webhookId,
    BILLING_FIXTURE_PRODUCTS,
  );
}

function incomingAt(
  payload: ReturnType<typeof billingWebhookFixtures.monthlyActive>,
  webhookId: string,
  timestamp: string,
) {
  return incoming({ ...payload, timestamp }, webhookId);
}

function entitlementFromStore(
  store: ReturnType<typeof createMemoryBillingStore>,
) {
  const row = store.subscriptions.find((item) => item.isCurrent) ?? null;
  if (!row) {
    return resolveEntitlement(null);
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
      },
      ENTITLEMENT_FIXTURE_NOW,
    );
}

describe("billing lifecycle apply", () => {
  it("grants Pro from a monthly active webhook and ignores duplicates", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });
    const event = incoming(billingWebhookFixtures.monthlyActive(), "evt_active");

    expect(await applyBillingEvent(event, store)).toEqual({ outcome: "applied" });
    expect(entitlementFromStore(store).plan).toBe("PRO");
    expect(await applyBillingEvent(event, store)).toEqual({
      outcome: "duplicate",
    });
    expect(store.subscriptions.filter((row) => row.isCurrent)).toHaveLength(1);
  });

  it("maps annual, renewed, on-hold, cancelled, failed, and expired transitions", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });

    await applyBillingEvent(
      incomingAt(billingWebhookFixtures.annualActive(), "evt_annual", "2026-06-01T12:00:00.000Z"),
      store,
    );
    expect(store.subscriptions[0]?.billingInterval).toBe("ANNUAL");
    expect(entitlementFromStore(store).plan).toBe("PRO");

    await applyBillingEvent(
      incomingAt(billingWebhookFixtures.renewed(), "evt_renewed", "2026-06-16T12:00:00.000Z"),
      store,
    );
    expect(store.subscriptions[0]?.status).toBe("ACTIVE");

    await applyBillingEvent(
      incomingAt(billingWebhookFixtures.onHold(), "evt_hold", "2026-06-17T12:00:00.000Z"),
      store,
    );
    expect(entitlementFromStore(store).plan).toBe("FREE");

    await applyBillingEvent(
      incomingAt(billingWebhookFixtures.monthlyActive(), "evt_reactivate", "2026-06-18T12:00:00.000Z"),
      store,
    );
    await applyBillingEvent(
      incomingAt(
        billingWebhookFixtures.cancelledPeriodEnd(),
        "evt_cancel",
        "2026-06-19T12:00:00.000Z",
      ),
      store,
    );
    expect(entitlementFromStore(store).plan).toBe("PRO");
    expect(entitlementFromStore(store).cancelAtPeriodEnd).toBe(true);

    await applyBillingEvent(
      incomingAt(billingWebhookFixtures.failed(), "evt_failed", "2026-06-20T12:00:00.000Z"),
      store,
    );
    expect(entitlementFromStore(store).plan).toBe("FREE");

    await applyBillingEvent(
      incomingAt(billingWebhookFixtures.expired(), "evt_expired", "2026-06-21T12:00:00.000Z"),
      store,
    );
    expect(store.subscriptions[0]?.status).toBe("EXPIRED");
  });

  it("does not overwrite newer state with an older on-hold event", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });
    await applyBillingEvent(
      incoming(billingWebhookFixtures.renewed(), "evt_new"),
      store,
    );
    const result = await applyBillingEvent(
      incoming(billingWebhookFixtures.onHold(), "evt_old"),
      store,
    );
    expect(result.outcome).toBe("stale");
    expect(entitlementFromStore(store).plan).toBe("PRO");
  });

  it("does not grant Pro for an unknown product ID", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });
    await applyBillingEvent(
      incoming(billingWebhookFixtures.unknownProduct(), "evt_unknown"),
      store,
    );
    expect(store.subscriptions[0]?.status).toBe("UNKNOWN");
    expect(entitlementFromStore(store).plan).toBe("FREE");
  });

  it("reconciles payment.succeeded after on-hold when the provider is active", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });
    await applyBillingEvent(
      incoming(billingWebhookFixtures.onHold(), "evt_hold_pay"),
      store,
    );
    expect(entitlementFromStore(store).plan).toBe("FREE");

    const result = await applyBillingEvent(
      incomingAt(
        billingWebhookFixtures.paymentSucceeded(),
        "evt_pay_ok",
        "2026-06-21T12:00:00.000Z",
      ),
      store,
      {
        reconcile: async () =>
          incoming(billingWebhookFixtures.monthlyActive(), "evt_unused")
            .subscription,
      },
    );
    expect(result.outcome).toBe("applied");
    expect(entitlementFromStore(store).plan).toBe("PRO");
  });
});
