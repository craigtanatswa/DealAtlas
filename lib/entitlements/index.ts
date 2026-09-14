/**
 * Entitlement policy is importable from tests without a production Pro grant path.
 * `getCurrentEntitlement` lives in `./service` (server-only) and reads the
 * subscriptions mirror with elevated credentials after authentication.
 */
export type {
  BillingInterval,
  Entitlement,
  EntitlementSnapshot,
  ProCanonicalAccess,
  SubscriptionMirror,
  SubscriptionStatus,
} from "@/lib/entitlements/types";
export {
  FREE_ENTITLEMENT,
  isPaidThrough,
  isProEntitlement,
  resolveEntitlement,
} from "@/lib/entitlements/policy";
export {
  resolveUserEntitlement,
  type SubscriptionLoader,
} from "@/lib/entitlements/resolve";
export {
  ENTITLEMENT_FIXTURE_NOW,
  ENTITLEMENT_FIXTURE_USER_ID,
  createFixtureSubscriptionLoader,
  createSubscriptionFixture,
  entitlementSubscriptionFixtures,
} from "@/lib/entitlements/fixtures";
