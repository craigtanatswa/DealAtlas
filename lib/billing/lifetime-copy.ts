import { DISPLAY_PRICING } from "@/lib/constants";

/** Public name of the one-time plan. Never "Founding" (Craig, 10 Nov 2026). */
export const PLAN_PUBLIC_NAME = "Lifetime deal";

/** Appends 'Limited places.' (never a count) to the plan line. Set false to drop it everywhere at once. */
export const SHOW_LIMITED_PLACES = true;

export const LIMITED_PLACES_TEXT = "Limited places";

/** One-time Lifetime price, e.g. "£250". */
export const LIFETIME_PRICE = DISPLAY_PRICING.foundingLifetime;

/** The exact plan line used on cards, guides and FAQ JSON-LD. */
export const LIFETIME_PLAN_LINE = `${PLAN_PUBLIC_NAME}: ${LIFETIME_PRICE} one-time (VAT included).${SHOW_LIMITED_PLACES ? ` ${LIMITED_PLACES_TEXT}.` : ""}`;

/** Struck-through comparison anchor: the Pro annual price, e.g. "£350/yr". */
export const LIFETIME_ANCHOR = DISPLAY_PRICING.proAnnual.replace("/year", "/yr");

/** Short price, e.g. "£250 once". */
export const LIFETIME_PRICE_SHORT = `${LIFETIME_PRICE} once`;

/** Says clearly it is a single payment. */
export const LIFETIME_SINGLE_PAYMENT_NOTE = "One payment. No subscription, nothing to renew.";

export const LIFETIME_BUTTON = "Get the Lifetime deal";

export const LIFETIME_FULL_NOTE = "The Lifetime deal is sold out.";

/** Guide markdown token resolved to LIFETIME_PLAN_LINE in parseGuide before markdown parsing. */
export const LIFETIME_PLAN_LINE_TOKEN = "{{LIFETIME_PLAN_LINE}}";
