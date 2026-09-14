import type { Plan } from "@/lib/constants";

/**
 * `getCurrentEntitlement(userId)` will be implemented with billing.
 * Protected routes must call a server-side entitlement check, never a client plan badge.
 */
export type Entitlement = Plan;
