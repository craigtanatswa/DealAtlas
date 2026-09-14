import { uuidSchema } from "@/lib/validation";
import type { WebhookPayload } from "@dodopayments/core/schemas";

import { toIsoDate } from "@/lib/billing/event-id";
import { CHECKOUT_METADATA_KEYS, readMetadataString } from "@/lib/billing/metadata";
import { mapProductId, type PlanProductMap } from "@/lib/billing/plans";
import { mapDodoSubscriptionStatus } from "@/lib/billing/status";
import type {
  IncomingBillingEvent,
  PaymentSnapshot,
  SubscriptionSnapshot,
} from "@/lib/billing/types";
import { hashWebhookPayload, providerEventId } from "@/lib/billing/event-id";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataUserId(metadata: Record<string, unknown>): string | null {
  const raw =
    readMetadataString(metadata, CHECKOUT_METADATA_KEYS.userId) ??
    readMetadataString(metadata, "userId");
  if (!raw) {
    return null;
  }
  const parsed = uuidSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function jsonPayload(payload: WebhookPayload): Record<string, unknown> {
  return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
}

export function snapshotFromSubscriptionFields(
  data: Record<string, unknown>,
  products: PlanProductMap,
): SubscriptionSnapshot | null {
  const subscriptionId = readString(data.subscription_id);
  const customer = asRecord(data.customer);
  const customerId = readString(customer.customer_id);
  const productId = readString(data.product_id);
  if (!subscriptionId || !customerId || !productId) {
    return null;
  }

  const mapped = mapProductId(productId, products);
  const metadata = asRecord(data.metadata);
  const status = mapped
    ? mapDodoSubscriptionStatus(readString(data.status))
    : "UNKNOWN";

  return {
    dodoCustomerId: customerId,
    dodoSubscriptionId: subscriptionId,
    dodoProductId: productId,
    userId: metadataUserId(metadata) ?? metadataUserId(asRecord(customer.metadata)),
    planKey: mapped?.planKey ?? null,
    billingInterval: mapped?.billingInterval ?? null,
    status,
    cancelAtPeriodEnd: data.cancel_at_next_billing_date === true,
    currentPeriodStart: toIsoDate(
      (data.previous_billing_date as Date | string | undefined) ??
        (data.created_at as Date | string | undefined),
    ),
    currentPeriodEnd: toIsoDate(data.next_billing_date as Date | string | undefined),
    cancelledAt: toIsoDate(data.cancelled_at as Date | string | null | undefined),
    productKnown: Boolean(mapped),
  };
}

function extractSubscription(
  data: Record<string, unknown>,
  products: PlanProductMap,
): SubscriptionSnapshot | null {
  if (readString(data.payload_type) !== "Subscription") {
    return null;
  }
  return snapshotFromSubscriptionFields(data, products);
}

function extractPayment(data: Record<string, unknown>): PaymentSnapshot | null {
  if (readString(data.payload_type) !== "Payment") {
    return null;
  }
  const paymentId = readString(data.payment_id);
  if (!paymentId) {
    return null;
  }
  const customer = asRecord(data.customer);
  const status = readString(data.status);
  return {
    paymentId,
    subscriptionId: readString(data.subscription_id),
    customerId: readString(customer.customer_id),
    succeeded: status === "succeeded",
  };
}

export function extractBillingEvent(
  payload: WebhookPayload,
  rawBody: string,
  webhookId: string | null,
  products: PlanProductMap,
): IncomingBillingEvent {
  const data = asRecord(payload.data);
  const subscription = extractSubscription(data, products);
  const payment = extractPayment(data);
  const payloadHash = hashWebhookPayload(rawBody);
  const occurredAt = toIsoDate(payload.timestamp);

  return {
    providerEventId: providerEventId({
      webhookId,
      eventType: payload.type,
      payloadHash,
      occurredAt,
      subscriptionId: subscription?.dodoSubscriptionId ?? payment?.subscriptionId,
      paymentId: payment?.paymentId,
    }),
    eventType: payload.type,
    payloadHash,
    payload: jsonPayload(payload),
    occurredAt,
    subscription,
    payment,
  };
}

export const HANDLED_SUBSCRIPTION_EVENTS = [
  "subscription.active",
  "subscription.renewed",
  "subscription.updated",
  "subscription.plan_changed",
  "subscription.on_hold",
  "subscription.cancelled",
  "subscription.failed",
  "subscription.expired",
  "subscription.paused",
  "subscription.unpaused",
] as const;

export const HANDLED_PAYMENT_EVENTS = [
  "payment.succeeded",
  "payment.failed",
] as const;
