import Link from "next/link";

import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { Button } from "@/components/ui/button";
import { FOUNDING_COPY } from "@/lib/billing/founding";

export function FoundingFullNotice({
  signedIn,
  loginHref,
  returnTo,
  returnTitle,
}: {
  signedIn: boolean;
  loginHref: string;
  returnTo?: string;
  returnTitle?: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-lg border border-warning/40 bg-warning/10 px-5 py-5"
        role="status"
      >
        <p className="font-medium text-pretty text-foreground">{FOUNDING_COPY.raceLead}</p>
        <p className="mt-2 text-sm text-pretty text-muted-foreground">{FOUNDING_COPY.raceBody}</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          {signedIn ? (
            <>
              <CheckoutPlanForm
                planKey="PRO_ANNUAL"
                label={FOUNDING_COPY.raceAnnual}
                showPrice={false}
                returnTo={returnTo}
                className="sm:flex-1"
                buttonClassName="w-full"
              />
              <CheckoutPlanForm
                planKey="PRO_MONTHLY"
                label={FOUNDING_COPY.raceMonthly}
                showPrice={false}
                variant="outline"
                returnTo={returnTo}
                className="sm:flex-1"
                buttonClassName="w-full"
              />
            </>
          ) : (
            <>
              <Button asChild className="h-11 sm:flex-1">
                <Link href={loginHref}>{FOUNDING_COPY.raceAnnual}</Link>
              </Button>
              <Button asChild variant="outline" className="h-11 sm:flex-1">
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
