import type { AlertsOutcome } from "@/lib/alerts/signup-client";
import type { DealCategorySlug } from "@/lib/matching/categories";

export const ALERTS_EVENT_NAMES = [
  "alerts_signup_viewed",
  "alerts_signup_submitted",
  "alerts_signup_result",
] as const;

export type AlertsEventName = (typeof ALERTS_EVENT_NAMES)[number];

export type AlertsEventProperties = {
  category_slug: DealCategorySlug;
  outcome?: AlertsOutcome;
};

export function isAlertsEventName(value: unknown): value is AlertsEventName {
  return (
    typeof value === "string" &&
    (ALERTS_EVENT_NAMES as readonly string[]).includes(value)
  );
}

export function captureAlertsEvent(
  name: AlertsEventName,
  properties: AlertsEventProperties,
): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent("dealatlas:alerts-event", {
      detail: { name, properties },
    }),
  );
}
