import type {
  SubscriptionMirror,
} from "@/lib/entitlements/types";

export const ENTITLEMENT_FIXTURE_USER_ID =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const ENTITLEMENT_FIXTURE_NOW = new Date("2026-06-15T12:00:00.000Z");

/**
 * In-memory id for entitlement fixtures. Not a deployment allowlist entry.
 * Production Pro uses `getAllowedProductIds()` and never reads this constant.
 */
export const ENTITLEMENT_FIXTURE_PRODUCT_ID = "pdt_entitlement_fixture_monthly";

export const ENTITLEMENT_FIXTURE_ALLOWLIST: ReadonlySet<string> = new Set([
  ENTITLEMENT_FIXTURE_PRODUCT_ID,
]);

export function createSubscriptionFixture(
  overrides: Partial<SubscriptionMirror> = {},
): SubscriptionMirror {
  return {
    userId: ENTITLEMENT_FIXTURE_USER_ID,
    isCurrent: true,
    status: "ACTIVE",
    cancelAtPeriodEnd: false,
    currentPeriodStart: "2026-06-01T00:00:00.000Z",
    currentPeriodEnd: "2026-07-01T00:00:00.000Z",
    planKey: "PRO",
    billingInterval: "MONTHLY",
    dodoProductId: ENTITLEMENT_FIXTURE_PRODUCT_ID,
    ...overrides,
  };
}

/**
 * Named subscription rows for entitlement tests. These never grant production
 * Pro; they are in-memory fixtures consumed by `resolveEntitlement` /
 * `resolveUserEntitlement`, not by query parameters.
 */
export const entitlementSubscriptionFixtures = {
  activePro: () => createSubscriptionFixture(),
  expired: () =>
    createSubscriptionFixture({
      currentPeriodEnd: "2026-05-01T00:00:00.000Z",
    }),
  onHold: () =>
    createSubscriptionFixture({
      status: "ON_HOLD",
    }),
  cancelledPaidThrough: () =>
    createSubscriptionFixture({
      status: "CANCELLED",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: "2026-07-01T00:00:00.000Z",
    }),
  cancelledImmediate: () =>
    createSubscriptionFixture({
      status: "CANCELLED",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: "2026-07-01T00:00:00.000Z",
    }),
  failed: () =>
    createSubscriptionFixture({
      status: "FAILED",
    }),
  revoked: () =>
    createSubscriptionFixture({
      status: "EXPIRED",
      revokedAt: "2026-06-10T00:00:00.000Z",
    }),
  pending: () =>
    createSubscriptionFixture({
      status: "PENDING",
    }),
  notCurrent: () =>
    createSubscriptionFixture({
      isCurrent: false,
    }),
} as const;

export function createFixtureSubscriptionLoader(
  byUserId: Readonly<Record<string, SubscriptionMirror | null>>,
): (userId: string) => Promise<SubscriptionMirror | null> {
  return async (userId) => {
    if (Object.hasOwn(byUserId, userId)) {
      return byUserId[userId];
    }
    return null;
  };
}
