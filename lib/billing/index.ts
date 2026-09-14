/**
 * Test-safe billing helpers. Server checkout, portal, webhook, and store
 * modules import `server-only` and must not be loaded from client components.
 */
export {
  CHECKOUT_PLAN_KEYS,
  allowlistedProductIds,
  billingIntervalForPlan,
  isCheckoutPlanKey,
  mapPlanKey,
  mapProductId,
  parseCheckoutRequest,
  type CheckoutPlanKey,
  type PlanProductMap,
} from "@/lib/billing/plans";
export { checkoutMetadata, CHECKOUT_METADATA_KEYS } from "@/lib/billing/metadata";
export { mapDodoSubscriptionStatus } from "@/lib/billing/status";
export {
  extractBillingEvent,
  snapshotFromSubscriptionFields,
  HANDLED_PAYMENT_EVENTS,
  HANDLED_SUBSCRIPTION_EVENTS,
} from "@/lib/billing/extract";
export { applyBillingEvent } from "@/lib/billing/apply";
export {
  BILLING_FIXTURE_CUSTOMER_ID,
  BILLING_FIXTURE_PRODUCTS,
  BILLING_FIXTURE_SUBSCRIPTION_ID,
  BILLING_FIXTURE_USER_ID,
  BILLING_FIXTURE_WEBHOOK_SECRET,
  billingWebhookFixtures,
  fixturePaymentData,
  fixtureSubscriptionData,
  paymentWebhookFixture,
  subscriptionWebhookFixture,
} from "@/lib/billing/fixtures";
export { createMemoryBillingStore } from "@/lib/billing/memory-store";
export type {
  ApplyOutcome,
  ApplyResult,
  BillingStore,
  IncomingBillingEvent,
  StoredSubscription,
  SubscriptionSnapshot,
} from "@/lib/billing/types";
