import { Webhook } from "standardwebhooks";

import {
  BILLING_FIXTURE_LEGACY_PRODUCT_ID,
  BILLING_FIXTURE_PRODUCTS,
  BILLING_FIXTURE_WEBHOOK_SECRET,
  billingWebhookFixtures,
} from "../../../lib/billing/fixtures";

type ProWebhookEventType = "subscription.active" | "subscription.renewed";

const DAY_MS = 24 * 60 * 60 * 1000;

export function signedWebhookHeaders(body: string, webhookId: string) {
  const webhook = new Webhook(BILLING_FIXTURE_WEBHOOK_SECRET);
  const timestamp = new Date();
  const signature = webhook.sign(webhookId, timestamp, body);
  return {
    "content-type": "application/json",
    "webhook-id": webhookId,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": signature,
  };
}

export function proActiveWebhookPayload(input: {
  userId: string;
  email: string;
  subscriptionId: string;
  customerId: string;
  now?: Date;
  productId?: string;
  planKey?: "PRO_MONTHLY" | "PRO_ANNUAL";
  recurringPreTaxAmount?: number;
  eventType?: ProWebhookEventType;
}) {
  const payload = billingWebhookFixtures.monthlyActive();
  // The app checks the period end against the real clock, so the fixture
  // period is always relative to the run.
  const now = input.now ?? new Date();
  const planKey = input.planKey ?? "PRO_MONTHLY";
  const annual =
    planKey === "PRO_ANNUAL" ||
    input.productId === BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL ||
    BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL_LEGACY.includes(input.productId ?? "");
  const data: Record<string, unknown> = {
    ...payload.data,
    product_id:
      input.productId ??
      (annual
        ? BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL
        : BILLING_FIXTURE_PRODUCTS.PRO_MONTHLY),
    subscription_id: input.subscriptionId,
    previous_billing_date: new Date(now.getTime() - DAY_MS).toISOString(),
    next_billing_date: new Date(
      now.getTime() + (annual ? 365 : 30) * DAY_MS,
    ).toISOString(),
    customer: {
      customer_id: input.customerId,
      email: input.email,
      name: "E2E Pro",
    },
    metadata: {
      user_id: input.userId,
      plan_key: planKey,
    },
  };

  if (annual) {
    data.payment_frequency_interval = "Year";
    data.subscription_period_interval = "Year";
    data.recurring_pre_tax_amount = input.recurringPreTaxAmount ?? 35000;
  } else if (input.recurringPreTaxAmount !== undefined) {
    data.recurring_pre_tax_amount = input.recurringPreTaxAmount;
  }

  payload.type = input.eventType ?? "subscription.active";
  payload.timestamp = now.toISOString();
  payload.data = data;
  return payload;
}

export function legacyAnnualActiveWebhookPayload(input: {
  userId: string;
  email: string;
  subscriptionId: string;
  customerId: string;
  now?: Date;
  eventType?: ProWebhookEventType;
}) {
  return proActiveWebhookPayload({
    ...input,
    productId: BILLING_FIXTURE_LEGACY_PRODUCT_ID,
    planKey: "PRO_ANNUAL",
    recurringPreTaxAmount: 39000,
  });
}
