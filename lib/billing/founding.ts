import { DISPLAY_PRICING } from "@/lib/constants";
import { isFoundingProduct } from "@/lib/billing/plans";
import type {
  FoundingReservation,
  IncomingBillingEvent,
  PlanProductMap,
} from "@/lib/billing/types";

export const FOUNDING_UNAVAILABLE_MESSAGE = `Founding places are all taken. You can still subscribe to Pro annual at ${DISPLAY_PRICING.proAnnual}.`;

/** Stable checkout error codes. The UI (#49) matches on these. */
export const CHECKOUT_ERROR_CODES = {
  foundingCapFull: "FOUNDING_CAP_FULL",
  invalidPlan: "INVALID_PLAN",
} as const;

export type FoundingSideEffect = {
  userId: string;
  action: "activate" | "close" | "release";
  providerEventId: string;
  subscriptionId: string | null;
};

export function foundingAvailabilityPayload(remaining: number): {
  remaining: number;
  sold_out: boolean;
} {
  const safe = Number.isInteger(remaining) && remaining > 0 ? remaining : 0;
  return { remaining: safe, sold_out: safe === 0 };
}

export function foundingOfferCopy(band: string | null): {
  foundingAvailable: boolean;
  note: string | null;
} {
  if (band === "open") {
    return { foundingAvailable: true, note: null };
  }
  if (band === "fewer_than_10") {
    return { foundingAvailable: true, note: "fewer than 10 left" };
  }
  return { foundingAvailable: false, note: null };
}

export function asFoundingReservation(value: unknown): FoundingReservation {
  if (
    value === "reserved" ||
    value === "active" ||
    value === "sold_out" ||
    value === "closed"
  ) {
    return value;
  }
  return "unavailable";
}

function metadataUserId(event: IncomingBillingEvent): string | null {
  const data = event.payload.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const metadata = (data as Record<string, unknown>).metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const userId = (metadata as Record<string, unknown>).user_id;
  return typeof userId === "string" && userId.trim() ? userId.trim() : null;
}

export function foundingSideEffect(
  event: IncomingBillingEvent,
  products: PlanProductMap,
): FoundingSideEffect | null {
  const subscription = event.subscription;
  const userId = subscription?.userId ?? metadataUserId(event);
  if (!userId) return null;

  if (subscription && isFoundingProduct(subscription.dodoProductId, products)) {
    if (subscription.status === "ACTIVE") {
      return {
        userId,
        action: "activate",
        providerEventId: event.providerEventId,
        subscriptionId: subscription.dodoSubscriptionId,
      };
    }
    if (subscription.status === "CANCELLED" || subscription.status === "EXPIRED") {
      return {
        userId,
        action: "close",
        providerEventId: event.providerEventId,
        subscriptionId: subscription.dodoSubscriptionId,
      };
    }
    if (subscription.status === "FAILED") {
      return {
        userId,
        action: "release",
        providerEventId: event.providerEventId,
        subscriptionId: subscription.dodoSubscriptionId,
      };
    }
  }

  if (event.eventType === "payment.failed" && event.payment && !event.payment.succeeded) {
    return {
      userId,
      action: "release",
      providerEventId: event.providerEventId,
      subscriptionId: event.payment.subscriptionId,
    };
  }

  return null;
}
