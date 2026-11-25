import "server-only";

import DodoPayments from "dodopayments";

import { requireDodoApiConfig, requirePlanProductMap } from "@/lib/billing/config";
import { snapshotFromSubscriptionFields } from "@/lib/billing/extract";
import type { ScopePaymentFacts } from "@/lib/billing/product-scope";
import type { PaymentFacts, SubscriptionSnapshot } from "@/lib/billing/types";

export const SCOPE_PAYMENT_LOOKUP_OPTIONS = {
  timeout: 10_000,
  maxRetries: 1,
} as const;

function createDodoClient() {
  const config = requireDodoApiConfig();
  return new DodoPayments({
    bearerToken: config.bearerToken,
    environment: config.environment,
  });
}

export async function reconcileDodoSubscription(
  dodoSubscriptionId: string,
): Promise<SubscriptionSnapshot | null> {
  const client = createDodoClient();
  const products = requirePlanProductMap();
  const subscription = await client.subscriptions.retrieve(dodoSubscriptionId);
  return snapshotFromSubscriptionFields(
    subscription as unknown as Record<string, unknown>,
    products,
  );
}

/** Read-only payment facts used to resolve a refund/dispute back to a subscription. */
export async function retrieveDodoPayment(
  paymentId: string,
): Promise<PaymentFacts | null> {
  const client = createDodoClient();
  const payment = await client.payments.retrieve(paymentId);
  return {
    subscriptionId: payment.subscription_id ?? null,
    totalAmount:
      typeof payment.total_amount === "number" ? payment.total_amount : null,
    currency: payment.currency ?? null,
  };
}

/** Read-only payment facts plus cart product ids for webhook scope checks. */
export async function retrieveDodoPaymentForScope(
  paymentId: string,
): Promise<ScopePaymentFacts | null> {
  const client = createDodoClient();
  const payment = await client.payments.retrieve(
    paymentId,
    SCOPE_PAYMENT_LOOKUP_OPTIONS,
  );
  const productIds = (payment.product_cart ?? [])
    .map((item) =>
      typeof item?.product_id === "string" ? item.product_id.trim() : "",
    )
    .filter((id) => id.length > 0);
  return {
    subscriptionId: payment.subscription_id ?? null,
    totalAmount:
      typeof payment.total_amount === "number" ? payment.total_amount : null,
    currency: payment.currency ?? null,
    productIds,
  };
}

/** Immediately stop future charges after a refund or lost chargeback. */
export async function cancelDodoSubscription(
  dodoSubscriptionId: string,
): Promise<void> {
  const client = createDodoClient();
  await client.subscriptions.update(dodoSubscriptionId, {
    status: "cancelled",
  });
}
