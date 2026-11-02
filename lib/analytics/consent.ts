import {
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_EVENT,
  ANALYTICS_CONSENT_STORAGE_KEY,
  ANALYTICS_FIRST_TOUCH_STORAGE_KEY,
} from "@/lib/analytics/storage-keys";
import {
  readCookie,
  readLocalValue,
  removeCookie,
  removeLocalValue,
  writeCookie,
  writeLocalValue,
} from "@/lib/analytics/storage";

export type AnalyticsConsent = "granted" | "denied" | "unknown";

const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export function isAnalyticsConsentValue(value: unknown): value is AnalyticsConsent {
  return value === "granted" || value === "denied" || value === "unknown";
}

export function analyticsConsent(): AnalyticsConsent {
  const stored = readLocalValue(ANALYTICS_CONSENT_STORAGE_KEY);
  const cookie = readCookie(ANALYTICS_CONSENT_COOKIE);
  const value = isAnalyticsConsentValue(stored) ? stored : cookie;
  return isAnalyticsConsentValue(value) ? value : "unknown";
}

export function hasAnalyticsConsent(): boolean {
  return analyticsConsent() === "granted";
}

export function isAnalyticsConsentGranted(value: unknown): boolean {
  return value === "granted";
}

function notifyConsent(): void {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));
    }
  } catch {
    // A missing window or blocked event API does not affect storage.
  }
}

export function setAnalyticsConsent(granted: boolean): void {
  const value: AnalyticsConsent = granted ? "granted" : "denied";
  writeLocalValue(ANALYTICS_CONSENT_STORAGE_KEY, value);
  writeCookie(ANALYTICS_CONSENT_COOKIE, value, CONSENT_MAX_AGE_SECONDS);
  if (!granted) {
    removeLocalValue(ANALYTICS_FIRST_TOUCH_STORAGE_KEY);
  }
  notifyConsent();
}

export function subscribeToAnalyticsConsent(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  window.addEventListener(ANALYTICS_CONSENT_EVENT, listener);
  return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, listener);
}

export function resetAnalyticsConsentForTests(): void {
  removeLocalValue(ANALYTICS_CONSENT_STORAGE_KEY);
  removeCookie(ANALYTICS_CONSENT_COOKIE);
  removeLocalValue(ANALYTICS_FIRST_TOUCH_STORAGE_KEY);
}
