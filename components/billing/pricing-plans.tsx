import { CheckIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { Heading, Text } from "@/components/layout/heading";
import { Button } from "@/components/ui/button";
import { signupPathForPlan, signupPathWithNext } from "@/lib/auth/redirect";
import type { CheckoutPlanKey } from "@/lib/billing/types";
import {
  FOUNDING_COPY,
  FOUNDING_PLAN_KEY,
  foundingPlacesLabel,
  foundingSoldOutNote,
  type FoundingPublicCount,
  type FoundingUiState,
} from "@/lib/billing/founding-ui";
import { DISPLAY_PRICING, FEATURE_LIMITS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const FREE_FEATURES = [
  "Browse live deal previews",
  "Sector, region and value band",
  "Closing dates",
  `Save up to ${FEATURE_LIMITS.FREE.savedDeals} opportunities`,
] as const;

const PRO_FEATURES = [
  "Buyer, reference number and original source",
  "Tender documents and named contacts",
  "Buyer and competitor intelligence",
  "Full details on every deal",
  "Saved searches and alerts",
] as const;

const FOUNDING_BUTTON =
  "w-full bg-[#00806A] text-white hover:bg-[#006b56]";

function splitPrice(label: string): { amount: string; period: string } {
  const slash = label.indexOf("/");
  if (slash === -1) return { amount: label, period: "" };
  return { amount: label.slice(0, slash), period: label.slice(slash) };
}

function FeatureList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-6 flex flex-col gap-3 text-sm leading-5 text-foreground">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-dealatlas-teal" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Price({ label, includeVat }: { label: string; includeVat?: boolean }) {
  const price = splitPrice(label);
  return (
    <p className="mt-4 text-4xl font-semibold tracking-tight text-foreground tabular-nums">
      {price.amount}
      {price.period ? (
        <span className="text-base font-medium text-muted-foreground">{price.period}</span>
      ) : null}
      {includeVat ? (
        <span className="text-base font-medium text-muted-foreground"> (incl. VAT)</span>
      ) : null}
    </p>
  );
}

function PlanCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "relative flex h-full flex-col rounded-lg border border-border bg-background p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

function PlacesMeter({ remaining, cap }: { remaining: number; cap: number }) {
  const taken = Math.min(cap, Math.max(0, cap - remaining));
  const percent = cap > 0 ? Math.round((taken / cap) * 100) : 0;
  const label = foundingPlacesLabel(remaining, cap);
  return (
    <div className="mt-5">
      <p className="text-sm font-medium text-foreground tabular-nums">{label}</p>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-dealatlas-teal/15"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={taken}
        aria-valuetext={label}
      >
        <div className="h-full rounded-full bg-dealatlas-teal" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-[0.8125rem] leading-5 text-muted-foreground">
        {FOUNDING_COPY.rechecked}
      </p>
    </div>
  );
}

function PlanCta({
  signedIn,
  planKey,
  label,
  variant = "outline",
  buttonClassName,
}: {
  signedIn: boolean;
  planKey: CheckoutPlanKey;
  label: string;
  variant?: "default" | "outline";
  buttonClassName?: string;
}) {
  if (!signedIn) {
    return (
      <Button asChild variant={variant} className={cn("h-11 w-full", buttonClassName)}>
        <Link href={signupPathForPlan(planKey)}>{label}</Link>
      </Button>
    );
  }
  return (
    <CheckoutPlanForm
      planKey={planKey}
      label={label}
      showPrice={false}
      variant={variant}
      returnTo="/pricing"
      className="w-full"
      buttonClassName={cn("w-full", buttonClassName)}
    />
  );
}

export function PricingPlans({
  signedIn,
  count,
  state,
}: {
  signedIn: boolean;
  count: FoundingPublicCount;
  state: Exclude<FoundingUiState, "hidden">;
}) {
  const soldOut = state === "sold_out";
  const annualVariant = soldOut ? "default" : "outline";

  return (
    <>
      <div className="mx-auto flex max-w-3xl flex-col gap-3 text-center">
        <Heading>Pricing</Heading>
        <Text variant="muted">Every Pro plan unlocks the same features.</Text>
        <p className="text-sm text-pretty text-muted-foreground">
          Pro access starts only after payment is confirmed.
        </p>
      </div>
      <div
        className={cn(
          "grid items-stretch gap-6 pt-3",
          soldOut ? "lg:grid-cols-3" : "lg:grid-cols-4",
        )}
      >
        <PlanCard className={cn(soldOut ? "order-1" : "order-2 lg:order-1")}>
          <h2 className="font-heading text-xl font-semibold text-balance">Free</h2>
          <p className="mt-4 text-4xl font-semibold tracking-tight tabular-nums">£0</p>
          <p className="mt-1 text-sm text-muted-foreground">{FOUNDING_COPY.freeNote}</p>
          <FeatureList items={FREE_FEATURES} />
          <div className="mt-auto pt-6">
            <Button asChild variant="outline" className="h-11 w-full">
              <Link href={signedIn ? "/deals" : signupPathWithNext("/pricing")}>
                {signedIn ? FOUNDING_COPY.browse : FOUNDING_COPY.createAccount}
              </Link>
            </Button>
          </div>
        </PlanCard>

        {soldOut ? null : (
          <PlanCard className="order-1 border-2 border-dealatlas-teal bg-[color-mix(in_srgb,var(--teal)_8%,var(--background))] lg:order-2">
            <p className="absolute -top-3 left-6 rounded-full bg-[#00806A] px-2.5 py-0.5 text-xs font-medium text-white">
              {FOUNDING_COPY.badge}
            </p>
            <h2 className="font-heading text-xl font-semibold text-balance">{FOUNDING_COPY.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{FOUNDING_COPY.firstMembers}</p>
            <Price label={DISPLAY_PRICING.foundingAnnual} includeVat />
            <p className="mt-1 text-sm font-medium text-[#00806A]">{FOUNDING_COPY.lessThanAnnual}</p>
            <p className="mt-4 flex items-start gap-2 text-sm font-medium text-foreground">
              <LockIcon className="mt-0.5 size-4 shrink-0 text-[#00806A]" aria-hidden="true" />
              <span>{FOUNDING_COPY.priceLocked}</span>
            </p>
            <PlacesMeter remaining={count.remaining} cap={count.cap} />
            <FeatureList items={PRO_FEATURES} />
            <div className="mt-auto flex flex-col gap-3 pt-6">
              <PlanCta
                signedIn={signedIn}
                planKey={FOUNDING_PLAN_KEY}
                label={FOUNDING_COPY.cta}
                variant="default"
                buttonClassName={FOUNDING_BUTTON}
              />
              <p className="text-center text-[0.8125rem] leading-5 text-pretty text-muted-foreground">
                {FOUNDING_COPY.cancelTerms}
              </p>
            </div>
          </PlanCard>
        )}

        <PlanCard className="order-3">
          <h2 className="font-heading text-xl font-semibold text-balance">Pro monthly</h2>
          <Price label={DISPLAY_PRICING.proMonthly} />
          <p className="mt-1 text-sm text-muted-foreground">{FOUNDING_COPY.monthlyNote}</p>
          <FeatureList items={PRO_FEATURES} />
          <div className="mt-auto pt-6">
            <PlanCta
              signedIn={signedIn}
              planKey="PRO_MONTHLY"
              label={FOUNDING_COPY.startMonthly}
            />
          </div>
        </PlanCard>

        <PlanCard
          className={cn("order-4", soldOut && "border-2 border-primary")}
        >
          {soldOut ? (
            <p className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
              {FOUNDING_COPY.recommended}
            </p>
          ) : null}
          <h2 className="font-heading text-xl font-semibold text-balance">Pro annual</h2>
          <Price label={DISPLAY_PRICING.proAnnual} />
          <p className="mt-1 text-sm text-muted-foreground">{FOUNDING_COPY.annualSaving}</p>
          <FeatureList items={PRO_FEATURES} />
          <div className="mt-auto pt-6">
            <PlanCta
              signedIn={signedIn}
              planKey="PRO_ANNUAL"
              label={FOUNDING_COPY.startAnnual}
              variant={annualVariant}
            />
          </div>
        </PlanCard>
      </div>
      {soldOut ? (
        <p className="mx-auto max-w-xl rounded-lg bg-muted px-4 py-3 text-center text-sm text-pretty text-muted-foreground">
          {foundingSoldOutNote(count.cap)}
        </p>
      ) : null}
    </>
  );
}
