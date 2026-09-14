import { ENTITLEMENT_FIXTURE_USER_ID } from "@/lib/entitlements/fixtures";
import type { CheckoutPlanKey, PlanProductMap } from "@/lib/billing/types";

export type WebhookFixtureEnvelope = {
  business_id: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
};

export const BILLING_FIXTURE_PRODUCTS: PlanProductMap = {
  PRO_MONTHLY: "pdt_dealatlas_pro_monthly",
  PRO_ANNUAL: "pdt_dealatlas_pro_annual",
};

export const BILLING_FIXTURE_USER_ID = ENTITLEMENT_FIXTURE_USER_ID;
export const BILLING_FIXTURE_CUSTOMER_ID = "cus_dealatlas_fixture";
export const BILLING_FIXTURE_SUBSCRIPTION_ID = "sub_dealatlas_fixture";
export const BILLING_FIXTURE_BUSINESS_ID = "bus_dealatlas_fixture";
export const BILLING_FIXTURE_WEBHOOK_SECRET = "whsec_dGVzdF9kb2RvX3dlYmhvb2tfc2VjcmV0X2tleQ";

const DEFAULT_BILLING = {
  city: "London",
  country: "GB",
  state: "England",
  street: "1 Example Street",
  zipcode: "SW1A 1AA",
};

export function fixtureSubscriptionData(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    payload_type: "Subscription",
    addons: [],
    billing: DEFAULT_BILLING,
    brand_id: "brand_dealatlas",
    cancel_at_next_billing_date: false,
    created_at: "2026-06-01T00:00:00.000Z",
    credit_entitlement_cart: [],
    currency: "GBP",
    customer: {
      customer_id: BILLING_FIXTURE_CUSTOMER_ID,
      email: "pro@example.com",
      name: "Pro User",
    },
    metadata: {
      user_id: BILLING_FIXTURE_USER_ID,
      plan_key: "PRO_MONTHLY",
    },
    meter_credit_entitlement_cart: [],
    meters: [],
    next_billing_date: "2026-07-01T00:00:00.000Z",
    on_demand: false,
    payment_frequency_count: 1,
    payment_frequency_interval: "Month",
    previous_billing_date: "2026-06-01T00:00:00.000Z",
    product_id: BILLING_FIXTURE_PRODUCTS.PRO_MONTHLY,
    quantity: 1,
    recurring_pre_tax_amount: 3900,
    status: "active",
    subscription_id: BILLING_FIXTURE_SUBSCRIPTION_ID,
    subscription_period_count: 1,
    subscription_period_interval: "Month",
    tax_inclusive: true,
    trial_period_days: 0,
    ...overrides,
  };
}

export function fixturePaymentData(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    payload_type: "Payment",
    billing: DEFAULT_BILLING,
    brand_id: "brand_dealatlas",
    business_id: BILLING_FIXTURE_BUSINESS_ID,
    created_at: "2026-06-01T00:00:00.000Z",
    currency: "GBP",
    customer: {
      customer_id: BILLING_FIXTURE_CUSTOMER_ID,
      email: "pro@example.com",
      name: "Pro User",
    },
    digital_products_delivered: false,
    disputes: [],
    is_update_payment_method: false,
    metadata: {
      user_id: BILLING_FIXTURE_USER_ID,
      plan_key: "PRO_MONTHLY",
    },
    payment_id: "pay_dealatlas_fixture",
    payment_provider: "dodo",
    refunds: [],
    retry_attempt: 0,
    settlement_amount: 3900,
    settlement_currency: "GBP",
    status: "succeeded",
    subscription_id: BILLING_FIXTURE_SUBSCRIPTION_ID,
    total_amount: 3900,
    ...overrides,
  };
}

export function fixtureWebhookPayload(input: {
  type: string;
  timestamp?: string;
  data: Record<string, unknown>;
}): WebhookFixtureEnvelope {
  return {
    business_id: BILLING_FIXTURE_BUSINESS_ID,
    type: input.type,
    timestamp: input.timestamp ?? "2026-06-01T12:00:00.000Z",
    data: input.data,
  };
}

export function subscriptionWebhookFixture(
  type: string,
  overrides: Record<string, unknown> = {},
  timestamp = "2026-06-01T12:00:00.000Z",
): WebhookFixtureEnvelope {
  return fixtureWebhookPayload({
    type,
    timestamp,
    data: fixtureSubscriptionData(overrides),
  });
}

export function paymentWebhookFixture(
  type: string,
  overrides: Record<string, unknown> = {},
  timestamp = "2026-06-01T12:00:00.000Z",
): WebhookFixtureEnvelope {
  return fixtureWebhookPayload({
    type,
    timestamp,
    data: fixturePaymentData(overrides),
  });
}

export const billingWebhookFixtures = {
  monthlyActive: () => subscriptionWebhookFixture("subscription.active"),
  annualActive: () =>
    subscriptionWebhookFixture("subscription.active", {
      product_id: BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
      metadata: {
        user_id: BILLING_FIXTURE_USER_ID,
        plan_key: "PRO_ANNUAL" satisfies CheckoutPlanKey,
      },
      payment_frequency_interval: "Year",
      subscription_period_interval: "Year",
      next_billing_date: "2027-06-01T00:00:00.000Z",
      recurring_pre_tax_amount: 39000,
    }),
  renewed: () =>
    subscriptionWebhookFixture(
      "subscription.renewed",
      {
        previous_billing_date: "2026-07-01T00:00:00.000Z",
        next_billing_date: "2026-08-01T00:00:00.000Z",
      },
      "2026-07-01T12:00:00.000Z",
    ),
  onHold: () =>
    subscriptionWebhookFixture(
      "subscription.on_hold",
      { status: "on_hold" },
      "2026-06-20T12:00:00.000Z",
    ),
  cancelledPeriodEnd: () =>
    subscriptionWebhookFixture(
      "subscription.cancelled",
      {
        status: "cancelled",
        cancel_at_next_billing_date: true,
        cancelled_at: "2026-06-10T12:00:00.000Z",
      },
      "2026-06-10T12:00:00.000Z",
    ),
  cancelledImmediate: () =>
    subscriptionWebhookFixture(
      "subscription.cancelled",
      {
        status: "cancelled",
        cancel_at_next_billing_date: false,
        cancelled_at: "2026-06-10T12:00:00.000Z",
        next_billing_date: "2026-06-10T12:00:00.000Z",
      },
      "2026-06-10T12:00:00.000Z",
    ),
  failed: () =>
    subscriptionWebhookFixture("subscription.failed", { status: "failed" }),
  expired: () =>
    subscriptionWebhookFixture(
      "subscription.expired",
      {
        status: "expired",
        next_billing_date: "2026-05-01T00:00:00.000Z",
      },
      "2026-06-02T12:00:00.000Z",
    ),
  planChangedAnnual: () =>
    subscriptionWebhookFixture(
      "subscription.plan_changed",
      {
        product_id: BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
        metadata: {
          user_id: BILLING_FIXTURE_USER_ID,
          plan_key: "PRO_ANNUAL",
        },
        payment_frequency_interval: "Year",
        subscription_period_interval: "Year",
        next_billing_date: "2027-06-01T00:00:00.000Z",
      },
      "2026-06-15T12:00:00.000Z",
    ),
  updated: () =>
    subscriptionWebhookFixture(
      "subscription.updated",
      { cancel_at_next_billing_date: true },
      "2026-06-08T12:00:00.000Z",
    ),
  unknownProduct: () =>
    subscriptionWebhookFixture("subscription.active", {
      product_id: "pdt_unknown_other",
    }),
  missingUser: () =>
    subscriptionWebhookFixture("subscription.active", {
      metadata: {},
      customer: {
        customer_id: "cus_unlinked",
        email: "unknown@example.com",
        name: "Unknown",
      },
      subscription_id: "sub_unlinked",
    }),
  paymentSucceeded: () => paymentWebhookFixture("payment.succeeded"),
  paymentFailed: () =>
    paymentWebhookFixture("payment.failed", { status: "failed" }),
};
