import type { EntitlementSnapshot } from "@/lib/entitlements/types";

/**
 * True when the entitlement is a one-time Lifetime purchase (no renewal).
 * S&B #103 contract: top-level term === 'lifetime'. Change the field here only.
 */
export function isLifetimeTerm(entitlement: EntitlementSnapshot): boolean {
  return entitlement.term === "lifetime";
}
