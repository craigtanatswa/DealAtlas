import "server-only";

import {
  CHECKOUT_METADATA_KEYS,
  readMetadataString,
} from "@/lib/billing/metadata";
import type { BillingStore, RetrievePaymentFn } from "@/lib/billing/types";
import { uuidSchema } from "@/lib/validation";

export type EventProductScope = "ours" | "foreign";

export const FOREIGN_PRODUCT_WEBHOOK_NOTE =
  "foreign_product_event: Dodo event for a product outside this deployment's allowlist; acknowledged and ignored.";

type ProductScopeStore = Pick<
  BillingStore,
  | "profileExists"
  | "getSubscriptionByDodoId"
  | "getSubscriptionByCustomerId"
  | "getPaymentFacts"
  | "getLifetimeGrantByPayment"
>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function collectProductIds(data: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const direct = readString(data.product_id);
  if (direct) {
    ids.add(direct);
  }
  const cart = Array.isArray(data.product_cart) ? data.product_cart : [];
  for (const item of cart) {
    const id = readString(asRecord(item).product_id);
    if (id) {
      ids.add(id);
    }
  }
  return [...ids];
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

function metadataUserIds(data: Record<string, unknown>): string[] {
  const customer = asRecord(data.customer);
  return [
    metadataUserId(asRecord(data.metadata)),
    metadataUserId(asRecord(customer.metadata)),
  ].filter((id): id is string => Boolean(id));
}

function isReversalEvent(eventType: string): boolean {
  return eventType.startsWith("refund.") || eventType.startsWith("dispute.");
}

export async function classifyEventProductScope(input: {
  eventType: string;
  data: Record<string, unknown>;
  allowedProductIds: ReadonlySet<string>;
  store: ProductScopeStore;
  retrievePayment?: RetrievePaymentFn;
}): Promise<EventProductScope> {
  const { eventType, data, allowedProductIds, store, retrievePayment } = input;

  const productIds = collectProductIds(data);
  if (productIds.length > 0) {
    return productIds.some((id) => allowedProductIds.has(id))
      ? "ours"
      : "foreign";
  }

  try {
    for (const userId of metadataUserIds(data)) {
      if (await store.profileExists(userId)) {
        return "ours";
      }
    }

    const subscriptionId = readString(data.subscription_id);
    if (
      subscriptionId &&
      (await store.getSubscriptionByDodoId(subscriptionId))
    ) {
      return "ours";
    }

    const customerId = readString(asRecord(data.customer).customer_id);
    if (
      customerId &&
      (await store.getSubscriptionByCustomerId(customerId))
    ) {
      return "ours";
    }

    const paymentId = readString(data.payment_id);
    if (paymentId) {
      const grant = await store.getLifetimeGrantByPayment(paymentId);
      if (grant) {
        return "ours";
      }
      const facts = await store.getPaymentFacts(paymentId);
      if (facts) {
        return "ours";
      }

      if (isReversalEvent(eventType) && retrievePayment) {
        const remote = await retrievePayment(paymentId);
        if (
          remote?.subscriptionId &&
          (await store.getSubscriptionByDodoId(remote.subscriptionId))
        ) {
          return "ours";
        }
      }
    }
  } catch {
    return "ours";
  }

  return "foreign";
}
