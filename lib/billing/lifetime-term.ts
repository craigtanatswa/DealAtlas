import type { EntitlementSnapshot } from "@/lib/entitlements/types";

/**
 * True when the entitlement is a one-time Lifetime purchase (no renewal).
 * S&B's backend marks it with term = "lifetime". The field name is not final:
 * confirm against S&B's founding_lifetime PR and change it here only.
 */
export function isLifetimeTerm(entitlement: EntitlementSnapshot): boolean {
  return (entitlement as EntitlementSnapshot & { term?: unknown }).term === "lifetime";
}
