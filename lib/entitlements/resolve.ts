import { parseInput, uuidSchema } from "@/lib/validation";
import { resolveEntitlement } from "@/lib/entitlements/policy";
import type {
  EntitlementSnapshot,
  LifetimeAccess,
  SubscriptionMirror,
} from "@/lib/entitlements/types";

export type SubscriptionLoader = (
  userId: string,
) => Promise<SubscriptionMirror | null>;

export type LifetimeLoader = (
  userId: string,
) => Promise<LifetimeAccess | null>;

/**
 * Resolves FREE/PRO for a user from an injected subscriptions loader.
 * Production uses the server-only database loader; tests inject fixtures.
 */
export async function resolveUserEntitlement(
  userId: string,
  loadSubscription: SubscriptionLoader,
  now: Date,
  allowedProductIds: ReadonlySet<string>,
  loadLifetime?: LifetimeLoader,
): Promise<EntitlementSnapshot> {
  const id = parseInput(uuidSchema, userId, "User id");
  const [subscription, lifetime] = await Promise.all([
    loadSubscription(id),
    loadLifetime ? loadLifetime(id) : Promise.resolve(null),
  ]);
  return resolveEntitlement(subscription, now, allowedProductIds, lifetime);
}
