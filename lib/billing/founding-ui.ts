import { SIGNUP_PATH } from "@/lib/auth/redirect";
import { DISPLAY_PRICING } from "@/lib/constants";

/**
 * Checkout plan key for the founding offer (separate from PRO_ANNUAL).
 * Owned by Security & Billing; keep this the only place the string appears.
 */
export const FOUNDING_PLAN_KEY = "FOUNDING" as const;
export type FoundingPlanKey = typeof FOUNDING_PLAN_KEY;

/** Fallback copy for a FOUNDING_CAP_FULL error when the server sends no message. */
export const FOUNDING_FULL_MESSAGE = `Founding places are all taken. You can still subscribe to Pro annual at ${DISPLAY_PRICING.proAnnual}.`;

/** /checkout for the founding plan. */
export function foundingCheckoutPath(): string {
  return `/checkout?plan=${FOUNDING_PLAN_KEY}`;
}

/** Signed-out founding CTA: create an account, then return to the founding checkout. */
export function foundingSignupPath(): string {
  return `${SIGNUP_PATH}?next=${encodeURIComponent(foundingCheckoutPath())}`;
}

/** Server cap. The browser never supplies this number. */
export const FOUNDING_CAP = 25;

export type FoundingPublicCount = {
  offered: boolean;
  remaining: number;
  cap: number;
};

export type FoundingUiState = "hidden" | "available" | "last" | "sold_out";

function parseGbpYear(value: string): number | null {
  const match = value.match(/£(\d+)\/year/);
  return match ? Number(match[1]) : null;
}

function parseGbpMonth(value: string): number | null {
  const match = value.match(/£(\d+)\/month/);
  return match ? Number(match[1]) : null;
}

function foundingAnnualShort(): string {
  return DISPLAY_PRICING.foundingAnnual.replace("/year", "/yr");
}

function foundingLessThanAnnual(): string {
  const annual = parseGbpYear(DISPLAY_PRICING.proAnnual);
  const founding = parseGbpYear(DISPLAY_PRICING.foundingAnnual);
  if (annual && founding && annual > founding) {
    return `£${annual - founding} less than standard annual`;
  }
  return "Less than standard annual";
}

function annualSaveVsMonthly(): string {
  const monthly = parseGbpMonth(DISPLAY_PRICING.proMonthly);
  const annual = parseGbpYear(DISPLAY_PRICING.proAnnual);
  if (monthly && annual) {
    const save = monthly * 12 - annual;
    if (save > 0) return `Save £${save} vs monthly.`;
  }
  return "Save vs monthly.";
}

function soldOutAnnualLink(): string {
  const annual = parseGbpYear(DISPLAY_PRICING.proAnnual);
  const monthly = parseGbpMonth(DISPLAY_PRICING.proMonthly);
  if (monthly && annual) {
    const save = monthly * 12 - annual;
    if (save > 0) {
      return `or ${DISPLAY_PRICING.proAnnual.replace("/year", "/yr")} (save £${save})`;
    }
  }
  return `or ${DISPLAY_PRICING.proAnnual.replace("/year", "/yr")}`;
}

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
  firstMembers: `First ${FOUNDING_CAP} members only`,
  lessThanAnnual: foundingLessThanAnnual(),
  priceLocked: "Locked for life",
  rechecked: "Availability is re-checked at checkout.",
  cta: "Become a founding member",
  cancelTerms: `If you cancel, ${DISPLAY_PRICING.foundingAnnual} is still yours when you come back.`,
  paywallCta: `Become a founding member – ${foundingAnnualShort()}`,
  paywallMonthly: `or standard Pro ${DISPLAY_PRICING.proMonthly.replace("/month", "/mo")}`,
  soldOutMonthly: `Start Pro – ${DISPLAY_PRICING.proMonthly.replace("/month", "/mo")}`,
  soldOutAnnual: soldOutAnnualLink(),
  raceLead: "Founding places just filled up. You haven't been charged.",
  raceBody: `Continue with standard annual at ${DISPLAY_PRICING.proAnnual.replace("/year", "/yr")}?`,
  raceAnnual: `Continue with annual – ${DISPLAY_PRICING.proAnnual.replace("/year", "/yr")}`,
  raceMonthly: `Choose monthly – ${DISPLAY_PRICING.proMonthly.replace("/month", "/mo")}`,
  recommended: "Recommended",
  annualSaving: annualSaveVsMonthly(),
  monthlyNote: "Cancel any time.",
  freeNote: "Browse previews, no card needed.",
  startMonthly: "Start Pro monthly",
  startAnnual: "Start Pro annual",
  createAccount: "Create free account",
  browse: "Browse opportunities",
} as const;
