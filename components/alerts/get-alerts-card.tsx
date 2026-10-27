"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { BellIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { captureAlertsEvent } from "@/lib/alerts/analytics";
import {
  ALERTS_PENDING_MESSAGE,
  submitAlertsSignup,
  type AlertsSignupResult,
} from "@/lib/alerts/signup";
import type { DealCategorySlug } from "@/lib/matching/categories";

const EMAIL_ERROR = "Enter a valid email address.";
const CONSENT_ERROR = "Tick the box to agree to alert emails.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

type CardState = "idle" | "pending" | "invalid" | "rate_limited" | "error";

function rateLimitedMessage(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds === null) {
    return "Too many attempts. Try again later.";
  }
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

export function GetAlertsCard({
  dealSlug,
  categorySlug,
  idSuffix = "default",
}: {
  dealSlug: string;
  categorySlug: DealCategorySlug;
  idSuffix?: string;
}) {
  const headingId = `alerts-heading-${idSuffix}`;
  const emailId = `alerts-email-${idSuffix}`;
  const emailErrorId = `${emailId}-error`;
  const consentId = `alerts-consent-${idSuffix}`;
  const consentErrorId = `${consentId}-error`;

  const [state, setState] = useState<CardState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [consent, setConsent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [rateMessage, setRateMessage] = useState<string | null>(null);

  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // The page mounts a mobile and a desktop card; only the visible one counts.
    const node = cardRef.current;
    if (node && node.getClientRects().length === 0) {
      return;
    }
    captureAlertsEvent("alerts_signup_viewed", {
      category_slug: categorySlug,
    });
  }, [categorySlug]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const emailInvalid = email.trim() === "" || !email.includes("@");
    const consentInvalid = !consent;

    if (emailInvalid || consentInvalid) {
      setEmailError(emailInvalid ? EMAIL_ERROR : null);
      setConsentError(consentInvalid ? CONSENT_ERROR : null);
      setState("invalid");
      captureAlertsEvent("alerts_signup_result", {
        category_slug: categorySlug,
        outcome: "invalid",
      });
      return;
    }

    setEmailError(null);
    setConsentError(null);
    setRateMessage(null);
    setSubmitting(true);
    captureAlertsEvent("alerts_signup_submitted", {
      category_slug: categorySlug,
    });

    const result: AlertsSignupResult = await submitAlertsSignup({
      email: email.trim(),
      consent,
      website,
      dealSlug,
    });

    if (result.outcome === "pending") {
      setState("pending");
      captureAlertsEvent("alerts_signup_result", {
        category_slug: categorySlug,
        outcome: "pending",
      });
    } else if (result.outcome === "invalid") {
      setEmailError(result.error === "INVALID_EMAIL" ? EMAIL_ERROR : null);
      setConsentError(
        result.error === "CONSENT_REQUIRED" ? CONSENT_ERROR : null,
      );
      setState("invalid");
      captureAlertsEvent("alerts_signup_result", {
        category_slug: categorySlug,
        outcome: "invalid",
      });
    } else if (result.outcome === "rate_limited") {
      setRateMessage(rateLimitedMessage(result.retryAfterSeconds));
      setState("rate_limited");
      captureAlertsEvent("alerts_signup_result", {
        category_slug: categorySlug,
        outcome: "rate_limited",
      });
    } else {
      setState("error");
    }

    setSubmitting(false);
  }

  return (
    <aside
      ref={cardRef}
      aria-labelledby={headingId}
      data-state={state}
      className="rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <BellIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        <h2 id={headingId} className="text-base font-semibold">
          Get free alerts
        </h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Free email alerts when new opportunities like this are published.
      </p>

      {state === "pending" ? (
        <p role="status" className="mt-4 text-sm text-foreground">
          {ALERTS_PENDING_MESSAGE}
        </p>
      ) : (
        <form
          noValidate
          onSubmit={handleSubmit}
          className="mt-4 flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={emailId}>Email</Label>
            <Input
              id={emailId}
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? emailErrorId : undefined}
            />
            {emailError ? (
              <p id={emailErrorId} role="alert" className="text-sm text-destructive">
                {emailError}
              </p>
            ) : null}
          </div>

          <div className="sr-only" aria-hidden="true">
            <label>
              Website
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-start gap-2">
              <input
                id={consentId}
                type="checkbox"
                name="consent"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                aria-invalid={consentError ? true : undefined}
                aria-describedby={consentError ? consentErrorId : undefined}
                className="mt-0.5 size-4"
              />
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor={consentId}
                  className="font-normal leading-6"
                >
                  Email me DealAtlas alerts. I can unsubscribe at any time.
                </Label>
                <Link
                  href="/privacy"
                  className="w-fit text-sm text-muted-foreground underline underline-offset-2"
                >
                  Privacy
                </Link>
              </div>
            </div>
            {consentError ? (
              <p
                id={consentErrorId}
                role="alert"
                className="text-sm text-destructive"
              >
                {consentError}
              </p>
            ) : null}
          </div>

          {state === "rate_limited" && rateMessage ? (
            <p role="alert" className="text-sm text-destructive">
              {rateMessage}
            </p>
          ) : null}

          {state === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              {GENERIC_ERROR}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="outline"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? "Sending…" : "Get alerts"}
          </Button>
        </form>
      )}
    </aside>
  );
}
