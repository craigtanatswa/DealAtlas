import { SIGNUP_PATH } from "@/lib/auth/redirect";
import { DISPLAY_PRICING } from "@/lib/constants";

/**
 * Checkout plan key for the founding offer (separate from PRO_ANNUAL).
 * Owned by Security & Billing; keep this the only place the string appears.
 */
export const FOUNDING_PLAN_KEY = "FOUNDING" as const;
export type FoundingPlanKey = typeof FOUNDING_PLAN_KEY;

/** Exact server copy when founding is full (matched to show the inline fallback). */
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

function soldOutAnnualLink(): string {
  const pct = annualSavePercent();
  const annualShort = DISPLAY_PRICING.proAnnual.replace("/year", "/yr");
  return pct ? `or ${annualShort} (save ${pct}%)` : `or ${annualShort}`;
}

/** Founding annual price shown per month, e.g. "£24.17". Derived, never hardcoded. */
export function foundingMonthlyEquivalent(): string | null {
  const founding = parseGbpYear(DISPLAY_PRICING.foundingAnnual);
  if (!founding) return null;
  return `£${(founding / 12).toFixed(2)}`;
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

/** "billed £290/yr, VAT included" */
export function foundingBilledLine(): string {
  return `billed ${DISPLAY_PRICING.foundingAnnual.replace("/year", "/yr")}, VAT included`;
}

/** "£290.00" */
export function foundingDueToday(): string {
  const founding = parseGbpYear(DISPLAY_PRICING.foundingAnnual);
  return founding ? `£${founding.toFixed(2)}` : DISPLAY_PRICING.foundingAnnual;
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
    return "Last founding place · 1 place left";
  }
  return `${safeRemaining} places left`;
}

/** Paywall helper. Last place uses the same sentence as the pricing card. */
export function foundingPaywallPlaces(remaining: number, cap = FOUNDING_CAP): string {
  const safeCap = Number.isInteger(cap) && cap > 0 ? cap : FOUNDING_CAP;
  const safeRemaining = clampFoundingRemaining(remaining, safeCap);
  if (safeRemaining === 1) return foundingPlacesLabel(1, safeCap);
  return `${safeRemaining} places left`;
}

export function foundingSoldOutNote(_cap = FOUNDING_CAP): string {
  void _cap;
  return "Founding membership is full. Thanks to our founding members.";
}

function clampFoundingRemaining(remaining: number, cap: number): number {
  return Number.isInteger(remaining) ? Math.min(cap, Math.max(0, remaining)) : 0;
}

export const FOUNDING_COPY = {
  badge: "Founding member",
  title: "Founding member Pro",
  firstMembers: "Founding places are limited",
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
