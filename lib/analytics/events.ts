/**
 * The full PostHog event list (Security-cleared 19 Oct 2026). Adding an event
 * or a property here needs fresh Security clearance.
 */

export const CLIENT_EVENTS = [
  "$pageview",
  "guide_cta_clicked",
  "pro_checkout_started",
  "alerts_signup_viewed",
  "alerts_signup_submitted",
  "alerts_signup_result",
] as const;
export type ClientEventName = (typeof CLIENT_EVENTS)[number];

export const ALERTS_OUTCOMES = ["pending", "invalid", "rate_limited"] as const;

export const SERVER_EVENTS = ["user_signed_up", "pro_subscribed"] as const;
export type ServerEventName = (typeof SERVER_EVENTS)[number];

export const CHECKOUT_ANALYTICS_PLANS = ["monthly", "annual", "founding"] as const;
export type CheckoutAnalyticsPlan = (typeof CHECKOUT_ANALYTICS_PLANS)[number];

export const GUIDE_CTA_POSITIONS = ["mid", "after_answer", "end"] as const;
export const GUIDE_CTA_TARGETS = ["deals", "signup", "pricing"] as const;

/**
 * Published guide slugs. A /guides/{slug} path keeps its slug only when it is
 * listed here; anything else is recorded as /guides/[guide]. Add a slug when
 * its guide is approved and published.
 */
export const KNOWN_GUIDE_SLUGS: readonly string[] = [
  "how-to-win-council-contracts",
  "how-to-find-public-sector-tenders",
];

export function isKnownGuideSlug(value: unknown): value is string {
  return typeof value === "string" && KNOWN_GUIDE_SLUGS.includes(value);
}

export function isCheckoutAnalyticsPlan(value: unknown): value is CheckoutAnalyticsPlan {
  return (
    typeof value === "string" &&
    (CHECKOUT_ANALYTICS_PLANS as readonly string[]).includes(value)
  );
}

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;
export type UtmKey = (typeof UTM_KEYS)[number];

/** user_signed_up carries only these three UTM fields. */
export const SIGNUP_UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;
