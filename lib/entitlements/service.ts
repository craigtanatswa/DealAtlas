import "server-only";

import { getAllowedProductIds } from "@/lib/billing/allowed-products";
import { loadCurrentSubscription } from "@/lib/entitlements/store";
import { resolveUserEntitlement } from "@/lib/entitlements/resolve";
import type { EntitlementSnapshot } from "@/lib/entitlements/types";

/**
 * Server-side source of truth for DealAtlas billing entitlement.
 * Reads the local subscriptions mirror after authentication. Never use
 * checkout redirects, query parameters, or client plan badges.
 *
 * Pro requires the row's product id to be in this deployment's allowlist.
 * `private.is_user_pro` cannot apply that check: Preview and Production
 * share one database, so a stored allowlist would be wrong for one of them.
 * Callers that reveal source fields use this snapshot and do not treat the
 * SQL helper as Pro on its own. A missing or empty allowlist grants nobody Pro.
 */
export async function getCurrentEntitlement(
  userId: string,
  now: Date = new Date(),
): Promise<EntitlementSnapshot> {
  return resolveUserEntitlement(
    userId,
    loadCurrentSubscription,
    now,
    getAllowedProductIds(),
  );
}
