import { describe, expect, it } from "vitest";

import { PLANS } from "@/lib/constants";
import {
  ENTITLEMENT_FIXTURE_ALLOWLIST,
  ENTITLEMENT_FIXTURE_NOW,
  ENTITLEMENT_FIXTURE_USER_ID,
  createFixtureSubscriptionLoader,
  createSubscriptionFixture,
  entitlementSubscriptionFixtures,
  isPaidThrough,
  resolveEntitlement,
  resolveUserEntitlement,
} from "@/lib/entitlements";

describe("entitlement policy", () => {
  const now = ENTITLEMENT_FIXTURE_NOW;
  const allowed = ENTITLEMENT_FIXTURE_ALLOWLIST;

  it("grants PRO for an active paid-through subscription on an allowlisted product", () => {
    const entitlement = resolveEntitlement(
      entitlementSubscriptionFixtures.activePro(),
      now,
      allowed,
    );
    expect(entitlement.plan).toBe(PLANS.PRO);
    expect(entitlement.status).toBe("ACTIVE");
  });

  it("keeps a revoked subscription FREE even when the paid-through period is future", () => {
    const revoked = resolveEntitlement(
      createSubscriptionFixture({
        status: "ACTIVE",
        revokedAt: "2026-06-10T00:00:00.000Z",
      }),
      now,
      allowed,
    );
    expect(revoked.plan).toBe(PLANS.FREE);
    expect(revoked.term).toBeNull();
    expect(
      resolveEntitlement(entitlementSubscriptionFixtures.revoked(), now, allowed)
        .plan,
    ).toBe(PLANS.FREE);
  });

  it("keeps PRO for cancellation at period end while paid-through", () => {
    expect(
      resolveEntitlement(
        entitlementSubscriptionFixtures.cancelledPaidThrough(),
        now,
        allowed,
      ).plan,
    ).toBe(PLANS.PRO);
  });

  it("rejects expired, on-hold, failed, pending, and immediate-cancel fixtures", () => {
    expect(
      resolveEntitlement(entitlementSubscriptionFixtures.expired(), now, allowed).plan,
    ).toBe(PLANS.FREE);
    expect(
      resolveEntitlement(entitlementSubscriptionFixtures.onHold(), now, allowed).plan,
    ).toBe(PLANS.FREE);
    expect(
      resolveEntitlement(entitlementSubscriptionFixtures.failed(), now, allowed).plan,
    ).toBe(PLANS.FREE);
    expect(
      resolveEntitlement(entitlementSubscriptionFixtures.pending(), now, allowed).plan,
    ).toBe(PLANS.FREE);
    expect(
      resolveEntitlement(
        entitlementSubscriptionFixtures.cancelledImmediate(),
        now,
        allowed,
      ).plan,
    ).toBe(PLANS.FREE);
    expect(
      resolveEntitlement(entitlementSubscriptionFixtures.notCurrent(), now, allowed)
        .plan,
    ).toBe(PLANS.FREE);
  });

  it("sets the term only for Pro and derives it from the billing interval", () => {
    expect(
      resolveEntitlement(
        createSubscriptionFixture({ billingInterval: "MONTHLY" }),
        now,
        allowed,
      ).term,
    ).toBe("monthly");
    expect(
      resolveEntitlement(
        createSubscriptionFixture({ billingInterval: "ANNUAL" }),
        now,
        allowed,
      ).term,
    ).toBe("annual");
  });

  it("leaves the term null whenever the plan is FREE", () => {
    for (const fixture of [
      entitlementSubscriptionFixtures.expired(),
      entitlementSubscriptionFixtures.onHold(),
      entitlementSubscriptionFixtures.failed(),
      entitlementSubscriptionFixtures.pending(),
      entitlementSubscriptionFixtures.cancelledImmediate(),
      entitlementSubscriptionFixtures.notCurrent(),
      entitlementSubscriptionFixtures.revoked(),
    ]) {
      const entitlement = resolveEntitlement(fixture, now, allowed);
      expect(entitlement.plan).toBe(PLANS.FREE);
      expect(entitlement.term).toBeNull();
    }
    expect(resolveEntitlement(null, now, allowed).term).toBeNull();
  });

  it("fails closed when the paid-through period end is missing or invalid", () => {
    expect(isPaidThrough(null, now)).toBe(false);
    expect(isPaidThrough("not-a-date", now)).toBe(false);
    expect(
      resolveEntitlement(
        createSubscriptionFixture({ status: "ACTIVE", currentPeriodEnd: null }),
        now,
        allowed,
      ).plan,
    ).toBe(PLANS.FREE);
  });

  it("fails closed when the allowlist is empty or the product is outside it", () => {
    expect(
      resolveEntitlement(entitlementSubscriptionFixtures.activePro(), now, new Set()).plan,
    ).toBe(PLANS.FREE);
    expect(
      resolveEntitlement(
        createSubscriptionFixture({ dodoProductId: "pdt_test_mode_other" }),
        now,
        allowed,
      ).plan,
    ).toBe(PLANS.FREE);
    expect(
      resolveEntitlement(
        createSubscriptionFixture({ dodoProductId: null }),
        now,
        allowed,
      ).plan,
    ).toBe(PLANS.FREE);
  });

  it("does not grant Pro from plan_key or missing subscription", () => {
    expect(resolveEntitlement(null, now, allowed)).toMatchObject({
      plan: PLANS.FREE,
      status: "NONE",
    });
    expect(
      resolveEntitlement(
        createSubscriptionFixture({ status: "PENDING", planKey: "PRO" }),
        now,
        allowed,
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
      resolveUserEntitlement(ENTITLEMENT_FIXTURE_USER_ID, load, now, allowed),
    ).resolves.toMatchObject({ plan: PLANS.PRO });
    await expect(
      resolveUserEntitlement(otherUserId, load, now, allowed),
    ).resolves.toMatchObject({ plan: PLANS.FREE, status: "ON_HOLD" });
  });
});
