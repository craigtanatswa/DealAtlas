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

type AnalyticsPostHogGlobal = {
  opt_out_capturing?: () => void;
  opt_in_capturing?: () => void;
};

type AnalyticsWindow = Window & {
  posthog?: AnalyticsPostHogGlobal;
  gtag?: (...args: unknown[]) => void;
};

const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const analyticsOptOutHandlers = new Set<() => void>();

function analyticsWindow(): AnalyticsWindow | undefined {
  return typeof window === "undefined" ? undefined : (window as AnalyticsWindow);
}

export function registerAnalyticsOptOutHandler(handler: () => void): () => void {
  analyticsOptOutHandlers.add(handler);
  return () => {
    analyticsOptOutHandlers.delete(handler);
  };
}

/** Removes first-party Google Analytics cookies: `_ga` and `_ga_*`. */
export function clearGoogleAnalyticsCookies(): void {
  if (typeof document === "undefined") {
    return;
  }
  try {
    const names = document.cookie
      .split(";")
      .map((part) => part.split("=")[0]?.trim() ?? "")
      .filter((name) => /^_ga(?:$|_)/.test(name));
    for (const name of names) {
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
  } catch {
    // Blocked cookie APIs are already unable to keep tracking cookies.
  }
}

/**
 * Withdraws every browser-side tracker when analytics is rejected: PostHog is
 * opted out, GA consent is denied and any existing `_ga` cookies are cleared.
 */
export function optOutAnalyticsTracking(): void {
  const target = analyticsWindow();
  try {
    target?.posthog?.opt_out_capturing?.();
  } catch {
    // A partially initialised SDK must not block the rest of the opt-out.
  }
  try {
    target?.gtag?.("consent", "update", { analytics_storage: "denied" });
  } catch {
    // GA may not be loaded; there is nothing to update.
  }
  for (const handler of [...analyticsOptOutHandlers]) {
    try {
      handler();
    } catch {
      // One failing tracker must not stop the others from opting out.
    }
  }
  clearGoogleAnalyticsCookies();
}

function optInAnalyticsTracking(): void {
  const target = analyticsWindow();
  try {
    target?.posthog?.opt_in_capturing?.();
  } catch {
    // PostHog may not be loaded.
  }
  try {
    target?.gtag?.("consent", "update", { analytics_storage: "granted" });
  } catch {
    // GA may not be loaded.
  }
}

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
  if (granted) {
    optInAnalyticsTracking();
  } else {
    removeLocalValue(ANALYTICS_FIRST_TOUCH_STORAGE_KEY);
    optOutAnalyticsTracking();
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
