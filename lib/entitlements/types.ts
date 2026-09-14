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
};

export type EntitlementSnapshot = {
  plan: Plan;
  status: SubscriptionStatus | "NONE";
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingInterval: BillingInterval | null;
  planKey: string | null;
};

export type Entitlement = Plan;

export type ProCanonicalAccess = {
  kind: "pro";
  userId: string;
};
