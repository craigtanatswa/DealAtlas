"use client";

import { useState, type FormEvent } from "react";

import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { Button } from "@/components/ui/button";
import {
  FOUNDING_COPY,
  FOUNDING_FULL_MESSAGE,
  FOUNDING_PLAN_KEY,
} from "@/lib/billing/founding-ui";
import { cn } from "@/lib/utils";

type Status =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "full"; message: string }
  | { kind: "error" };

/** Server error code for a full founding cap (HTTP 409). Contract owned by S&B. */
export const FOUNDING_CAP_FULL_CODE = "FOUNDING_CAP_FULL";

const GENERIC_ERROR = "Checkout could not be started. Try again.";

/**
 * Founding checkout (planKey FOUNDING). Posts like CheckoutPlanForm, but reads the
 * JSON response so a full-founding error is shown inline with a Pro annual fallback.
 * Without JavaScript the plain form post still works.
 */
export function FoundingCheckoutButton({
  label,
  returnTo,
  className,
  buttonClassName,
}: {
  label: string;
  returnTo?: string;
  className?: string;
  buttonClassName?: string;
}) {
  // The full state here only covers the race where founding fills after page load.
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "pending" });
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { Accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ planKey: FOUNDING_PLAN_KEY, returnTo }),
      });
      const body = (await response.json().catch(() => null)) as
        | { checkout_url?: string; code?: string; message?: string }
        | null;
      if (response.ok && body?.checkout_url) {
        window.location.assign(body.checkout_url);
        return;
      }
      // Match on the error code, never the text. INVALID_PLAN and anything else is generic.
      if (response.status === 409 && body?.code === FOUNDING_CAP_FULL_CODE) {
        const message =
          typeof body.message === "string" && body.message.trim()
            ? body.message
            : FOUNDING_FULL_MESSAGE;
        setStatus({ kind: "full", message });
        return;
      }
      setStatus({ kind: "error" });
    } catch {
      setStatus({ kind: "error" });
    }
  }

  if (status.kind === "full") {
    return (
      <div
        role="alert"
        className={cn(
          "w-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900",
          className,
        )}
      >
        <p className="text-pretty">{status.message}</p>
        <CheckoutPlanForm
          planKey="PRO_ANNUAL"
          label={FOUNDING_COPY.startAnnual}
          showPrice={false}
          returnTo={returnTo}
          className="mt-3 w-full"
          buttonClassName="w-full"
        />
      </div>
    );
  }

  return (
    <form
      action="/api/billing/checkout"
      method="post"
      onSubmit={onSubmit}
      className={cn("flex w-full flex-col", className)}
    >
      <input type="hidden" name="planKey" value={FOUNDING_PLAN_KEY} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <Button
        type="submit"
        disabled={status.kind === "pending"}
        className={cn("h-11 min-h-11 w-full whitespace-normal", buttonClassName)}
      >
        {status.kind === "pending" ? "Starting checkout…" : label}
      </Button>
      {status.kind === "error" ? (
        <p role="alert" className="mt-2 text-center text-[0.8125rem] leading-5 text-destructive">
          {GENERIC_ERROR}
        </p>
      ) : null}
    </form>
  );
}
