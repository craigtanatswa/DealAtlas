import { LockIcon } from "lucide-react";

import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { FoundingCheckoutButton } from "@/components/billing/founding-checkout-button";
import { FoundingPriceLead } from "@/components/billing/founding-price";
import { Heading } from "@/components/layout/heading";
import {
  FOUNDING_COPY,
  FOUNDING_FULL_MESSAGE,
  foundingDueToday,
  foundingPlacesLabel,
  proMonthlyShort,
} from "@/lib/billing/founding-ui";
import { DISPLAY_PRICING } from "@/lib/constants";

/** Founding plan summary on /checkout. Remaining places only; the cap is never rendered. */
export function FoundingCheckoutSummary({
  remaining,
  cap,
}: {
  remaining: number;
  cap: number;
}) {
  return (
    <>
      <div>
        <Heading>Confirm your plan</Heading>
        <p className="mt-1 text-sm text-muted-foreground">
          You’ll pay securely via our payment partner. Pro unlocks after payment is
          confirmed.
        </p>
      </div>
      <section
        aria-labelledby="founding-summary-heading"
        className="relative rounded-xl border-2 border-dealatlas-teal bg-[color-mix(in_srgb,var(--teal)_8%,var(--background))] p-5 shadow-sm"
      >
        <p className="absolute -top-3 left-5 rounded-full bg-[#00806A] px-3 py-0.5 text-xs font-semibold text-white">
          {FOUNDING_COPY.badge}
        </p>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="founding-summary-heading"
              className="text-base font-semibold text-foreground"
            >
              {FOUNDING_COPY.title}
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <LockIcon className="size-4 text-[#00806A]" aria-hidden="true" />
              {FOUNDING_COPY.priceLocked}
            </p>
          </div>
          <p className="whitespace-nowrap text-sm font-semibold text-emerald-700 tabular-nums">
            {foundingPlacesLabel(remaining, cap)}
          </p>
        </div>
        <div className="mt-4 border-t border-dealatlas-teal/20 pt-4">
          <FoundingPriceLead size="md" />
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Due today</dt>
            <dd className="font-semibold text-foreground tabular-nums">
              {foundingDueToday()}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Billing</dt>
            <dd className="text-foreground">Yearly · renews at founding rate</dd>
          </div>
        </dl>
      </section>
      <p className="rounded-lg border border-border bg-muted px-4 py-3 text-xs text-muted-foreground">
        Availability is re-checked when you continue. If founding places fill, you
        won’t be charged and can choose a standard plan.
      </p>
      <div className="flex flex-col gap-2">
        <FoundingCheckoutButton
          label="Continue to payment"
          returnTo="/pricing"
          buttonClassName="bg-[#00806A] text-white hover:bg-[#006b56]"
        />
        <CheckoutPlanForm
          planKey="PRO_MONTHLY"
          label={`Switch to Pro ${proMonthlyShort()} instead`}
          showPrice={false}
          variant="link"
          returnTo="/pricing"
          className="justify-center"
        />
      </div>
    </>
  );
}

/**
 * /checkout?plan=FOUNDING when founding is full or not offered: no founding summary,
 * just the FOUNDING_CAP_FULL copy and the standard Pro annual option.
 */
export function FoundingFullCheckout() {
  return (
    <>
      <Heading>Confirm your plan</Heading>
      <p
        role="alert"
        className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-pretty text-amber-900"
      >
        {FOUNDING_FULL_MESSAGE}
      </p>
      <section className="rounded-xl border-2 border-primary bg-background p-5 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-heading text-base font-semibold">Pro annual</h2>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {DISPLAY_PRICING.proAnnual.replace("/year", "")}
            <span className="text-sm font-normal text-muted-foreground">/year</span>
          </p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{FOUNDING_COPY.annualSaving} VAT included.</p>
        <CheckoutPlanForm
          planKey="PRO_ANNUAL"
          label={FOUNDING_COPY.startAnnual}
          showPrice={false}
          returnTo="/pricing"
          className="mt-5 w-full"
          buttonClassName="h-11 w-full"
        />
      </section>
      <CheckoutPlanForm
        planKey="PRO_MONTHLY"
        label={`Switch to Pro ${proMonthlyShort()} instead`}
        showPrice={false}
        variant="link"
        returnTo="/pricing"
        className="justify-center"
      />
    </>
  );
}
