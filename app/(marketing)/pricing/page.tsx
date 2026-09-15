import type { Metadata } from "next";
import Link from "next/link";

import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { Heading, Text } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <div className="flex flex-col gap-2">
        <Heading>DealAtlas Pro</Heading>
        <Text variant="muted" className="max-w-2xl">
          Unlock buyer identity, source links, and documents after a verified
          subscription. Prices shown here are display copy; checkout maps to
          server-configured Dodo product IDs.
        </Text>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly</CardTitle>
            <CardDescription>{DISPLAY_PRICING.proMonthly}</CardDescription>
          </CardHeader>
          <CardContent>
            {user ? (
              <CheckoutPlanForm
                planKey="PRO_MONTHLY"
                label="Subscribe monthly"
                recommended
              />
            ) : (
              <Button asChild>
                <Link href={loginPathWithNext("/pricing")}>
                  Sign in to subscribe
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Annual</CardTitle>
            <CardDescription>{DISPLAY_PRICING.proAnnual}</CardDescription>
          </CardHeader>
          <CardContent>
            {user ? (
              <CheckoutPlanForm planKey="PRO_ANNUAL" label="Subscribe annually" />
            ) : (
              <Button asChild variant="outline">
                <Link href={loginPathWithNext("/pricing")}>
                  Sign in to subscribe
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Free</CardTitle>
            <CardDescription>
              Useful commercial context without source identity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-[0.9375rem] leading-6 text-muted-foreground">
              {FREE_FEATURES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pro</CardTitle>
            <CardDescription>
              Entitlement is granted only after provider confirmation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-[0.9375rem] leading-6 text-muted-foreground">
              {PRO_FEATURES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </Main>
  );
}
