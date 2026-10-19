import { CheckIcon, LockIcon } from "lucide-react";
import Link from "next/link";

import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { FoundingCheckoutButton } from "@/components/billing/founding-checkout-button";
import { FoundingPriceLead } from "@/components/billing/founding-price";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { signupPathForPlan } from "@/lib/auth/redirect";
import {
  FOUNDING_COPY,
  foundingSignupPath,
  foundingPlacesLabel,
  proMonthlyShort,
} from "@/lib/billing/founding-ui";

export function HomeFoundingCta({
  signedIn,
  remaining,
  cap,
}: {
  signedIn: boolean;
  remaining: number;
  cap: number;
}) {
  return (
    <section aria-labelledby="home-founding-heading" className="border-b border-border">
      <Container className="py-12 md:py-16">
        <div className="relative rounded-2xl border-2 border-dealatlas-teal bg-[color-mix(in_srgb,var(--teal)_8%,var(--background))] shadow-sm">
          <p className="absolute -top-3 left-6 rounded-full bg-[#00806A] px-3 py-0.5 text-xs font-semibold text-white sm:left-8">
            {FOUNDING_COPY.badge}
          </p>
          <div className="grid grid-cols-1 gap-8 p-6 pt-8 sm:p-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <h2
                id="home-founding-heading"
                className="font-heading text-xl font-bold tracking-tight text-foreground sm:text-2xl"
              >
                Become a founding member
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground/80 sm:text-[15px]">
                Full Pro access at a locked founding rate. Same features as Pro — buyer,
                documents, contacts and alerts — while places last.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/80">
                <li className="flex gap-2">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-dealatlas-teal" aria-hidden="true" />
                  <span>Locked for life while you stay subscribed</span>
                </li>
                <li className="flex gap-2">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-dealatlas-teal" aria-hidden="true" />
                  <span>Full details on every deal</span>
                </li>
                <li className="flex gap-2">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-dealatlas-teal" aria-hidden="true" />
                  <span className="font-semibold text-emerald-700 tabular-nums">
                    {foundingPlacesLabel(remaining, cap)}
                  </span>
                </li>
              </ul>
            </div>
            <div className="flex flex-col justify-center rounded-xl border border-dealatlas-teal/30 bg-background p-5 shadow-sm">
              <FoundingPriceLead />
              <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <LockIcon className="size-4 text-[#00806A]" aria-hidden="true" />
                {FOUNDING_COPY.priceLocked}
              </p>
              {signedIn ? (
                <FoundingCheckoutButton
                  label={FOUNDING_COPY.cta}
                  returnTo="/pricing"
                  className="mt-5"
                  buttonClassName="bg-[#00806A] text-white hover:bg-[#006b56]"
                />
              ) : (
                <Button asChild className="mt-5 h-11 w-full bg-[#00806A] text-white hover:bg-[#006b56]">
                  <Link href={foundingSignupPath()}>{FOUNDING_COPY.cta}</Link>
                </Button>
              )}
              {signedIn ? (
                <CheckoutPlanForm
                  planKey="PRO_MONTHLY"
                  label={`or Pro ${proMonthlyShort()}`}
                  showPrice={false}
                  variant="link"
                  returnTo="/pricing"
                  className="mt-2 justify-center"
                />
              ) : (
                <Button asChild variant="link" className="mt-2 w-full">
                  <Link href={signupPathForPlan("PRO_MONTHLY")}>
                    {`or Pro ${proMonthlyShort()}`}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
