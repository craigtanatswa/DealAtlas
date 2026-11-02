import { cleanPath } from "@/lib/analytics/clean-path";
import { hasAnalyticsConsent } from "@/lib/analytics/consent";
import {
  SIGNUP_UTM_KEYS,
  isGuideCtaPosition,
  isGuideCtaTarget,
  isKnownGuideSlug,
} from "@/lib/analytics/events";
import { firstTouchReferrerDomain, parsePageUrl } from "@/lib/analytics/sanitize";
import { ANALYTICS_FIRST_TOUCH_STORAGE_KEY } from "@/lib/analytics/storage-keys";
import { readLocalValue, removeLocalValue, writeLocalValue } from "@/lib/analytics/storage";

export type GuideCtaPosition = "mid" | "after_answer" | "end";
export type GuideCtaTarget = "deals" | "signup" | "pricing";

export const ATTRIBUTION_FIELDS = {
  firstLandingPath: "analytics_first_landing_path",
  firstReferrerDomain: "analytics_first_referrer_domain",
  firstTouchLandingPath: "analytics_first_touch_landing_path",
  firstTouchReferrerDomain: "analytics_first_touch_referrer_domain",
  firstTouchGuideCta: "analytics_first_touch_guide_cta",
  firstTouchGuideCtaPosition: "analytics_first_touch_guide_cta_position",
  firstTouchGuideCtaTarget: "analytics_first_touch_guide_cta_target",
  consent: "analytics_consent",
  utm_source: "analytics_utm_source",
  utm_medium: "analytics_utm_medium",
  utm_campaign: "analytics_utm_campaign",
  signupSourceGuide: "analytics_signup_source_guide",
} as const;

export const ANALYTICS_CONSENT_FIELD = ATTRIBUTION_FIELDS.consent;

type SignupUtmKey = (typeof SIGNUP_UTM_KEYS)[number];

type StoredFirstTouch = {
  landingPath: string;
  referrerDomain: string;
  utm: Partial<Record<SignupUtmKey, string>>;
  lastGuideSlug?: string;
  guideCta?: { position: GuideCtaPosition; target: GuideCtaTarget };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStoredFirstTouch(): StoredFirstTouch | null {
  const raw = readLocalValue(ANALYTICS_FIRST_TOUCH_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }
    const landingPath = typeof parsed.landingPath === "string" ? cleanPath(parsed.landingPath) : null;
    const referrerDomain =
      typeof parsed.referrerDomain === "string"
        ? firstTouchReferrerDomain(parsed.referrerDomain)
        : null;
    if (!landingPath || !referrerDomain) {
      return null;
    }
    const utm: Partial<Record<SignupUtmKey, string>> = {};
    if (isRecord(parsed.utm)) {
      for (const key of SIGNUP_UTM_KEYS) {
        const value = parsed.utm[key];
        if (typeof value === "string" && value) {
          utm[key] = value;
        }
      }
    }
    const lastGuideSlug = isKnownGuideSlug(parsed.lastGuideSlug) ? parsed.lastGuideSlug : undefined;
    let guideCta: StoredFirstTouch["guideCta"];
    if (isRecord(parsed.guideCta)) {
      const position = parsed.guideCta.position;
      const target = parsed.guideCta.target;
      if (isGuideCtaPosition(position) && isGuideCtaTarget(target)) {
        guideCta = { position, target };
      }
    }
    const touch: StoredFirstTouch = {
      landingPath,
      referrerDomain,
      utm,
      ...(lastGuideSlug ? { lastGuideSlug } : {}),
      ...(guideCta ? { guideCta } : {}),
    };
    return touch;
  } catch {
    return null;
  }
}

function writeStoredFirstTouch(touch: StoredFirstTouch): void {
  writeLocalValue(ANALYTICS_FIRST_TOUCH_STORAGE_KEY, JSON.stringify(touch));
}

function signupUtm(page: ReturnType<typeof parsePageUrl>): Partial<Record<SignupUtmKey, string>> {
  const utm: Partial<Record<SignupUtmKey, string>> = {};
  if (!page) {
    return utm;
  }
  for (const key of SIGNUP_UTM_KEYS) {
    const value = page.utm[key];
    if (value) {
      utm[key] = value;
    }
  }
  return utm;
}

export function recordLanding(input: { href: string; referrer: string; origin: string }): void {
  if (!hasAnalyticsConsent()) {
    return;
  }
  const page = parsePageUrl(input.href, input.origin);
  if (!page) {
    return;
  }
  const existing = readStoredFirstTouch();
  if (!existing) {
    writeStoredFirstTouch({
      landingPath: page.cleaned,
      referrerDomain: firstTouchReferrerDomain(input.referrer, input.origin),
      utm: signupUtm(page),
    });
  }
  recordPageView(page.cleaned);
}

export function recordPageView(pathname: string): void {
  if (!hasAnalyticsConsent()) {
    return;
  }
  const cleaned = cleanPath(pathname);
  if (!cleaned) {
    return;
  }
  const guideSlug =
    cleaned.startsWith("/guides/") && cleaned !== "/guides/[guide]"
      ? cleaned.slice("/guides/".length)
      : null;
  if (!guideSlug) {
    return;
  }
  const touch = readStoredFirstTouch();
  if (!touch || touch.lastGuideSlug === guideSlug) {
    return;
  }
  writeStoredFirstTouch({ ...touch, lastGuideSlug: guideSlug });
}

export function recordGuideCtaClick(position: unknown, target: unknown): void {
  if (!hasAnalyticsConsent() || !isGuideCtaPosition(position) || !isGuideCtaTarget(target)) {
    return;
  }
  let touch = readStoredFirstTouch();
  if (!touch && typeof window !== "undefined") {
    recordLanding({
      href: window.location.href,
      referrer: "",
      origin: window.location.origin,
    });
    touch = readStoredFirstTouch();
  }
  if (!touch) {
    return;
  }
  writeStoredFirstTouch({ ...touch, guideCta: { position, target } });
}

export function attributionFormValues(): Record<string, string> {
  if (!hasAnalyticsConsent()) {
    return {};
  }
  const touch = readStoredFirstTouch();
  if (!touch) {
    return {};
  }
  const values: Record<string, string> = {
    [ATTRIBUTION_FIELDS.consent]: "granted",
    [ATTRIBUTION_FIELDS.firstTouchLandingPath]: touch.landingPath,
    [ATTRIBUTION_FIELDS.firstTouchReferrerDomain]: touch.referrerDomain,
  };
  for (const key of SIGNUP_UTM_KEYS) {
    const value = touch.utm[key];
    if (value) {
      values[ATTRIBUTION_FIELDS[key]] = value;
    }
  }
  if (touch.lastGuideSlug) {
    values[ATTRIBUTION_FIELDS.signupSourceGuide] = touch.lastGuideSlug;
  }
  if (touch.guideCta) {
    values[ATTRIBUTION_FIELDS.firstTouchGuideCtaPosition] = touch.guideCta.position;
    values[ATTRIBUTION_FIELDS.firstTouchGuideCtaTarget] = touch.guideCta.target;
  }
  return values;
}

export function startFirstTouchAfterConsent(
  input?: { href: string; origin: string },
): void {
  if (!hasAnalyticsConsent()) {
    return;
  }
  if (input) {
    recordLanding({ href: input.href, referrer: "", origin: input.origin });
    return;
  }
  if (typeof window === "undefined") {
    return;
  }
  recordLanding({
    href: window.location.href,
    referrer: "",
    origin: window.location.origin,
  });
}

export function resetAttributionForTests(): void {
  removeLocalValue(ANALYTICS_FIRST_TOUCH_STORAGE_KEY);
}

export type { StoredFirstTouch };
