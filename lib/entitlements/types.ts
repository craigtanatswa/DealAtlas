import type { Plan } from "@/lib/constants";
import type { Database } from "@/lib/db/database.types";

export type SubscriptionStatus =
  Database["public"]["Enums"]["subscription_status"];

export type BillingInterval = Database["public"]["Enums"]["billing_interval"];

/**
 * Local subscriptions-mirror fields used for entitlement.
 * Provider secrets, webhook payloads and customer IDs are intentionally omitted.
 */
export type SubscriptionMirror = {
  userId: string;
  isCurrent: boolean;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  planKey: string;
  billingInterval: BillingInterval | null;
  /**
   * Dodo product id on the subscriptions row. Null or a value outside the
   * caller's allowlist does not grant Pro.
   */
  dodoProductId?: string | null;
  /** Set when a refund or lost chargeback terminal-revoked the subscription. */
  revokedAt?: string | null;
};

export type BillingTerm = "monthly" | "annual" | "lifetime";

export type LifetimeAccess = {
  status: "active" | "revoked";
  dodoProductId: string | null;
  grantedAt: string | null;
};

export type EntitlementSnapshot = {
  plan: Plan;
  status: SubscriptionStatus | "NONE";
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingInterval: BillingInterval | null;
  planKey: string | null;
  term: BillingTerm | null;
};

export type Entitlement = Plan;

export type ProCanonicalAccess = {
  kind: "pro";
  userId: string;
};
