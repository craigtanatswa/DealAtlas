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
import { PLAN_PUBLIC_NAME } from "@/lib/billing/lifetime-copy";
import { isLifetimeTerm } from "@/lib/billing/lifetime-term";
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
  const lifetime = isLifetimeTerm(entitlement);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current plan</CardTitle>
        <CardDescription>
          {lifetime
            ? "Lifetime access is a one-time payment. There is nothing to renew or cancel."
            : "Pro is granted only after Dodo confirms the subscription. Checkout redirects and query flags are ignored."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-heading text-xl font-semibold tracking-tight">
            {pro ? (lifetime ? PLAN_PUBLIC_NAME : planLabel(entitlement.planKey, entitlement.billingInterval, foundingMember)) : "Free"}
          </p>
          <Badge variant={lifetime ? "success" : statusVariant(entitlement.status)}>
            {lifetime ? PLAN_PUBLIC_NAME : (STATUS_LABELS[entitlement.status] ?? entitlement.status)}
          </Badge>
        </div>
        {lifetime ? (
          <dl className="grid gap-3 text-[0.9375rem] leading-6">
            <div>
              <dt className="text-muted-foreground">Billing</dt>
              <dd>One-time payment</dd>
            </div>
          </dl>
        ) : (
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
        )}
        {!lifetime && accessUntil ? (
          <p className="text-[0.9375rem] leading-6 text-muted-foreground">{accessUntil}</p>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-3">
        {hasCustomerPortal ? (
          <form action="/api/billing/portal" method="post">
            <Button type="submit">{lifetime ? "View receipts" : "Manage billing"}</Button>
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
