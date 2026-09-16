import { Webhook } from "standardwebhooks";

import {
  BILLING_FIXTURE_PRODUCTS,
  BILLING_FIXTURE_WEBHOOK_SECRET,
  billingWebhookFixtures,
} from "../../../lib/billing/fixtures";

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
}) {
  const payload = billingWebhookFixtures.monthlyActive();
  payload.timestamp = "2026-09-16T10:00:00.000Z";
  payload.data = {
    ...payload.data,
    product_id: BILLING_FIXTURE_PRODUCTS.PRO_MONTHLY,
    subscription_id: input.subscriptionId,
    previous_billing_date: "2026-09-01T00:00:00.000Z",
    next_billing_date: "2026-10-16T00:00:00.000Z",
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
