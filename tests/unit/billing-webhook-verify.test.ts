import { describe, expect, it } from "vitest";
import { Webhook } from "standardwebhooks";
import { verifyWebhookPayload } from "@dodopayments/core/webhook";

import {
  BILLING_FIXTURE_WEBHOOK_SECRET,
  billingWebhookFixtures,
} from "@/lib/billing";

function signedHeaders(body: string) {
  const webhook = new Webhook(BILLING_FIXTURE_WEBHOOK_SECRET);
  const id = "evt_signed_fixture";
  const timestamp = new Date();
  const signature = webhook.sign(id, timestamp, body);
  return {
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": signature,
  };
}

describe("dodo webhook signature verification", () => {
  it("accepts a signed official payload", async () => {
    const body = JSON.stringify(billingWebhookFixtures.monthlyActive());
    const payload = await verifyWebhookPayload({
      webhookKey: BILLING_FIXTURE_WEBHOOK_SECRET,
      headers: signedHeaders(body),
      body,
    });
    expect(payload.type).toBe("subscription.active");
  });

  it("rejects an unsigned payload", async () => {
    const body = JSON.stringify(billingWebhookFixtures.monthlyActive());
    await expect(
      verifyWebhookPayload({
        webhookKey: BILLING_FIXTURE_WEBHOOK_SECRET,
        headers: {
          "webhook-id": "evt_forged",
          "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
          "webhook-signature": "v1,forged",
        },
        body,
      }),
    ).rejects.toThrow();
  });
});
