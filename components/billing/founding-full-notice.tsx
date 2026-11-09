import Link from "next/link";

import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { ProAnnualButtonLabel } from "@/components/billing/founding-price";
import { Button } from "@/components/ui/button";
import {
  FOUNDING_COPY,
  foundingNotEligibleLead,
  foundingRaceBody,
} from "@/lib/billing/founding-ui";

export function FoundingFullNotice({
  signedIn,
  loginHref,
  returnTo,
  returnTitle,
  notEligible = false,
  annualEnabled,
}: {
  signedIn: boolean;
  loginHref: string;
  returnTo?: string;
  returnTitle?: string | null;
  notEligible?: boolean;
  /** From isProAnnualEnabled() on the server. False offers monthly only. */
  annualEnabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-lg border border-warning/40 bg-warning/10 px-5 py-5"
        role="status"
      >
        <p className="font-medium text-pretty text-foreground">{notEligible ? foundingNotEligibleLead(annualEnabled) : FOUNDING_COPY.raceLead}</p>
        <p className="mt-2 text-sm text-pretty text-muted-foreground">{foundingRaceBody(annualEnabled)}</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          {signedIn ? (
            <>
              {annualEnabled ? (
                <CheckoutPlanForm
                  planKey="PRO_ANNUAL"
                  label={<ProAnnualButtonLabel text={FOUNDING_COPY.raceAnnual} />}
                  showPrice={false}
                  returnTo={returnTo}
                  className="sm:flex-1"
                  buttonClassName="w-full"
                />
              ) : null}
              <CheckoutPlanForm
                planKey="PRO_MONTHLY"
                label={FOUNDING_COPY.raceMonthly}
                showPrice={false}
                variant={annualEnabled ? "outline" : "default"}
                returnTo={returnTo}
                className="sm:flex-1"
                buttonClassName="w-full"
              />
            </>
          ) : (
            <>
              {annualEnabled ? (
                <Button asChild className="h-11 sm:flex-1">
                  <Link href={loginHref}>
                    <ProAnnualButtonLabel text={FOUNDING_COPY.raceAnnual} />
                  </Link>
                </Button>
              ) : null}
              <Button
                asChild
                variant={annualEnabled ? "outline" : "default"}
                className="h-11 sm:flex-1"
              >
                <Link href={loginHref}>{FOUNDING_COPY.raceMonthly}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
      {returnTo ? (
        <p className="text-sm text-muted-foreground">
          You&apos;ll still return to:{" "}
          <Link href={returnTo} className="text-foreground underline underline-offset-4">
            {returnTitle || "the page you were viewing"}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
