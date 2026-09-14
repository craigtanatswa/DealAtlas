import { parseInput, uuidSchema } from "@/lib/validation";
import { resolveEntitlement } from "@/lib/entitlements/policy";
import type {
  EntitlementSnapshot,
  SubscriptionMirror,
} from "@/lib/entitlements/types";

export type SubscriptionLoader = (
  userId: string,
) => Promise<SubscriptionMirror | null>;

/**
 * Resolves FREE/PRO for a user from an injected subscriptions loader.
 * Production uses the server-only database loader; tests inject fixtures.
 */
export async function resolveUserEntitlement(
  userId: string,
  loadSubscription: SubscriptionLoader,
  now: Date = new Date(),
): Promise<EntitlementSnapshot> {
  const id = parseInput(uuidSchema, userId, "User id");
  const subscription = await loadSubscription(id);
  return resolveEntitlement(subscription, now);
}
