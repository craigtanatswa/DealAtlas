import { Button } from "@/components/ui/button";
import type { CheckoutPlanKey } from "@/lib/billing/types";
import { priceLabel } from "@/lib/billing/display";

export function CheckoutPlanForm({
  planKey,
  label,
  recommended = false,
}: {
  planKey: CheckoutPlanKey;
  label: string;
  recommended?: boolean;
}) {
  return (
    <form action="/api/billing/checkout" method="post" className="flex flex-col gap-3">
      <input type="hidden" name="planKey" value={planKey} />
      <Button type="submit">{label}</Button>
      <p className="text-[0.8125rem] leading-5 text-muted-foreground">
        {priceLabel(planKey)}
        {recommended ? " · recommended for testing" : null}
      </p>
    </form>
  );
}
