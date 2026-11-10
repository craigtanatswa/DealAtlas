import { SIGNUP_PATH } from "@/lib/auth/redirect";
import {
  LIFETIME_BUTTON,
  LIFETIME_FULL_NOTE,
  LIFETIME_PLAN_LINE,
  LIFETIME_PRICE,
  LIFETIME_PRICE_SHORT,
  LIFETIME_SINGLE_PAYMENT_NOTE,
  LIMITED_PLACES_TEXT,
  PLAN_PUBLIC_NAME,
  SHOW_LIMITED_PLACES,
} from "@/lib/billing/lifetime-copy";
import { DISPLAY_PRICING } from "@/lib/constants";

/**
 * Checkout plan key for the one-time Lifetime plan. Contract with S&B: the
 * server maps this key to the Lifetime product id.
 */
export const FOUNDING_PLAN_KEY = "founding_lifetime" as const;

export type FoundingPlanKey = typeof FOUNDING_PLAN_KEY;

/** Fallback copy for a FOUNDING_CAP_FULL error when the server sends no message. */
export const FOUNDING_FULL_MESSAGE = `${LIFETIME_FULL_NOTE} You can still subscribe to Pro annual at ${DISPLAY_PRICING.proAnnual}.`;

/** /checkout for the founding plan. */
export function foundingCheckoutPath(): string {
  return `/checkout?plan=${FOUNDING_PLAN_KEY}`;
}

/** Signed-out founding CTA: create an account, then return to the founding checkout. */
export function foundingSignupPath(): string {
  return `${SIGNUP_PATH}?next=${encodeURIComponent(foundingCheckoutPath())}`;
}

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

function parseGbpAmount(value: string): number | null {
  const match = value.match(/^£(\d+(?:\.\d{1,2})?)$/);
  return match ? Number(match[1]) : null;
}

function annualSavePercent(): number | null {
  const monthly = parseGbpMonth(DISPLAY_PRICING.proMonthly);
  const annual = parseGbpYear(DISPLAY_PRICING.proAnnual);
  if (!monthly || !annual) return null;
  const fullYear = monthly * 12;
  if (fullYear <= 0) return null;
  const pct = Math.round(((fullYear - annual) / fullYear) * 100);
  return pct > 0 ? pct : null;
}

function annualSaveVsMonthly(): string {
  const pct = annualSavePercent();
  return pct ? `Save ${pct}% vs monthly.` : "Save vs monthly.";
}

/** Pro annual price in short form, e.g. "£350/yr". */
export function proAnnualShort(): string {
  return DISPLAY_PRICING.proAnnual.replace("/year", "/yr");
}

/** Pro annual price shown per month, e.g. "£29.17". Derived, never hardcoded. */
export function proAnnualMonthlyEquivalent(): string | null {
  const annual = parseGbpYear(DISPLAY_PRICING.proAnnual);
  if (!annual) return null;
  return `£${(annual / 12).toFixed(2)}`;
}

/** "billed £350/yr, VAT included" */
export function proAnnualBilledLine(): string {
  return `billed ${proAnnualShort()}, VAT included`;
}

/** "£39/mo" */
export function proMonthlyShort(): string {
  return DISPLAY_PRICING.proMonthly.replace("/month", "/mo");
}

/** "was £39 a month" */
export function proMonthlyWasLabel(): string {
  const monthly = parseGbpMonth(DISPLAY_PRICING.proMonthly);
  return monthly ? `was £${monthly} a month` : "was the standard monthly price";
}

/** "£250.00" */
export function foundingDueToday(): string {
  const lifetime = parseGbpAmount(LIFETIME_PRICE);
  return lifetime ? `£${lifetime.toFixed(2)}` : LIFETIME_PRICE;
}

export function foundingUiState(
  count?: FoundingPublicCount | null,
): FoundingUiState {
  if (!count || !count.offered) return "hidden";
  if (count.sold_out) return "sold_out";
  return "available";
}

/** Limited-places copy. No count, cap or other number is ever rendered. */
export const FOUNDING_LIMITED_PLACES = LIMITED_PLACES_TEXT;

export function foundingPlacesLabel(): string | null {
  return SHOW_LIMITED_PLACES ? LIMITED_PLACES_TEXT : null;
}

/** Paywall helper. Uses the same limited-places copy as the pricing card. */
export function foundingPaywallPlaces(): string | null {
  return foundingPlacesLabel();
}

/** Sold-out note. Deliberately carries no count or cap. */
export function foundingSoldOutNote(): string {
  return FOUNDING_FULL_MESSAGE;
}

export const FOUNDING_COPY = {
  badge: PLAN_PUBLIC_NAME,
  title: PLAN_PUBLIC_NAME,
  priceLocked: LIFETIME_SINGLE_PAYMENT_NOTE,
  rechecked: "Availability is re-checked at checkout.",
  cta: LIFETIME_BUTTON,
  paywallCta: `${LIFETIME_BUTTON} – ${LIFETIME_PRICE_SHORT}`,
  paywallMonthly: `or standard Pro ${DISPLAY_PRICING.proMonthly.replace("/month", "/mo")}`,
  soldOutMonthly: `Start Pro – ${DISPLAY_PRICING.proMonthly.replace("/month", "/mo")}`,
  soldOutAnnual: "Or Pro annual",
  raceLead: "The Lifetime deal just sold out. You haven't been charged.",
  notEligibleLead: `The Lifetime deal can't be bought again on this account. You can still subscribe to Pro annual at ${DISPLAY_PRICING.proAnnual}.`,
  raceBody: `Continue with standard annual at ${DISPLAY_PRICING.proAnnual.replace("/year", "/yr")}?`,
  raceAnnual: "Continue with annual",
  raceMonthly: `Choose monthly – ${DISPLAY_PRICING.proMonthly.replace("/month", "/mo")}`,
  recommended: "Recommended",
  annualSaving: annualSaveVsMonthly(),
  monthlyNote: "Cancel any time.",
  freeNote: "Browse previews, no card needed.",
  startMonthly: "Start Pro monthly",
  startAnnual: "Start Pro annual",
  createAccount: "Create free account",
  browse: "Browse opportunities",
  planLine: LIFETIME_PLAN_LINE,
} as const;
