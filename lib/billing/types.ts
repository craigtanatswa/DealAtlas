import type {
  BillingInterval,
  SubscriptionStatus,
} from "@/lib/entitlements/types";

export const CHECKOUT_PLAN_KEYS = ["PRO_MONTHLY", "PRO_ANNUAL"] as const;

export type CheckoutPlanKey = (typeof CHECKOUT_PLAN_KEYS)[number];

export type PlanProductMap = {
  PRO_MONTHLY: string;
  PRO_ANNUAL: string;
};

export type MappedPlan = {
  planKey: CheckoutPlanKey;
  billingInterval: BillingInterval;
  productId: string;
};

export type SubscriptionSnapshot = {
  dodoCustomerId: string;
  dodoSubscriptionId: string;
  dodoProductId: string;
  userId: string | null;
  planKey: CheckoutPlanKey | null;
  billingInterval: BillingInterval | null;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  productKnown: boolean;
};

export type PaymentSnapshot = {
  paymentId: string;
  subscriptionId: string | null;
  customerId: string | null;
  succeeded: boolean;
};

export type IncomingBillingEvent = {
  providerEventId: string;
  eventType: string;
  payloadHash: string;
  payload: Record<string, unknown>;
  occurredAt: string | null;
  subscription: SubscriptionSnapshot | null;
  payment: PaymentSnapshot | null;
};

export type BillingEventRecord = {
  providerEventId: string;
  eventType: string;
  payloadHash: string;
  status: "RECEIVED" | "PROCESSED" | "IGNORED" | "FAILED";
};

export type StoredSubscription = {
  userId: string;
  dodoCustomerId: string | null;
  dodoSubscriptionId: string | null;
  dodoProductId: string | null;
  planKey: string;
  status: SubscriptionStatus;
  billingInterval: BillingInterval | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  lastProviderEventAt: string | null;
  isCurrent: boolean;
};

export type ApplyOutcome =
  | "applied"
  | "duplicate"
  | "ignored"
  | "stale"
  | "unresolved";

export type ApplyResult = {
  outcome: ApplyOutcome;
};

export type ReconcileFn = (
  dodoSubscriptionId: string,
) => Promise<SubscriptionSnapshot | null>;

export type BillingStore = {
  getEvent(providerEventId: string): Promise<BillingEventRecord | null>;
  insertReceivedEvent(
    event: IncomingBillingEvent,
  ): Promise<{ inserted: boolean; record: BillingEventRecord }>;
  markEvent(
    providerEventId: string,
    status: BillingEventRecord["status"],
    processingError?: string | null,
  ): Promise<void>;
  profileExists(userId: string): Promise<boolean>;
  getSubscriptionByDodoId(
    dodoSubscriptionId: string,
  ): Promise<StoredSubscription | null>;
  getSubscriptionByCustomerId(
    dodoCustomerId: string,
  ): Promise<StoredSubscription | null>;
  getCurrentSubscription(
    userId: string,
  ): Promise<StoredSubscription | null>;
  upsertCurrentSubscription(row: StoredSubscription): Promise<void>;
};
