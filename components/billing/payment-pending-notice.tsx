"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";

/** Re-render from the server every 5s while the payment confirms. */
export const PAYMENT_PENDING_POLL_MS = 5_000;
/** Stop polling after 2 minutes and tell the user what to do. */
export const PAYMENT_PENDING_TIMEOUT_MS = 120_000;

/**
 * Pending state for the deal-page Pro card. It only calls router.refresh(): the
 * server re-reads the entitlement, and once it is Pro the page stops rendering
 * this component (unmount clears the timers). No new endpoint, no client-side
 * entitlement. Polling pauses while the tab is hidden.
 */
export function PaymentPendingNotice() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  // Keep the latest router in a ref so the timers start once per mount and the
  // timed-out re-render can never restart them.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      routerRef.current.refresh();
    }, PAYMENT_PENDING_POLL_MS);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      setTimedOut(true);
    }, PAYMENT_PENDING_TIMEOUT_MS);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <div
      role="status"
      className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-4"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {timedOut ? null : (
          <Loader2Icon
            className="size-4 animate-spin text-primary motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
        Confirming your payment…
      </p>
      {timedOut ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Still confirming? Refresh the page, or{" "}
          <Link href="/contact" className="font-medium text-foreground underline underline-offset-2">
            contact support
          </Link>{" "}
          if it doesn’t update.
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Details unlock here automatically once payment is confirmed. You
          don’t need to pay again.
        </p>
      )}
    </div>
  );
}
