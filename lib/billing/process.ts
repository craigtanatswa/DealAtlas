import "server-only";

import type { WebhookPayload } from "@dodopayments/core/schemas";

import { captureServerEvent } from "@/lib/analytics/server";
import { buildProSubscribedEvent } from "@/lib/analytics/server-events";
import { getAllowedProductIds } from "@/lib/billing/allowed-products";
import { applyBillingEvent } from "@/lib/billing/apply";
import { requirePlanProductMap } from "@/lib/billing/config";
import { extractBillingEvent } from "@/lib/billing/extract";
import { foundingSideEffect } from "@/lib/billing/founding";
import { proSubscribedPlan } from "@/lib/billing/analytics";
import { syncFoundingSlot } from "@/lib/billing/founding-db";
import {
  FOREIGN_PRODUCT_WEBHOOK_NOTE,
  classifyEventProductScope,
} from "@/lib/billing/product-scope";
import {
  cancelDodoSubscription,
  reconcileDodoSubscription,
  retrieveDodoPayment,
  retrieveDodoPaymentForScope,
} from "@/lib/billing/reconcile";
import { createBillingStore } from "@/lib/billing/store";
import type { ApplyResult } from "@/lib/billing/types";
import { structuredLog } from "@/lib/observability/log";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function processVerifiedDodoWebhook(input: {
  payload: WebhookPayload;
  rawBody: string;
  webhookId: string | null;
}): Promise<ApplyResult> {
  const products = requirePlanProductMap();
  const store = createBillingStore();

  // Same allowlist as entitlements (#93): this deployment's env product ids.
  // Events for any other product on the shared Dodo business are acknowledged
  // and dropped before anything is written.
  const scope = await classifyEventProductScope({
    eventType: input.payload.type,
    data: asRecord(input.payload.data),
    allowedProductIds: getAllowedProductIds(),
    store,
    retrievePayment: (paymentId) => retrieveDodoPaymentForScope(paymentId),
  });
  if (scope === "foreign") {
    structuredLog({
      level: "warn",
      msg: FOREIGN_PRODUCT_WEBHOOK_NOTE,
      event: "dodo_webhook_foreign_product",
      eventType: input.payload.type,
      job: "dodo-webhook",
    });
    return { outcome: "ignored" };
  }

  const event = extractBillingEvent(
    input.payload,
    input.rawBody,
    input.webhookId,
    products,
  );

  const result = await applyBillingEvent(event, store, {
    reconcile: async (subscriptionId) => {
      try {
        return await reconcileDodoSubscription(subscriptionId);
      } catch {
        return null;
      }
    },
    cancelSubscription: cancelDodoSubscription,
    retrievePayment: retrieveDodoPayment,
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
