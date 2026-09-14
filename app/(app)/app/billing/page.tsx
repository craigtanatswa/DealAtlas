import type { Metadata } from "next";

import { BillingSummary } from "@/components/billing/billing-summary";
import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { Heading } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { loadDodoCustomerIdForUser } from "@/lib/billing/store";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { isProEntitlement } from "@/lib/entitlements/policy";
import { DISPLAY_PRICING } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Billing",
};

export default async function BillingPage() {
  const { user } = await requireUser("/app/billing");
  const entitlement = await getCurrentEntitlement(user.id);
  const customerId = await loadDodoCustomerIdForUser(user.id);
  const pro = isProEntitlement(entitlement);

  return (
    <Main className="gap-10">
      <div className="flex flex-col gap-2">
        <Heading>Billing</Heading>
        <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground md:text-base">
          Manage DealAtlas Pro. Invoices, payment methods, and cancellation are
          handled in the Dodo customer portal. Access is not granted from a
          checkout redirect.
        </p>
      </div>
      <BillingSummary
        entitlement={entitlement}
        hasCustomerPortal={Boolean(customerId)}
      />
      {pro ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Upgrade to DealAtlas Pro</CardTitle>
            <CardDescription>
              {DISPLAY_PRICING.proMonthly} or {DISPLAY_PRICING.proAnnual}. Product
              IDs stay on the server.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <CheckoutPlanForm
              planKey="PRO_MONTHLY"
              label="Subscribe monthly"
              recommended
            />
            <CheckoutPlanForm planKey="PRO_ANNUAL" label="Subscribe annually" />
          </CardContent>
        </Card>
      )}
    </Main>
  );
}
