import { describe, expect, it } from "vitest";

import { PLANS } from "@/lib/constants";
import {
  ENTITLEMENT_FIXTURE_NOW,
  ENTITLEMENT_FIXTURE_USER_ID,
  createFixtureSubscriptionLoader,
  createSubscriptionFixture,
  entitlementSubscriptionFixtures,
  resolveEntitlement,
  resolveUserEntitlement,
} from "@/lib/entitlements";

describe("entitlement policy", () => {
  const now = ENTITLEMENT_FIXTURE_NOW;

  it("grants PRO for an active paid-through subscription fixture", () => {
    const entitlement = resolveEntitlement(
      entitlementSubscriptionFixtures.activePro(),
      now,
    );
    expect(entitlement.plan).toBe(PLANS.PRO);
    expect(entitlement.status).toBe("ACTIVE");
  });

  it("keeps PRO for cancellation at period end while paid-through", () => {
    expect(
      resolveEntitlement(
        entitlementSubscriptionFixtures.cancelledPaidThrough(),
        now,
      ).plan,
    ).toBe(PLANS.PRO);
  });

  it("rejects expired, on-hold, failed, pending, and immediate-cancel fixtures", () => {
    expect(
      resolveEntitlement(entitlementSubscriptionFixtures.expired(), now).plan,
    ).toBe(PLANS.FREE);
    expect(
      resolveEntitlement(entitlementSubscriptionFixtures.onHold(), now).plan,
    ).toBe(PLANS.FREE);
    expect(
      resolveEntitlement(entitlementSubscriptionFixtures.failed(), now).plan,
    ).toBe(PLANS.FREE);
    expect(
      resolveEntitlement(entitlementSubscriptionFixtures.pending(), now).plan,
    ).toBe(PLANS.FREE);
    expect(
      resolveEntitlement(
        entitlementSubscriptionFixtures.cancelledImmediate(),
        now,
      ).plan,
    ).toBe(PLANS.FREE);
    expect(
      resolveEntitlement(entitlementSubscriptionFixtures.notCurrent(), now)
        .plan,
    ).toBe(PLANS.FREE);
  });

  it("does not grant Pro from plan_key or missing subscription", () => {
    expect(resolveEntitlement(null, now)).toMatchObject({
      plan: PLANS.FREE,
      status: "NONE",
    });
    expect(
      resolveEntitlement(
        createSubscriptionFixture({ status: "PENDING", planKey: "PRO" }),
        now,
      ).plan,
    ).toBe(PLANS.FREE);
  });

  it("resolves through a mocked subscription loader without query-parameter grants", async () => {
    const otherUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const load = createFixtureSubscriptionLoader({
      [ENTITLEMENT_FIXTURE_USER_ID]: entitlementSubscriptionFixtures.activePro(),
      [otherUserId]: entitlementSubscriptionFixtures.onHold(),
    });

    await expect(
      resolveUserEntitlement(ENTITLEMENT_FIXTURE_USER_ID, load, now),
    ).resolves.toMatchObject({ plan: PLANS.PRO });
    await expect(
      resolveUserEntitlement(otherUserId, load, now),
    ).resolves.toMatchObject({ plan: PLANS.FREE, status: "ON_HOLD" });
  });
});
