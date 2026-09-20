import type { Metadata } from "next";
import Link from "next/link";

import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { Heading, Text } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { getAuthUser } from "@/lib/auth/session";
import { getAppOrigin } from "@/lib/auth/urls";
import { loginPathWithNext } from "@/lib/auth/redirect";
import { DISPLAY_PRICING } from "@/lib/constants";
import { webPageJsonLd } from "@/lib/seo/json-ld";
import { marketingPageMetadata } from "@/lib/seo/metadata";
import { PUBLIC_PAGE_COPY } from "@/lib/seo/pages";

const origin = getAppOrigin();

export const metadata: Metadata = marketingPageMetadata({
  ...PUBLIC_PAGE_COPY.pricing,
  origin,
});

const FREE_FEATURES = [
  "Browse sanitised active opportunities",
  "Search preview titles and summaries",
  "Filter by category, sector, region, value and closing window",
  "Save a limited number of locked previews",
];

const PRO_FEATURES = [
  "Reveal buyer identity and exact source",
  "Source and application URLs where permitted",
  "Documents, requirements, and procurement contacts",
  "Buyer, supplier, contract, and renewal intelligence",
  "Alerts, saved searches, and CSV export within plan limits",
];

export default async function PricingPage() {
  const user = await getAuthUser();

  return (
    <Main className="gap-10">
      <JsonLd
        data={webPageJsonLd({
          origin,
          path: PUBLIC_PAGE_COPY.pricing.path,
          name: PUBLIC_PAGE_COPY.pricing.title,
          description: PUBLIC_PAGE_COPY.pricing.description,
        })}
      />
      <div className="mx-auto flex max-w-3xl flex-col gap-3 text-center">
        <Heading>DealAtlas Pro</Heading>
        <Text variant="muted">
          Unlock buyer identity, source links, and documents after a verified
          subscription. Prices shown here are display copy; checkout maps to
          server-configured Dodo product IDs.
        </Text>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="flex flex-col rounded-lg border border-border bg-background p-6">
          <h2 className="font-heading text-xl font-semibold">Free</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Useful commercial context without source identity.
          </p>
          <ul className="mt-6 flex flex-col gap-3 text-[0.9375rem] leading-6 text-muted-foreground">
            {FREE_FEATURES.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true" className="text-foreground">
                  ·
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <Button asChild variant="outline">
              <Link href="/deals">Browse opportunities</Link>
            </Button>
          </div>
        </section>
        <section className="flex flex-col rounded-lg border border-primary/20 bg-background p-6 ring-1 ring-primary/15">
          <h2 className="font-heading text-xl font-semibold">Pro</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Entitlement is granted only after provider confirmation.
          </p>
          <p className="mt-4 text-2xl font-semibold tracking-tight">
            {DISPLAY_PRICING.proMonthly}
          </p>
          <p className="text-sm text-muted-foreground">
            or {DISPLAY_PRICING.proAnnual}
          </p>
          <ul className="mt-6 flex flex-col gap-3 text-[0.9375rem] leading-6 text-muted-foreground">
            {PRO_FEATURES.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true" className="text-foreground">
                  ·
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-3">
            {user ? (
              <>
                <CheckoutPlanForm
                  planKey="PRO_MONTHLY"
                  label="Subscribe monthly"
                  recommended
                />
                <CheckoutPlanForm planKey="PRO_ANNUAL" label="Subscribe annually" />
              </>
            ) : (
              <>
                <Button asChild>
                  <Link href={loginPathWithNext("/pricing")}>
                    Sign in to subscribe
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={loginPathWithNext("/pricing")}>
                    Sign in for annual billing
                  </Link>
                </Button>
              </>
            )}
          </div>
        </section>
      </div>
    </Main>
  );
}
