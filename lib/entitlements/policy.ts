import { PLANS } from "@/lib/constants";

import type {
  EntitlementSnapshot,
  LifetimeAccess,
  SubscriptionMirror,
} from "@/lib/entitlements/types";

export const FREE_ENTITLEMENT: EntitlementSnapshot = {
  plan: PLANS.FREE,
  status: "NONE",
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  billingInterval: null,
  planKey: null,
  term: null,
};

/**
 * Paid-through check aligned with `private.is_user_pro` (migration 0018):
 * fails closed. A missing or unparseable period end never grants Pro; a
 * recorded period end must be strictly in the future.
 */
export function isPaidThrough(
  currentPeriodEnd: string | null,
  now: Date,
): boolean {
  if (currentPeriodEnd === null) {
    return false;
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

/**
 * Fail closed. An empty allowlist, a missing product id, or a product id
 * outside the set never grants Pro. Callers must pass the set.
 */
function productGrantsPro(
  subscription: SubscriptionMirror,
  allowedProductIds: ReadonlySet<string>,
): boolean {
  if (allowedProductIds.size === 0) {
    return false;
  }
  const productId = subscription.dodoProductId?.trim() ?? "";
  return productId.length > 0 && allowedProductIds.has(productId);
}

function lifetimeGrantsPro(
  lifetime: LifetimeAccess | null | undefined,
  allowedProductIds: ReadonlySet<string>,
): boolean {
  if (!lifetime || lifetime.status !== "active") {
    return false;
  }
  if (allowedProductIds.size === 0) {
    return false;
  }
  const productId = lifetime.dodoProductId?.trim() ?? "";
  return productId.length > 0 && allowedProductIds.has(productId);
}

function grantsPro(
  subscription: SubscriptionMirror,
  now: Date,
  allowedProductIds: ReadonlySet<string>,
): boolean {
  if (!subscription.isCurrent || subscription.revokedAt != null) {
    return false;
  }
  if (!productGrantsPro(subscription, allowedProductIds)) {
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
 * - A revoked subscription stays FREE even if current_period_end is future
 *
 * `plan_key` is not an entitlement signal. `allowedProductIds` is required.
 * `dodo_product_id` must belong to that set. An empty set grants Pro to
 * nobody. Production passes the deployment allowlist from the environment.
 *
 * `private.is_user_pro` still checks status and paid-through only. Preview
 * and Production share one database, so that SQL helper cannot see this
 * deployment's product ids. Source reveal uses this function.
 */
export function resolveEntitlement(
  subscription: SubscriptionMirror | null,
  now: Date,
  allowedProductIds: ReadonlySet<string>,
  lifetime?: LifetimeAccess | null,
): EntitlementSnapshot {
  if (lifetimeGrantsPro(lifetime, allowedProductIds)) {
    return {
      plan: PLANS.PRO,
      status: "ACTIVE",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      billingInterval: null,
      planKey: "founding_lifetime",
      term: "lifetime",
    };
  }

  if (!subscription) {
    return FREE_ENTITLEMENT;
  }

  const plan = grantsPro(subscription, now, allowedProductIds)
    ? PLANS.PRO
    : PLANS.FREE;

  return {
    plan,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    billingInterval: subscription.billingInterval,
    planKey: subscription.planKey,
    term:
      plan === PLANS.PRO
        ? subscription.billingInterval === "ANNUAL"
          ? "annual"
          : subscription.billingInterval === "MONTHLY"
            ? "monthly"
            : null
        : null,
  };
}

export function isProEntitlement(
  entitlement: EntitlementSnapshot | null | undefined,
): boolean {
  return entitlement?.plan === PLANS.PRO;
}
