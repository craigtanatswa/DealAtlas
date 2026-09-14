import "server-only";

import type { WebhookPayload } from "@dodopayments/core/schemas";

import { applyBillingEvent } from "@/lib/billing/apply";
import { getPlanProductMap } from "@/lib/billing/config";
import { extractBillingEvent } from "@/lib/billing/extract";
import { reconcileDodoSubscription } from "@/lib/billing/reconcile";
import { createBillingStore } from "@/lib/billing/store";
import type { ApplyResult, PlanProductMap } from "@/lib/billing/types";

const UNCONFIGURED_PRODUCTS: PlanProductMap = {
  PRO_MONTHLY: "__unconfigured_monthly__",
  PRO_ANNUAL: "__unconfigured_annual__",
};

export async function processVerifiedDodoWebhook(input: {
  payload: WebhookPayload;
  rawBody: string;
  webhookId: string | null;
}): Promise<ApplyResult> {
  const products = getPlanProductMap() ?? UNCONFIGURED_PRODUCTS;
  const event = extractBillingEvent(
    input.payload,
    input.rawBody,
    input.webhookId,
    products,
  );

  return applyBillingEvent(event, createBillingStore(), {
    reconcile: async (subscriptionId) => {
      try {
        return await reconcileDodoSubscription(subscriptionId);
      } catch {
        return null;
      }
    },
  });
}
