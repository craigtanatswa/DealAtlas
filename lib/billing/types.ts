import type {
  BillingInterval,
  SubscriptionStatus,
} from "@/lib/entitlements/types";

export const CHECKOUT_PLAN_KEYS = [
  "PRO_MONTHLY",
  "PRO_ANNUAL",
  "founding_lifetime",
] as const;

export type CheckoutPlanKey = (typeof CHECKOUT_PLAN_KEYS)[number];

export const SUBSCRIPTION_PLAN_KEYS = ["PRO_MONTHLY", "PRO_ANNUAL"] as const;

export type SubscriptionPlanKey = (typeof SUBSCRIPTION_PLAN_KEYS)[number];

export type PlanProductMap = {
  PRO_MONTHLY: string;
  PRO_ANNUAL: string;
  PRO_ANNUAL_LEGACY: string[];
  FOUNDING_ANNUAL?: string;
  FOUNDING_LIFETIME?: string;
};

export type FoundingReservation = "reserved" | "ineligible" | "sold_out" | "unavailable";

export type MappedPlan = {
  planKey: SubscriptionPlanKey;
  billingInterval: BillingInterval;
  productId: string;
};

export type SubscriptionSnapshot = {
  dodoCustomerId: string;
  dodoSubscriptionId: string;
  dodoProductId: string;
  userId: string | null;
  planKey: SubscriptionPlanKey | null;
  billingInterval: BillingInterval | null;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  productKnown: boolean;
  recurringAmount: number | null;
  recurringCurrency: string | null;
};

export type PaymentSnapshot = {
  paymentId: string;
  subscriptionId: string | null;
  customerId: string | null;
  succeeded: boolean;
  productIds: string[];
  userId: string | null;
  planKey: string | null;
  totalAmount: number | null;
  currency: string | null;
  lifetime: boolean;
  lifetimeProductId: string | null;
};

export type LifetimeRefundReversal = {
  paymentId: string;
  kind: "refund";
  refundAmount: number | null;
  refundCurrency: string | null;
  isPartial: boolean | null;
};

export type LifetimeDisputeReversal = {
  paymentId: string;
  kind: "dispute";
};

export type LifetimeReversal = LifetimeRefundReversal | LifetimeDisputeReversal;

export type DisputeNotice = {
  paymentId: string;
  eventType: string;
};

export type IncomingBillingEvent = {
  providerEventId: string;
  eventType: string;
  payloadHash: string;
  payload: Record<string, unknown>;
  occurredAt: string | null;
  subscription: SubscriptionSnapshot | null;
  payment: PaymentSnapshot | null;
  reversal: LifetimeReversal | null;
  disputeNotice: DisputeNotice | null;
  refundId: string | null;
  disputeId: string | null;
  paymentActionSubscriptionId: string | null;
  paymentActionCustomerId: string | null;
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
  recurringAmount?: number | null;
  recurringCurrency?: string | null;
  revokedAt?: string | null;
  revokeReason?: string | null;
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

export type LifetimeGrantStatus = "active" | "revoked";

export type LifetimeGrant = {
  userId: string;
  dodoPaymentId: string;
  dodoCustomerId: string | null;
  dodoProductId: string;
  status: LifetimeGrantStatus;
  totalAmount?: number | null;
  currency?: string | null;
  grantedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  grantEventId: string;
  revokeEventId: string | null;
};

export type LifetimeGrantSnapshot = {
  status: LifetimeGrantStatus;
  totalAmount: number | null;
  currency: string | null;
};

export type GrantLifetimeInput = {
  eventId: string;
  paymentId: string;
  userId: string;
  customerId: string | null;
  productId: string;
  totalAmount?: number | null;
  currency?: string | null;
};

export type GrantLifetimeResult =
  | "granted"
  | "granted_over_cap"
  | "duplicate"
  | "duplicate_user"
  | "invalid";

export type RevokeLifetimeInput = {
  eventId: string;
  paymentId: string;
  reason: string | null;
};

export type RevokeLifetimeResult =
  | "revoked"
  | "already_revoked"
  | "not_found"
  | "invalid";

export type RevokeSubscriptionInput = {
  eventId: string;
  subscriptionId: string | null;
  customerId: string | null;
  reason: string | null;
};

export type RevokeSubscriptionResult =
  | "revoked"
  | "already_revoked"
  | "not_found"
  | "invalid";

export type ReconcileFn = (
  dodoSubscriptionId: string,
) => Promise<SubscriptionSnapshot | null>;

export type CancelSubscriptionFn = (
  dodoSubscriptionId: string,
) => Promise<void>;

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
  grantLifetime(input: GrantLifetimeInput): Promise<GrantLifetimeResult>;
  revokeLifetime(input: RevokeLifetimeInput): Promise<RevokeLifetimeResult>;
  revokeSubscription(
    input: RevokeSubscriptionInput,
  ): Promise<RevokeSubscriptionResult>;
  getLifetimeGrantByPayment(
    paymentId: string,
  ): Promise<LifetimeGrantSnapshot | null>;
};
