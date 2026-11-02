"use client";

import { useEffect, useRef } from "react";

import { useAnalyticsConsent } from "@/hooks/use-analytics-consent";
import { ATTRIBUTION_FIELDS, attributionFormValues } from "@/lib/analytics/attribution";

const FIELD_NAMES = Object.values(ATTRIBUTION_FIELDS);

/**
 * Hidden sign-up fields carrying first-touch attribution (cleaned landing
 * path, referrer domain, three UTM tags, guide slug). The server re-validates
 * every value. Renders nothing when analytics is disabled.
 */
export function AnalyticsAttributionFields({ enabled }: { enabled: boolean }) {
  const container = useRef<HTMLSpanElement>(null);
  const consented = useAnalyticsConsent();

  useEffect(() => {
    if (!enabled || !container.current) {
      return;
    }
    const values = consented ? attributionFormValues() : {};
    for (const input of container.current.querySelectorAll<HTMLInputElement>("input")) {
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
    </span>
  );
}
