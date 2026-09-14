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
import { fulfillProtectedDealRequest } from "@/lib/deals/protected-access";
import type { PaidDealDto } from "@/lib/deals/paid-dto";
import {
  ENTITLEMENT_FIXTURE_NOW,
  resolveEntitlement,
} from "@/lib/entitlements";

const DEAL_ID = "22222222-2222-4222-8222-222222222222";
const paidDto = {
  id: DEAL_ID,
  sourceTitle: "CANARY SOURCE TITLE NEVER FREE",
} as PaidDealDto;

function entitlementFromStore(
  store: ReturnType<typeof createMemoryBillingStore>,
) {
  const row = store.subscriptions.find((item) => item.isCurrent) ?? null;
  if (!row) {
    return resolveEntitlement(null, ENTITLEMENT_FIXTURE_NOW);
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

describe("checkout-to-webhook-to-reveal", () => {
  it("keeps the paid DTO closed until a verified active webhook grants Pro", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });
    const loadPaidDeal = async () => paidDto;

    const before = await fulfillProtectedDealRequest({
      userId: BILLING_FIXTURE_USER_ID,
      dealId: DEAL_ID,
      entitlement: entitlementFromStore(store),
      clientClaimedPlan: "PRO",
      loadPaidDeal,
    });
    expect(before.status).toBe(403);

    const payload = billingWebhookFixtures.monthlyActive();
    const event = extractBillingEvent(
      WebhookPayloadSchema.parse(payload),
      JSON.stringify(payload),
      "evt_reveal",
      BILLING_FIXTURE_PRODUCTS,
    );
    expect(await applyBillingEvent(event, store)).toEqual({ outcome: "applied" });

    const after = await fulfillProtectedDealRequest({
      userId: BILLING_FIXTURE_USER_ID,
      dealId: DEAL_ID,
      entitlement: entitlementFromStore(store),
      clientClaimedPlan: "FREE",
      loadPaidDeal,
    });

    expect(entitlementFromStore(store).plan).toBe("PRO");
    expect(after).toEqual({ status: 200, body: paidDto });
  });
});
