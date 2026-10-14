import { isFoundingProduct } from "@/lib/billing/plans";
import type {
  CheckoutPlanKey,
  FoundingReservation,
  IncomingBillingEvent,
  PlanProductMap,
} from "@/lib/billing/types";

/** Server cap. The browser never supplies this number. */
export const FOUNDING_CAP = 25;

export type FoundingPublicCount = {
  offered: boolean;
  remaining: number;
  cap: number;
};

export type FoundingUiState = "hidden" | "available" | "last" | "sold_out";

export function foundingUiState(count: {
  offered: boolean;
  remaining: number;
}): FoundingUiState {
  if (!count.offered) return "hidden";
  if (count.remaining <= 0) return "sold_out";
  if (count.remaining === 1) return "last";
  return "available";
}

export function foundingPlacesLabel(remaining: number, cap = FOUNDING_CAP): string {
  const safeCap = Number.isInteger(cap) && cap > 0 ? cap : FOUNDING_CAP;
  const safeRemaining = clampFoundingRemaining(remaining, safeCap);
  if (safeRemaining === 1) {
    return `Last founding place · 1 of ${safeCap} places left`;
  }
  return `${safeRemaining} of ${safeCap} founding places left`;
}

/** Paywall helper. Last place uses the same sentence as the pricing card. */
export function foundingPaywallPlaces(remaining: number, cap = FOUNDING_CAP): string {
  const safeCap = Number.isInteger(cap) && cap > 0 ? cap : FOUNDING_CAP;
  const safeRemaining = clampFoundingRemaining(remaining, safeCap);
  if (safeRemaining === 1) return foundingPlacesLabel(1, safeCap);
  return `${safeRemaining} of ${safeCap} places left`;
}

export function foundingSoldOutNote(cap = FOUNDING_CAP): string {
  const safeCap = Number.isInteger(cap) && cap > 0 ? cap : FOUNDING_CAP;
  return `Founding membership is full. Thanks to our first ${safeCap} customers.`;
}

function clampFoundingRemaining(remaining: number, cap: number): number {
  return Number.isInteger(remaining) ? Math.min(cap, Math.max(0, remaining)) : 0;
}

export const FOUNDING_COPY = {
  badge: "Founding member",
  title: "Founding member Pro",
  lessThanAnnual: "£100 less than standard annual",
  priceLocked: "Locked for life",
  rechecked: "Availability is re-checked at checkout.",
  cta: "Become a founding member",
  cancelTerms: "If you cancel, £290/year is still yours when you come back.",
  paywallCta: "Become a founding member – £290/yr",
  paywallMonthly: "or standard Pro £39/mo",
  soldOutMonthly: "Start Pro – £39/mo",
  soldOutAnnual: "or £390/yr (save £78)",
  raceLead: "Founding places just filled up. You haven't been charged.",
  raceBody: "Continue with standard annual at £390/yr?",
  raceAnnual: "Continue with annual – £390/yr",
  raceMonthly: "Choose monthly – £39/mo",
  recommended: "Recommended",
  annualSaving: "Save £78 vs monthly.",
  monthlyNote: "Cancel any time.",
  freeNote: "Browse previews, no card needed.",
  startMonthly: "Start Pro monthly",
  startAnnual: "Start Pro annual",
  createAccount: "Create free account",
  browse: "Browse opportunities",
} as const;

/**
 * A founding click never falls through to a standard charge.
 * `standard` is any checkout that did not ask for the founding offer.
 */
export function resolveFoundingCheckout(input: {
  planKey: CheckoutPlanKey;
  offer: unknown;
  reservation: FoundingReservation;
  testMode: boolean;
  foundingProductConfigured: boolean;
}): "standard" | "founding" | "founding_full" {
  if (input.offer !== "founding") return "standard";
  if (input.planKey !== "PRO_ANNUAL" || !input.testMode || !input.foundingProductConfigured) {
    return "founding_full";
  }
  if (input.reservation === "reserved" || input.reservation === "active") return "founding";
  return "founding_full";
}

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

/** A returning founder skips reservation. The flag is read from profiles on the server. */
export function reservationForCheckout(
  founder: boolean,
  reservation: FoundingReservation,
): FoundingReservation {
  return founder ? "active" : reservation;
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
