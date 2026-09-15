import { describe, expect, it, vi } from "vitest";

import { PLANS } from "@/lib/constants";
import {
  fulfillProtectedIntelligenceList,
  fulfillProtectedIntelligenceRequest,
  PROTECTED_INTELLIGENCE_ERROR,
} from "@/lib/intelligence/access";
import {
  ENTITLEMENT_FIXTURE_NOW,
  ENTITLEMENT_FIXTURE_USER_ID,
  entitlementSubscriptionFixtures,
  resolveEntitlement,
} from "@/lib/entitlements";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

describe("protected organisation intelligence access", () => {
  const now = ENTITLEMENT_FIXTURE_NOW;

  it("rejects anonymous callers before loading organisation identity", async () => {
    const load = vi.fn();
    const result = await fulfillProtectedIntelligenceRequest({
      userId: null,
      id: ORG_ID,
      entitlement: resolveEntitlement(
        entitlementSubscriptionFixtures.activePro(),
        now,
      ),
      clientClaimedPlan: PLANS.PRO,
      load,
    });
    expect(result.status).toBe(401);
    expect(result.body).toEqual({
      error: PROTECTED_INTELLIGENCE_ERROR.UNAUTHENTICATED,
      code: "UNAUTHENTICATED",
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("rejects authenticated FREE users before enumerating identity endpoints", async () => {
    const load = vi.fn();
    const record = await fulfillProtectedIntelligenceRequest({
      userId: ENTITLEMENT_FIXTURE_USER_ID,
      id: ORG_ID,
      entitlement: resolveEntitlement(null, now),
      load,
    });
    const list = await fulfillProtectedIntelligenceList({
      userId: ENTITLEMENT_FIXTURE_USER_ID,
      entitlement: resolveEntitlement(null, now),
      clientClaimedPlan: PLANS.PRO,
      load: vi.fn(),
    });

    expect(record.status).toBe(403);
    expect(list.status).toBe(403);
    expect(load).not.toHaveBeenCalled();
    expect(list.body).toEqual({
      error: PROTECTED_INTELLIGENCE_ERROR.FORBIDDEN,
      code: "FORBIDDEN",
    });
  });

  it("returns the paid DTO for an active Pro subscriber", async () => {
    const dto = { organization: { id: ORG_ID, name: "Example City Council" } };
    const load = vi.fn().mockResolvedValue(dto);
    const result = await fulfillProtectedIntelligenceRequest({
      userId: ENTITLEMENT_FIXTURE_USER_ID,
      id: ORG_ID,
      entitlement: resolveEntitlement(
        entitlementSubscriptionFixtures.activePro(),
        now,
      ),
      clientClaimedPlan: PLANS.FREE,
      load,
    });
    expect(result).toEqual({ status: 200, body: dto });
    expect(load).toHaveBeenCalledWith(ORG_ID, {
      kind: "pro",
      userId: ENTITLEMENT_FIXTURE_USER_ID,
    });
  });
});
