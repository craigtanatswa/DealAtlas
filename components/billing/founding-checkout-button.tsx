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
  | { kind: "full" }
  | { kind: "error"; message: string };

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
  initialFull = false,
}: {
  label: string;
  returnTo?: string;
  className?: string;
  buttonClassName?: string;
  /** Server already knows founding is full (e.g. /checkout after sell-out). */
  initialFull?: boolean;
}) {
  const [status, setStatus] = useState<Status>(
    initialFull ? { kind: "full" } : { kind: "idle" },
  );

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
        | { checkout_url?: string; error?: string }
        | null;
      if (response.ok && body?.checkout_url) {
        window.location.assign(body.checkout_url);
        return;
      }
      if (body?.error === FOUNDING_FULL_MESSAGE) {
        setStatus({ kind: "full" });
        return;
      }
      setStatus({
        kind: "error",
        message: body?.error ?? "Checkout could not be started. Try again.",
      });
    } catch {
      setStatus({ kind: "error", message: "Checkout could not be started. Try again." });
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
        <p className="text-pretty">{FOUNDING_FULL_MESSAGE}</p>
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
          {status.message}
        </p>
      ) : null}
    </form>
  );
}
