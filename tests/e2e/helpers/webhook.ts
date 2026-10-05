import { Webhook } from "standardwebhooks";

import {
  BILLING_FIXTURE_PRODUCTS,
  BILLING_FIXTURE_WEBHOOK_SECRET,
  billingWebhookFixtures,
} from "../../../lib/billing/fixtures";

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
}) {
  const payload = billingWebhookFixtures.monthlyActive();
  // The app checks the period end against the real clock, so the fixture
  // period is always relative to the run.
  const now = input.now ?? new Date();
  payload.timestamp = now.toISOString();
  payload.data = {
    ...payload.data,
    product_id: BILLING_FIXTURE_PRODUCTS.PRO_MONTHLY,
    subscription_id: input.subscriptionId,
    previous_billing_date: new Date(now.getTime() - DAY_MS).toISOString(),
    next_billing_date: new Date(now.getTime() + 30 * DAY_MS).toISOString(),
    customer: {
      customer_id: input.customerId,
      email: input.email,
      name: "E2E Pro",
    },
    metadata: {
      user_id: input.userId,
      plan_key: "PRO_MONTHLY",
    },
  };
  return payload;
}
