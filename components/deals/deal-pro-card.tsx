import Link from "next/link";
import { LockIcon } from "lucide-react";

import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { FoundingButtonLabel, ProAnnualButtonLabel } from "@/components/billing/founding-price";
import { FoundingCheckoutButton } from "@/components/billing/founding-checkout-button";
import { Button } from "@/components/ui/button";
import { signupPathForPlan } from "@/lib/auth/redirect";
import {
  FOUNDING_COPY,
  foundingSignupPath,
  foundingPaywallPlaces,
  foundingUiState,
  type FoundingPublicCount,
} from "@/lib/billing/founding-ui";
import { DISPLAY_PRICING } from "@/lib/constants";

export const PRO_CARD_LOCKED_ROWS = [
  { label: "Buyer", hint: "Organisation running the tender" },
  {
    label: "Original notice & source link",
    hint: "Full notice text and where it was published",
  },
  { label: "Reference number", hint: "The buyer’s own tender reference" },
  {
    label: "Documents",
    hint: "Specification, ITT pack and pricing schedule",
  },
  { label: "Contacts", hint: "Named procurement contact" },
  {
    label: "How to apply",
    hint: "Portal, registration steps and submission route",
  },
] as const;

export function DealProCard({
  mode = "anonymous",
  loginHref,
  revealHref,
  returnTo,
  founding,
  alertsHref,
  idSuffix = "default",
}: {
  mode?: "anonymous" | "free" | "pro";
  loginHref?: string;
  revealHref?: string;
  returnTo?: string;
  founding?: FoundingPublicCount;
  alertsHref: string;
  idSuffix?: string;
}) {
  const headingId = `pro-card-heading-${idSuffix}`;

  if (mode === "pro") {
    return (
      <aside
        aria-labelledby={headingId}
        className="rounded-xl border border-border bg-card shadow-sm"
      >
        <div className="p-5">
          <div className="flex items-center gap-2 text-primary">
            <LockIcon className="size-4" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Pro
            </span>
          </div>
          <h2
            id={headingId}
            className="mt-2 font-heading text-lg font-bold text-foreground"
          >
            You have Pro
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Open the Pro workspace view for buyer identity, source links,
            documents and how to apply.
          </p>
        </div>
        <div className="border-t border-border p-5">
          <Button asChild className="h-11 w-full">
            <Link href={revealHref ?? "/app"}>Open exact source details</Link>
          </Button>
        </div>
      </aside>
    );
  }

  const state = foundingUiState(founding);
  const foundingActive = state === "available";
  const monthlyShort = DISPLAY_PRICING.proMonthly.replace("/month", "/mo");

  return (
    <aside
      aria-labelledby={headingId}
      className="rounded-xl border border-border bg-card shadow-sm"
    >
      <div className="border-b border-border p-5">
        <div className="flex items-center gap-2 text-primary">
          <LockIcon className="size-4" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Pro
          </span>
        </div>
        <h2
          id={headingId}
          className="mt-2 font-heading text-lg font-bold text-foreground"
        >
          Unlock this opportunity with Pro
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          What you’ll get for this deal:
        </p>
      </div>

      <ul className="divide-y divide-border/60 px-5">
        {PRO_CARD_LOCKED_ROWS.map((row) => (
          <li key={row.label} className="flex items-center gap-3 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <LockIcon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.hint}</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground/80">
              <LockIcon className="size-3" aria-hidden="true" />
              Pro
            </span>
          </li>
        ))}
      </ul>

      <div className="border-t border-border p-5">
        {foundingActive && founding ? (
          <>
            {mode === "free" ? (
              <FoundingCheckoutButton
                label={<FoundingButtonLabel text={FOUNDING_COPY.cta} />}
                returnTo={returnTo}
              />
            ) : (
              <Button asChild className="h-auto min-h-11 w-full whitespace-normal py-2">
                <Link href={foundingSignupPath()}>
                  <FoundingButtonLabel text={FOUNDING_COPY.cta} />
                </Link>
              </Button>
            )}
            <p className="mt-2 text-center text-xs font-medium text-foreground/80">
              <span className="text-emerald-700">
                {foundingPaywallPlaces()}
              </span>
              {" · "}
              <span>{FOUNDING_COPY.priceLocked}</span>
            </p>
            {mode === "free" ? (
              <CheckoutPlanForm
                planKey="PRO_MONTHLY"
                label={`or Pro ${monthlyShort}`}
                variant="link"
                showPrice={false}
                returnTo={returnTo}
                className="mt-1 justify-center"
              />
            ) : (
              <Button asChild variant="link" className="mt-1 w-full">
                <Link href={signupPathForPlan("PRO_MONTHLY")}>
                  {`or Pro ${monthlyShort}`}
                </Link>
              </Button>
            )}
          </>
        ) : (
          <>
            {mode === "free" ? (
              <CheckoutPlanForm
                planKey="PRO_MONTHLY"
                label={`Start Pro – ${monthlyShort}`}
                showPrice={false}
                returnTo={returnTo}
                className="w-full"
                buttonClassName="h-11 w-full"
              />
            ) : (
              <Button asChild className="h-11 w-full">
                <Link href={signupPathForPlan("PRO_MONTHLY")}>
                  {`Start Pro – ${monthlyShort}`}
                </Link>
              </Button>
            )}
            <p className="mt-2 text-center text-xs font-medium text-foreground/80">
              Cancel any time · VAT incl.
            </p>
            {mode === "free" ? (
              <CheckoutPlanForm
                planKey="PRO_ANNUAL"
                label={<ProAnnualButtonLabel text={FOUNDING_COPY.soldOutAnnual} />}
                variant="link"
                showPrice={false}
                returnTo={returnTo}
                className="mt-1 justify-center"
              />
            ) : (
              <Button asChild variant="link" className="mt-1 w-full">
                <Link href={signupPathForPlan("PRO_ANNUAL")}>
                  <ProAnnualButtonLabel text={FOUNDING_COPY.soldOutAnnual} />
                </Link>
              </Button>
            )}
          </>
        )}

        <div className="my-4 border-t border-border" />

        <Button asChild variant="outline" className="h-11 w-full">
          <Link href={alertsHref}>
            {mode === "anonymous"
              ? "Get alerts for deals like this – free account"
              : "Get alerts for deals like this"}
          </Link>
        </Button>

        {mode === "anonymous" && loginHref ? (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Already Pro?{" "}
            <Link
              href={loginHref}
              className="font-medium text-foreground underline underline-offset-2"
            >
              Sign in
            </Link>{" "}
            and you’ll come straight back here.
          </p>
        ) : null}
      </div>
    </aside>
  );
}
