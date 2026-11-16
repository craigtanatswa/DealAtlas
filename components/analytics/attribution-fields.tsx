"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  getAnalyticsDistinctId,
  subscribeToAnalyticsClient,
} from "@/components/analytics/posthog-analytics";
import { useAnalyticsConsent } from "@/hooks/use-analytics-consent";
import {
  ANALYTICS_ANON_ID_FIELD,
  ATTRIBUTION_FIELDS,
  attributionFormValues,
} from "@/lib/analytics/attribution";

const FIELD_NAMES = Object.values(ATTRIBUTION_FIELDS);

/**
 * Hidden sign-up fields carrying first-touch attribution (cleaned landing
 * path, referrer domain, three UTM tags, guide slug) and, with consent, the
 * already-loaded PostHog anonymous id. The server re-validates every value.
 * Renders nothing when analytics is disabled; the anonymous id is only
 * rendered once consent is granted and the SDK has loaded.
 */
export function AnalyticsAttributionFields({ enabled }: { enabled: boolean }) {
  const container = useRef<HTMLSpanElement>(null);
  const consented = useAnalyticsConsent();
  const loadedAnonId = useSyncExternalStore(
    subscribeToAnalyticsClient,
    getAnalyticsDistinctId,
    () => null,
  );
  const anonId = enabled && consented ? loadedAnonId : null;

  useEffect(() => {
    if (!enabled || !container.current) {
      return;
    }
    const values = consented ? attributionFormValues() : {};
    for (const input of container.current.querySelectorAll<HTMLInputElement>("input")) {
      if (input.name === ANALYTICS_ANON_ID_FIELD) {
        continue;
      }
      input.value = values[input.name] ?? "";
    }
  }, [consented, enabled]);

  if (!enabled) {
    return null;
  }
  return (
    <span ref={container} hidden>
      {FIELD_NAMES.map((name) => (
        <input key={name} type="hidden" name={name} defaultValue="" />
      ))}
      {anonId ? (
        <input
          key={ANALYTICS_ANON_ID_FIELD}
          type="hidden"
          name={ANALYTICS_ANON_ID_FIELD}
          defaultValue={anonId}
        />
      ) : null}
    </span>
  );
}
