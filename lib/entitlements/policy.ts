import { PLANS } from "@/lib/constants";

import type {
  EntitlementSnapshot,
  SubscriptionMirror,
} from "@/lib/entitlements/types";

export const FREE_ENTITLEMENT: EntitlementSnapshot = {
  plan: PLANS.FREE,
  status: "NONE",
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  billingInterval: null,
  planKey: null,
};

/**
 * Paid-through check aligned with `private.is_user_pro`:
 * a missing period end does not revoke an otherwise qualifying subscription;
 * a recorded period end must be strictly in the future.
 */
export function isPaidThrough(
  currentPeriodEnd: string | null,
  now: Date,
): boolean {
  if (currentPeriodEnd === null) {
    return true;
  }

  const end = Date.parse(currentPeriodEnd);
  if (Number.isNaN(end)) {
    return false;
  }

  return end > now.getTime();
}

function isCancelledAtPeriodEndPaidThrough(
  subscription: SubscriptionMirror,
  now: Date,
): boolean {
  return (
    subscription.status === "CANCELLED" &&
    subscription.cancelAtPeriodEnd &&
    subscription.currentPeriodEnd !== null &&
    isPaidThrough(subscription.currentPeriodEnd, now)
  );
}

function grantsPro(subscription: SubscriptionMirror, now: Date): boolean {
  if (!subscription.isCurrent) {
    return false;
  }

  const statusGrantsPro =
    subscription.status === "ACTIVE" ||
    isCancelledAtPeriodEndPaidThrough(subscription, now);

  return statusGrantsPro && isPaidThrough(subscription.currentPeriodEnd, now);
}

/**
 * Single entitlement rule for DealAtlas Pro.
 *
 * Documented launch policy (`docs/BILLING_DODO.md`, `docs/ARCHITECTURE.md`)
 * and `private.is_user_pro`:
 * - ACTIVE (including renewed, stored as ACTIVE) with an open paid-through period → PRO
 * - CANCELLED + cancel_at_period_end + current_period_end > now → PRO until period end
 * - ON_HOLD, FAILED, EXPIRED, PENDING, UNKNOWN, immediate cancel, or lapsed period → FREE
 *
 * `plan_key` is not an entitlement signal.
 */
export function resolveEntitlement(
  subscription: SubscriptionMirror | null,
  now: Date = new Date(),
): EntitlementSnapshot {
  if (!subscription) {
    return FREE_ENTITLEMENT;
  }

  return {
    plan: grantsPro(subscription, now) ? PLANS.PRO : PLANS.FREE,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    billingInterval: subscription.billingInterval,
    planKey: subscription.planKey,
  };
}

export function isProEntitlement(
  entitlement: EntitlementSnapshot | null | undefined,
): boolean {
  return entitlement?.plan === PLANS.PRO;
}
