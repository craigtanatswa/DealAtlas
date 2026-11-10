/**
 * Test-safe billing helpers. Server checkout, portal, webhook, and store
 * modules import `server-only` and must not be loaded from client components.
 */
export {
  CHECKOUT_PLAN_KEYS,
  SUBSCRIPTION_PLAN_KEYS,
  allowlistedProductIds,
  billingIntervalForPlan,
  checkoutProductIds,
  webhookAcceptedProductIds,
  isCheckoutPlanKey,
  isFoundingProduct,
  isLifetimeProduct,
  mapPlanKey,
  mapProductId,
  parseCheckoutRequest,
  selectCheckoutProduct,
  shouldReserveFoundingSlot,
  subscriptionPlanKeyFor,
  type CheckoutPlanKey,
  type CheckoutSelection,
  type PlanProductMap,
  type SubscriptionPlanKey,
} from "@/lib/billing/plans";
export { checkoutMetadata, CHECKOUT_METADATA_KEYS } from "@/lib/billing/metadata";
export {
  checkoutReturnUrl,
  parseCheckoutReturnTo,
} from "@/lib/deals/paths";
export { mapDodoSubscriptionStatus } from "@/lib/billing/status";
export {
  extractBillingEvent,
  snapshotFromSubscriptionFields,
  HANDLED_DISPUTE_EVENTS,
  HANDLED_PAYMENT_EVENTS,
  HANDLED_REFUND_EVENTS,
  HANDLED_SUBSCRIPTION_EVENTS,
} from "@/lib/billing/extract";
export { applyBillingEvent } from "@/lib/billing/apply";
export {
  BILLING_FIXTURE_CUSTOMER_ID,
  BILLING_FIXTURE_LEGACY_PRODUCT_ID,
  BILLING_FIXTURE_LIFETIME_PRODUCT_ID,
  BILLING_FIXTURE_PRODUCTS,
  BILLING_FIXTURE_SUBSCRIPTION_ID,
  BILLING_FIXTURE_USER_ID,
  BILLING_FIXTURE_WEBHOOK_SECRET,
  billingWebhookFixtures,
  disputeWebhookFixture,
  fixturePaymentData,
  fixtureSubscriptionData,
  lifetimePaymentWebhookFixture,
  paymentWebhookFixture,
  refundWebhookFixture,
  subscriptionWebhookFixture,
} from "@/lib/billing/fixtures";
export { createMemoryBillingStore } from "@/lib/billing/memory-store";
export type {
  ApplyOutcome,
  ApplyResult,
  BillingStore,
  GrantLifetimeInput,
  GrantLifetimeResult,
  IncomingBillingEvent,
  LifetimeGrant,
  LifetimeGrantStatus,
  LifetimeReversal,
  PaymentSnapshot,
  RevokeLifetimeInput,
  RevokeLifetimeResult,
  StoredSubscription,
  SubscriptionSnapshot,
} from "@/lib/billing/types";
