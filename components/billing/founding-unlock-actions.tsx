import Link from "next/link";

import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { Button } from "@/components/ui/button";
import {
  FOUNDING_COPY,
  foundingPaywallPlaces,
  type FoundingUiState,
} from "@/lib/billing/founding";

const FOUNDING_BUTTON =
  "w-full bg-[#00806A] text-white hover:bg-[#006b56]";

export function FoundingUnlockActions({
  state,
  remaining,
  cap,
  mode,
  loginHref,
  returnTo,
}: {
  state: Exclude<FoundingUiState, "hidden">;
  remaining: number;
  cap: number;
  mode: "anonymous" | "free";
  loginHref: string;
  returnTo?: string;
}) {
  if (state === "sold_out") {
    return (
      <div className="flex w-full flex-col items-center gap-2">
        {mode === "free" ? (
          <>
            <CheckoutPlanForm
              planKey="PRO_MONTHLY"
              label={FOUNDING_COPY.soldOutMonthly}
              showPrice={false}
              returnTo={returnTo}
              className="w-full"
              buttonClassName="w-full"
            />
            <CheckoutPlanForm
              planKey="PRO_ANNUAL"
              label={FOUNDING_COPY.soldOutAnnual}
              showPrice={false}
              variant="link"
              returnTo={returnTo}
              className="justify-center"
            />
          </>
        ) : (
          <>
            <Button asChild className="h-11 w-full">
              <Link href={loginHref}>{FOUNDING_COPY.soldOutMonthly}</Link>
            </Button>
            <Button asChild variant="link">
              <Link href={loginHref}>{FOUNDING_COPY.soldOutAnnual}</Link>
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {mode === "free" ? (
        <CheckoutPlanForm
          planKey="PRO_ANNUAL"
          offer="founding"
          label={FOUNDING_COPY.paywallCta}
          showPrice={false}
          returnTo={returnTo}
          className="w-full"
          buttonClassName={FOUNDING_BUTTON}
        />
      ) : (
        <Button asChild className={`h-11 ${FOUNDING_BUTTON}`}>
          <Link href={loginHref}>{FOUNDING_COPY.paywallCta}</Link>
        </Button>
      )}
      <p className="text-center text-[0.8125rem] leading-5 text-pretty text-muted-foreground">
        {foundingPaywallPlaces(remaining, cap)}
        {" · "}
        {FOUNDING_COPY.priceLocked}
      </p>
      {mode === "free" ? (
        <CheckoutPlanForm
          planKey="PRO_MONTHLY"
          label={FOUNDING_COPY.paywallMonthly}
          showPrice={false}
          variant="link"
          returnTo={returnTo}
          className="justify-center"
        />
      ) : (
        <Button asChild variant="link">
          <Link href={loginHref}>{FOUNDING_COPY.paywallMonthly}</Link>
        </Button>
      )}
    </div>
  );
}
