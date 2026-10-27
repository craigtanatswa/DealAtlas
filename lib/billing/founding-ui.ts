import { FOUNDING_NOT_ELIGIBLE_MESSAGE, FOUNDING_UNAVAILABLE_MESSAGE } from "@/lib/billing/founding";
import type { CheckoutPlanKey } from "@/lib/billing/types";
import { DISPLAY_PRICING } from "@/lib/constants";

/** Checkout plan key for the founding offer. Shared with the #49 UI. */
export const FOUNDING_PLAN_KEY = "FOUNDING" satisfies CheckoutPlanKey;

/** Server cap. The browser never supplies this number. */
export const FOUNDING_CAP = 25;

/** Public founding state. No remaining, used or cap numbers. */
export type FoundingPublicCount = {
  offered: boolean;
  sold_out: boolean;
};

export type FoundingUiState = "hidden" | "available" | "sold_out";

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
  sold_out: boolean;
}): FoundingUiState {
  if (!count.offered) return "hidden";
  if (count.sold_out) return "sold_out";
  return "available";
}

/** Public places line. Deliberately carries no count. */
export const FOUNDING_PLACES_AVAILABLE = "Founding places available";

export function foundingPlacesLabel(): string {
  return FOUNDING_PLACES_AVAILABLE;
}

export function foundingPaywallPlaces(): string {
  return FOUNDING_PLACES_AVAILABLE;
}

export function foundingSoldOutNote(cap = FOUNDING_CAP): string {
  const safeCap = Number.isInteger(cap) && cap > 0 ? cap : FOUNDING_CAP;
  return `Founding membership is full. Thanks to our first ${safeCap} customers.`;
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
  raceLead: FOUNDING_UNAVAILABLE_MESSAGE,
  notEligibleLead: FOUNDING_NOT_ELIGIBLE_MESSAGE,
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
