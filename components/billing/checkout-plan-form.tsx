import { Button } from "@/components/ui/button";
import type { CheckoutPlanKey } from "@/lib/billing/types";
import { priceLabel } from "@/lib/billing/display";
import { cn } from "@/lib/utils";

export function CheckoutPlanForm({
  planKey,
  label,
  recommended = false,
  returnTo,
  offer,
  showPrice = true,
  variant = "default",
  className,
  buttonClassName,
}: {
  planKey: CheckoutPlanKey;
  label: string;
  recommended?: boolean;
  returnTo?: string;
  /** Asks the server to reserve a founding place. Never a price or product id. */
  offer?: "founding";
  showPrice?: boolean;
  variant?: "default" | "outline" | "link";
  className?: string;
  buttonClassName?: string;
}) {
  return (
    <form
      action="/api/billing/checkout"
      method="post"
      className={cn(showPrice ? "flex flex-col gap-3" : "flex", className)}
    >
      <input type="hidden" name="planKey" value={planKey} />
      {offer ? <input type="hidden" name="offer" value={offer} /> : null}
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
