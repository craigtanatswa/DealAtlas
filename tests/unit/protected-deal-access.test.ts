import { describe, expect, it, vi } from "vitest";

import { PLANS } from "@/lib/constants";
import {
  fulfillProtectedDealRequest,
  PROTECTED_DEAL_ERROR,
} from "@/lib/deals/protected-access";
import type { PaidDealDto } from "@/lib/deals/paid-dto";
import {
  ENTITLEMENT_FIXTURE_NOW,
  ENTITLEMENT_FIXTURE_USER_ID,
  entitlementSubscriptionFixtures,
  resolveEntitlement,
} from "@/lib/entitlements";

const DEAL_ID = "22222222-2222-4222-8222-222222222222";

const paidDto = {
  id: DEAL_ID,
  sourceTitle: "CANARY SOURCE TITLE NEVER FREE",
} as PaidDealDto;

describe("protected deal access", () => {
  const now = ENTITLEMENT_FIXTURE_NOW;

  it("rejects anonymous callers before loading canonical data", async () => {
    const loadPaidDeal = vi.fn();
    const result = await fulfillProtectedDealRequest({
      userId: null,
      dealId: DEAL_ID,
      entitlement: resolveEntitlement(
        entitlementSubscriptionFixtures.activePro(),
        now,
      ),
      clientClaimedPlan: PLANS.PRO,
      loadPaidDeal,
    });

    expect(result).toEqual({
      status: 401,
      body: {
        error: PROTECTED_DEAL_ERROR.UNAUTHENTICATED,
        code: "UNAUTHENTICATED",
      },
    });
    expect(loadPaidDeal).not.toHaveBeenCalled();
  });

  it("rejects authenticated FREE users before loading canonical data", async () => {
    const loadPaidDeal = vi.fn();
    const result = await fulfillProtectedDealRequest({
      userId: ENTITLEMENT_FIXTURE_USER_ID,
      dealId: DEAL_ID,
      entitlement: resolveEntitlement(null, now),
      loadPaidDeal,
    });

    expect(result.status).toBe(403);
    expect(result.body).toEqual({
      error: PROTECTED_DEAL_ERROR.FORBIDDEN,
      code: "FORBIDDEN",
    });
    expect(loadPaidDeal).not.toHaveBeenCalled();
  });

  it("rejects client-side plan tampering and checkout success flags", async () => {
    const loadPaidDeal = vi.fn();
    const free = resolveEntitlement(
      entitlementSubscriptionFixtures.pending(),
      now,
    );

    for (const clientClaimedPlan of [
      PLANS.PRO,
      { plan: "PRO" },
      "success=true",
      { success: true, plan: "PRO" },
    ]) {
      const result = await fulfillProtectedDealRequest({
        userId: ENTITLEMENT_FIXTURE_USER_ID,
        dealId: DEAL_ID,
        entitlement: free,
        clientClaimedPlan,
        loadPaidDeal,
      });
      expect(result.status).toBe(403);
    }

    expect(loadPaidDeal).not.toHaveBeenCalled();
  });

  it("accepts an active PRO fixture and returns the paid DTO", async () => {
    const loadPaidDeal = vi.fn().mockResolvedValue(paidDto);
    const result = await fulfillProtectedDealRequest({
      userId: ENTITLEMENT_FIXTURE_USER_ID,
      dealId: DEAL_ID,
      entitlement: resolveEntitlement(
        entitlementSubscriptionFixtures.activePro(),
        now,
      ),
      clientClaimedPlan: PLANS.FREE,
      loadPaidDeal,
    });

    expect(result).toEqual({ status: 200, body: paidDto });
    expect(loadPaidDeal).toHaveBeenCalledTimes(1);
    expect(loadPaidDeal).toHaveBeenCalledWith(DEAL_ID, {
      kind: "pro",
      userId: ENTITLEMENT_FIXTURE_USER_ID,
    });
  });

  it("rejects expired and on-hold fixtures according to documented policy", async () => {
    const loadPaidDeal = vi.fn().mockResolvedValue(paidDto);

    const expired = await fulfillProtectedDealRequest({
      userId: ENTITLEMENT_FIXTURE_USER_ID,
      dealId: DEAL_ID,
      entitlement: resolveEntitlement(
        entitlementSubscriptionFixtures.expired(),
        now,
      ),
      clientClaimedPlan: PLANS.PRO,
      loadPaidDeal,
    });
    const onHold = await fulfillProtectedDealRequest({
      userId: ENTITLEMENT_FIXTURE_USER_ID,
      dealId: DEAL_ID,
      entitlement: resolveEntitlement(
        entitlementSubscriptionFixtures.onHold(),
        now,
      ),
      clientClaimedPlan: PLANS.PRO,
      loadPaidDeal,
    });

    expect(expired.status).toBe(403);
    expect(onHold.status).toBe(403);
    expect(loadPaidDeal).not.toHaveBeenCalled();
  });

  it("validates the Deal ID before querying", async () => {
    const loadPaidDeal = vi.fn();
    const result = await fulfillProtectedDealRequest({
      userId: ENTITLEMENT_FIXTURE_USER_ID,
      dealId: "not-a-uuid",
      entitlement: resolveEntitlement(
        entitlementSubscriptionFixtures.activePro(),
        now,
      ),
      loadPaidDeal,
    });

    expect(result.status).toBe(400);
    expect(loadPaidDeal).not.toHaveBeenCalled();
  });
});
