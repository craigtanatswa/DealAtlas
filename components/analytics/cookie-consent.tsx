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
          Essential cookies keep the site working and stay on. Optional cookies
          help with performance and advertising — accept, reject, or manage
          them.{" "}
          <Link href="/cookies" className="underline underline-offset-4">
            Read the cookie notice
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={() => setAnalyticsConsent(false)}
          >
            Reject
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={() => {
              setAnalyticsConsent(true);
              startFirstTouchAfterConsent();
            }}
          >
            Accept
          </button>
        </div>
      </div>
    </aside>
  );
}
