import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { FoundingCheckoutSummary } from "@/components/billing/founding-checkout-summary";
import { Main } from "@/components/layout/container";
import { Heading } from "@/components/layout/heading";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { parseCheckoutPlan, signupPathForPlan } from "@/lib/auth/redirect";
import { getCurrentAccount } from "@/lib/auth/session";
import { priceLabel } from "@/lib/billing/display";
import { foundingUiState } from "@/lib/billing/founding-ui";
import { readFoundingPublicCount } from "@/lib/billing/founding-public";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your plan",
  robots: { index: false, follow: false },
};

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const plan = parseCheckoutPlan(firstParam(params.plan));
  if (!plan) {
    redirect("/pricing");
  }

  const account = await getCurrentAccount();
  if (!account) {
    redirect(signupPathForPlan(plan));
  }

  const count = await readFoundingPublicCount();
  const foundingState = foundingUiState(count);
  const showFounding =
    plan === "PRO_ANNUAL" &&
    (foundingState === "available" || foundingState === "last");

  return (
    <Main width="narrow" className="gap-6">
      {showFounding ? (
        <FoundingCheckoutSummary remaining={count.remaining} cap={count.cap} />
      ) : (
        <>
          <Heading>Confirm your plan</Heading>
          <Card>
            <CardHeader>
              <CardTitle>{priceLabel(plan)}</CardTitle>
              <CardDescription>
                Continue to secure checkout to confirm this plan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CheckoutPlanForm
                planKey={plan}
                label="Continue to secure checkout"
                returnTo="/pricing"
              />
            </CardContent>
          </Card>
        </>
      )}
    </Main>
  );
}
