import { FoundingPriceInline } from "@/components/billing/founding-price";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FOUNDING_COPY } from "@/lib/billing/founding-ui";
import { accessUntilCopy, formatBillingDate, planLabel, STATUS_LABELS } from "@/lib/billing/display";
import { isProEntitlement } from "@/lib/entitlements/policy";
import type { EntitlementSnapshot } from "@/lib/entitlements/types";

function statusVariant(status: EntitlementSnapshot["status"]) {
  if (status === "ACTIVE") {
    return "success" as const;
  }
  if (status === "ON_HOLD" || status === "FAILED" || status === "EXPIRED") {
    return "warning" as const;
  }
  return "secondary" as const;
}

export function BillingSummary({
  entitlement,
  hasCustomerPortal,
  foundingMember = false,
}: {
  entitlement: EntitlementSnapshot;
  hasCustomerPortal: boolean;
  foundingMember?: boolean;
}) {
  const periodEnd = formatBillingDate(entitlement.currentPeriodEnd);
  const accessUntil = accessUntilCopy(entitlement);
  const pro = isProEntitlement(entitlement);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current plan</CardTitle>
        <CardDescription>
          Pro is granted only after Dodo confirms the subscription. Checkout
          redirects and query flags are ignored.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-heading text-xl font-semibold tracking-tight">
            {pro ? planLabel(entitlement.planKey, entitlement.billingInterval, foundingMember) : "Free"}
          </p>
          <Badge variant={statusVariant(entitlement.status)}>
            {STATUS_LABELS[entitlement.status] ?? entitlement.status}
          </Badge>
        </div>
        {pro && foundingMember ? (
          <div className="space-y-1">
            <FoundingPriceInline className="text-lg" />
            <p className="text-[0.9375rem] leading-6 text-muted-foreground">
              {FOUNDING_COPY.priceLocked}
            </p>
          </div>
        ) : null}
        <dl className="grid gap-3 text-[0.9375rem] leading-6">
          <div>
            <dt className="text-muted-foreground">Billing interval</dt>
            <dd>{entitlement.billingInterval === "ANNUAL" ? "Annual" : entitlement.billingInterval === "MONTHLY" ? "Monthly" : "Not billed"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Renewal / period end</dt>
            <dd>{periodEnd ?? "Not scheduled"}</dd>
          </div>
        </dl>
        {accessUntil ? (
          <p className="text-[0.9375rem] leading-6 text-muted-foreground">{accessUntil}</p>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-3">
        {hasCustomerPortal ? (
          <form action="/api/billing/portal" method="post">
            <Button type="submit">Manage billing</Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            The customer portal is available after a verified Dodo customer is
            linked to this account.
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
