import { cleanPath } from "@/lib/analytics/clean-path";
import { SIGNUP_UTM_KEYS } from "@/lib/analytics/events";
import { cleanReferrer, parsePageUrl } from "@/lib/analytics/sanitize";

/**
 * First-touch attribution for sign-ups, kept in memory only (no cookie or
 * storage), and passed to the server as hidden sign-up form fields.
 */

export const ATTRIBUTION_FIELDS = {
  firstLandingPath: "analytics_first_landing_path",
  firstReferrerDomain: "analytics_first_referrer_domain",
  utm_source: "analytics_utm_source",
  utm_medium: "analytics_utm_medium",
  utm_campaign: "analytics_utm_campaign",
  signupSourceGuide: "analytics_signup_source_guide",
} as const;

type Attribution = {
  firstLandingPath: string;
  firstReferrerDomain?: string;
  utm: Partial<Record<(typeof SIGNUP_UTM_KEYS)[number], string>>;
  lastGuideSlug?: string;
};

let attribution: Attribution | null = null;

/** Records the landing page once per tab. Later calls only track guides. */
export function recordLanding(input: { href: string; referrer: string; origin: string }): void {
  const page = parsePageUrl(input.href, input.origin);
  if (!page) {
    return;
  }
  if (!attribution) {
    const referrer = cleanReferrer(input.referrer, input.origin);
    const external =
      referrer && referrer.domain !== "$direct" && !referrer.referrer.startsWith("/")
        ? referrer.domain
        : undefined;
    attribution = {
      firstLandingPath: page.cleaned,
      firstReferrerDomain: external,
      utm: {
        utm_source: page.utm.utm_source,
        utm_medium: page.utm.utm_medium,
        utm_campaign: page.utm.utm_campaign,
      },
    };
  }
  recordPageView(page.cleaned);
}

export function recordPageView(pathname: string): void {
  const cleaned = cleanPath(pathname);
  if (attribution && cleaned?.startsWith("/guides/") && cleaned !== "/guides/[guide]") {
    attribution.lastGuideSlug = cleaned.slice("/guides/".length);
  }
}

export function attributionFormValues(): Record<string, string> {
  if (!attribution) {
    return {};
  }
  const values: Record<string, string> = {
    [ATTRIBUTION_FIELDS.firstLandingPath]: attribution.firstLandingPath,
  };
  if (attribution.firstReferrerDomain) {
    values[ATTRIBUTION_FIELDS.firstReferrerDomain] = attribution.firstReferrerDomain;
  }
  for (const key of SIGNUP_UTM_KEYS) {
    const value = attribution.utm[key];
    if (value) {
      values[ATTRIBUTION_FIELDS[key]] = value;
    }
  }
  if (attribution.lastGuideSlug) {
    values[ATTRIBUTION_FIELDS.signupSourceGuide] = attribution.lastGuideSlug;
  }
  return values;
}

/** Test hook. */
export function resetAttributionForTests(): void {
  attribution = null;
}
