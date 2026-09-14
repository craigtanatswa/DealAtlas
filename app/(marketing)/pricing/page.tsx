import type { Metadata } from "next";
import Link from "next/link";

import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { Heading } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthUser } from "@/lib/auth/session";
import { loginPathWithNext } from "@/lib/auth/redirect";
import { DISPLAY_PRICING } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Pricing",
};

export default async function PricingPage() {
  const user = await getAuthUser();

  return (
    <Main className="gap-10">
      <div className="flex flex-col gap-2">
        <Heading>DealAtlas Pro</Heading>
        <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground md:text-base">
          Unlock buyer identity, source links, and documents after a verified
          subscription. Prices shown here are display copy; checkout maps to
          server-configured Dodo product IDs.
        </p>
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
    </Main>
  );
}
