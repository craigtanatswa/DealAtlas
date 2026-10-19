import "server-only";

import type { WebhookPayload } from "@dodopayments/core/schemas";

import { captureServerEvent } from "@/lib/analytics/server";
import { buildProSubscribedEvent } from "@/lib/analytics/server-events";
import { applyBillingEvent } from "@/lib/billing/apply";
import { requirePlanProductMap } from "@/lib/billing/config";
import { extractBillingEvent } from "@/lib/billing/extract";
import { foundingSideEffect } from "@/lib/billing/founding";
import { proSubscribedPlan } from "@/lib/billing/analytics";
import { syncFoundingSlot } from "@/lib/billing/founding-db";
import { reconcileDodoSubscription } from "@/lib/billing/reconcile";
import { createBillingStore } from "@/lib/billing/store";
import type { ApplyResult } from "@/lib/billing/types";

export async function processVerifiedDodoWebhook(input: {
  payload: WebhookPayload;
  rawBody: string;
  webhookId: string | null;
}): Promise<ApplyResult> {
  const products = requirePlanProductMap();
  const event = extractBillingEvent(
    input.payload,
    input.rawBody,
    input.webhookId,
    products,
  );

  const store = createBillingStore();
  const result = await applyBillingEvent(event, store, {
    reconcile: async (subscriptionId) => {
      try {
        return await reconcileDodoSubscription(subscriptionId);
      } catch {
        return null;
      }
    },
  });

  // payment.failed is applied as "ignored" and still releases a reservation.
  // A failed slot write must not leave the event PROCESSED, or a redelivery
  // would be treated as a duplicate and skip the slot.
  const effect =
    result.outcome === "applied" || result.outcome === "ignored"
      ? foundingSideEffect(event, products)
      : null;
  if (effect) {
    try {
      await syncFoundingSlot(effect);
    } catch (error) {
      try {
        await store.markEvent(
          event.providerEventId,
          "FAILED",
          "founding slot update failed",
        );
      } catch {
        // The slot error is what Dodo must retry.
      }
      throw error;
    }
  }

  // pro_subscribed: only on the first processing of a subscription.active
  // event (duplicates return "duplicate" above), with allowlisted fields only.
  const plan = result.outcome === "applied" ? proSubscribedPlan(event, products) : null;
  if (plan && event.subscription) {
    const stored = await store
      .getSubscriptionByDodoId(event.subscription.dodoSubscriptionId)
      .catch(() => null);
    if (stored?.userId) {
      await captureServerEvent(
        buildProSubscribedEvent({
          userId: stored.userId,
          providerEventId: event.providerEventId,
          plan,
        }),
      );
    }
  }

  return result;
}
