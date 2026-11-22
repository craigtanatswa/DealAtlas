import { ANALYTICS_ANON_ID_FIELD, ATTRIBUTION_FIELDS } from "@/lib/analytics/attribution";
import { isAnalyticsUuid } from "@/lib/analytics/sanitize";
import { sanitizeUtmValue } from "@/lib/analytics/utm-value";

const OAUTH_UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;
const OAUTH_ANON_ID_KEY = "anon_id";
const OAUTH_CONSENT_KEY = "consent";
export const MAX_OAUTH_UTM_LENGTH = 400;

type OAuthUtmKey = (typeof OAUTH_UTM_KEYS)[number];

const OAUTH_UTM_DROP_ORDER: readonly OAuthUtmKey[] = [
  "utm_campaign",
  "utm_medium",
  "utm_source",
];

const UTM_FIELD_BY_KEY: Record<OAuthUtmKey, string> = {
  utm_source: ATTRIBUTION_FIELDS.utm_source,
  utm_medium: ATTRIBUTION_FIELDS.utm_medium,
  utm_campaign: ATTRIBUTION_FIELDS.utm_campaign,
};

export function encodeOAuthUtm(read: (name: string) => unknown): string | null {
  const params = new URLSearchParams();
  for (const key of OAUTH_UTM_KEYS) {
    const value = sanitizeUtmValue(read(ATTRIBUTION_FIELDS[key]));
    if (value) {
      params.set(key, value);
    }
  }
  const anonId = read(ANALYTICS_ANON_ID_FIELD);
  if (isAnalyticsUuid(anonId)) {
    params.set(OAUTH_ANON_ID_KEY, anonId);
  }
  if (read(ATTRIBUTION_FIELDS.consent) === "granted") {
    params.set(OAUTH_CONSENT_KEY, "granted");
  }
  for (const key of OAUTH_UTM_DROP_ORDER) {
    if (params.toString().length <= MAX_OAUTH_UTM_LENGTH) {
      break;
    }
    params.delete(key);
  }
  const encoded = params.toString();
  return encoded === "" ? null : encoded;
}

export function decodeOAuthUtm(
  value: string | undefined | null,
): (name: string) => string | undefined {
  if (typeof value !== "string" || value.length > MAX_OAUTH_UTM_LENGTH) {
    return () => undefined;
  }
  const params = new URLSearchParams(value);
  const decoded = new Map<string, string>();
  for (const key of OAUTH_UTM_KEYS) {
    const sanitized = sanitizeUtmValue(params.get(key));
    if (sanitized) {
      decoded.set(UTM_FIELD_BY_KEY[key], sanitized);
    }
  }
  const anonId = params.get(OAUTH_ANON_ID_KEY);
  if (isAnalyticsUuid(anonId)) {
    decoded.set(ANALYTICS_ANON_ID_FIELD, anonId);
  }
  if (params.get(OAUTH_CONSENT_KEY) === "granted") {
    decoded.set(ATTRIBUTION_FIELDS.consent, "granted");
  }
  return (name: string) => decoded.get(name);
}
