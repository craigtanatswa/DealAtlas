"use client";

import { useAnalyticsConsentChoice } from "@/hooks/use-analytics-consent";
import { startFirstTouchAfterConsent } from "@/lib/analytics/attribution";
import { setAnalyticsConsent } from "@/lib/analytics/consent";

export function AnalyticsConsentSettings() {
  const choice = useAnalyticsConsentChoice();

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <p>
        Current choice:{" "}
        <strong className="text-foreground">
          {choice === "granted"
            ? "analytics accepted"
            : choice === "denied"
              ? "analytics rejected"
              : "no choice yet"}
        </strong>
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          onClick={() => setAnalyticsConsent(false)}
        >
          Reject analytics
        </button>
        <button
          type="button"
          className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          onClick={() => {
            setAnalyticsConsent(true);
            startFirstTouchAfterConsent();
          }}
        >
          Accept analytics
        </button>
      </div>
    </div>
  );
}
