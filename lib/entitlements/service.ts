import "server-only";

import { loadCurrentSubscription } from "@/lib/entitlements/store";
import { resolveUserEntitlement } from "@/lib/entitlements/resolve";
import type { EntitlementSnapshot } from "@/lib/entitlements/types";

/**
 * Server-side source of truth for DealAtlas billing entitlement.
 * Reads the local subscriptions mirror after authentication. Never use
 * checkout redirects, query parameters, or client plan badges.
 */
export async function getCurrentEntitlement(
  userId: string,
  now: Date = new Date(),
): Promise<EntitlementSnapshot> {
  return resolveUserEntitlement(userId, loadCurrentSubscription, now);
}
