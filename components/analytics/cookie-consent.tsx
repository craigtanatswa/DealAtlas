"use client";

import Link from "next/link";

import { useAnalyticsConsentChoice } from "@/hooks/use-analytics-consent";
import { startFirstTouchAfterConsent } from "@/lib/analytics/attribution";
import { setAnalyticsConsent } from "@/lib/analytics/consent";

export function CookieConsent() {
  const choice = useAnalyticsConsentChoice();

  if (choice !== "unknown") {
    return null;
  }

  return (
    <aside
      aria-label="Analytics cookies"
      className="border-t border-border bg-muted/40 px-4 py-4 text-sm text-muted-foreground"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl">
          We use optional analytics to count page views, guide CTA views and
          sign-ups. Nothing loads or is stored until you accept. We never send
          deal details, buyer names, URLs or full referrers.{" "}
          <Link href="/cookies" className="underline underline-offset-4">
            Read the cookie notice
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded-md border border-border bg-background px-3 py-2 font-medium text-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={() => setAnalyticsConsent(false)}
          >
            Reject analytics
          </button>
          <button
            type="button"
            className="rounded-md bg-foreground px-3 py-2 font-medium text-background hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={() => {
              setAnalyticsConsent(true);
              startFirstTouchAfterConsent();
            }}
          >
            Accept analytics
          </button>
        </div>
      </div>
    </aside>
  );
}
