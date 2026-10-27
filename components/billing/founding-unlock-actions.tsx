import Link from "next/link";

import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { FoundingButtonLabel, ProAnnualButtonLabel } from "@/components/billing/founding-price";
import { FoundingCheckoutButton } from "@/components/billing/founding-checkout-button";
import { Button } from "@/components/ui/button";
import { signupPathForPlan } from "@/lib/auth/redirect";
import {
  FOUNDING_COPY,
  foundingSignupPath,
  foundingPaywallPlaces,
  type FoundingAvailability,
  type FoundingUiState,
} from "@/lib/billing/founding-ui";

const FOUNDING_BUTTON =
  "w-full bg-[#00806A] text-white hover:bg-[#006b56]";

export function FoundingUnlockActions({
  state,
  available,
  founding,
  mode,
  returnTo,
}: {
  state?: Exclude<FoundingUiState, "hidden">;
  available?: boolean;
  founding?: FoundingAvailability;
  mode: "anonymous" | "free";
  loginHref?: string;
  returnTo?: string;
}) {
  const isAvailable = founding
    ? founding.available
    : available !== undefined
      ? available
      : state !== "sold_out";

  if (!isAvailable) {
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
              label={<ProAnnualButtonLabel text={FOUNDING_COPY.soldOutAnnual} />}
              showPrice={false}
              variant="link"
              returnTo={returnTo}
              className="justify-center"
            />
          </>
        ) : (
          <>
            <Button asChild className="h-11 w-full">
              <Link href={signupPathForPlan("PRO_MONTHLY")}>{FOUNDING_COPY.soldOutMonthly}</Link>
            </Button>
            <Button asChild variant="link">
              <Link href={signupPathForPlan("PRO_ANNUAL")}>
                <ProAnnualButtonLabel text={FOUNDING_COPY.soldOutAnnual} />
              </Link>
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {mode === "free" ? (
        <FoundingCheckoutButton
          label={<FoundingButtonLabel text={FOUNDING_COPY.cta} />}
          returnTo={returnTo}
          buttonClassName={FOUNDING_BUTTON}
        />
      ) : (
        <Button asChild className={`h-auto min-h-11 whitespace-normal py-2 ${FOUNDING_BUTTON}`}>
          <Link href={foundingSignupPath()}><FoundingButtonLabel text={FOUNDING_COPY.cta} /></Link>
        </Button>
      )}
      <p className="text-center text-[0.8125rem] leading-5 text-pretty text-muted-foreground">
        <span>{foundingPaywallPlaces()}</span>
        {" · "}
        <span>{FOUNDING_COPY.priceLocked}</span>
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
          <Link href={signupPathForPlan("PRO_MONTHLY")}>{FOUNDING_COPY.paywallMonthly}</Link>
        </Button>
      )}
    </div>
  );
}
