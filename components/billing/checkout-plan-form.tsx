import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { CheckoutAnalyticsPlan } from "@/lib/analytics/events";
import type { CheckoutPlanKey } from "@/lib/billing/types";
import { priceLabel } from "@/lib/billing/display";
import { cn } from "@/lib/utils";

export function CheckoutPlanForm({
  planKey,
  label,
  recommended = false,
  returnTo,
  showPrice = true,
  variant = "default",
  className,
  buttonClassName,
  analyticsPlan,
}: {
  planKey: CheckoutPlanKey;
  /** Only the founding CTA needs this; other plans follow the plan key. */
  analyticsPlan?: Extract<CheckoutAnalyticsPlan, "founding">;
  label: ReactNode;
  recommended?: boolean;
  returnTo?: string;
  showPrice?: boolean;
  variant?: "default" | "outline" | "link";
  className?: string;
  buttonClassName?: string;
}) {
  return (
    <form
      action="/api/billing/checkout"
      method="post"
      data-analytics-plan={
        analyticsPlan ?? (planKey === "PRO_MONTHLY" ? "monthly" : "annual")
      }
      className={cn(showPrice ? "flex flex-col gap-3" : "flex", className)}
    >
      <input type="hidden" name="planKey" value={planKey} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <Button
        type="submit"
        variant={variant}
        className={cn("h-11 min-h-11 whitespace-normal", buttonClassName)}
      >
        {label}
      </Button>
      {showPrice ? (
        <p className="text-[0.8125rem] leading-5 text-muted-foreground">
          {priceLabel(planKey)}
          {recommended ? " · recommended for testing" : null}
        </p>
      ) : null}
    </form>
  );
}
