import {
  proAnnualBilledLine,
  proAnnualMonthlyEquivalent,
  proAnnualShort,
  proMonthlyShort,
  proMonthlyWasLabel,
} from "@/lib/billing/founding-ui";
import {
  LIFETIME_ANCHOR,
  LIFETIME_PLAN_LINE,
  LIFETIME_PRICE_SHORT,
} from "@/lib/billing/lifetime-copy";
import { cn } from "@/lib/utils";

/**
 * The one Lifetime price format:
 * struck-through Pro annual price, then the bold one-time Lifetime price,
 * e.g. "£350/yr £250 once". Every Lifetime surface renders this component so
 * the numbers cannot drift.
 */
export function FoundingPriceInline({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 whitespace-nowrap tabular-nums",
        className,
      )}
    >
      <s aria-label={`was ${LIFETIME_ANCHOR}`} className="font-normal opacity-75 decoration-1">
        {LIFETIME_ANCHOR}
      </s>
      <strong className="font-bold">{LIFETIME_PRICE_SHORT}</strong>
    </span>
  );
}

export function FoundingPriceLead({
  size = "lg",
  className,
}: {
  size?: "lg" | "md";
  className?: string;
}) {
  return (
    <div className={className}>
      <FoundingPriceInline
        className={cn(
          size === "lg" ? "text-3xl" : "text-2xl",
          size === "lg" ? "[&>s]:text-lg [&>span]:text-base" : "[&>s]:text-base [&>span]:text-sm",
        )}
      />
      <p className="mt-1 text-sm text-foreground/80">{LIFETIME_PLAN_LINE}</p>
    </div>
  );
}

/**
 * Lifetime button text: the action only. The price line sits next to the button.
 */
export function FoundingButtonLabel({ text }: { text: string }) {
  return (
    <span className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 text-center">
      <span>{text}</span>
    </span>
  );
}

/**
 * Standard Pro annual price format: struck-through monthly price, then the
 * annual price shown per month, e.g. "£39/mo £29.17/mo".
 */
export function ProAnnualPriceInline({ className }: { className?: string }) {
  const monthly = proAnnualMonthlyEquivalent();
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 whitespace-nowrap tabular-nums",
        className,
      )}
    >
      <s aria-label={proMonthlyWasLabel()} className="font-normal opacity-75 decoration-1">
        {proMonthlyShort()}
      </s>
      <strong className="font-bold">{monthly ? `${monthly}/mo` : proAnnualShort()}</strong>
    </span>
  );
}

export function ProAnnualPriceLead({
  size = "lg",
  className,
}: {
  size?: "lg" | "md";
  className?: string;
}) {
  return (
    <div className={className}>
      <ProAnnualPriceInline
        className={cn(
          size === "lg" ? "text-3xl" : "text-2xl",
          size === "lg" ? "[&>s]:text-lg" : "[&>s]:text-base",
        )}
      />
      <p className="mt-1 text-sm text-muted-foreground">{proAnnualBilledLine()}</p>
    </div>
  );
}

/**
 * Pro annual button text: the action, then the shared annual price format.
 * Prices come from DISPLAY_PRICING helpers via ProAnnualPriceInline.
 */
export function ProAnnualButtonLabel({ text }: { text: string }) {
  return (
    <span className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 text-center">
      <span>{text}</span>
      <ProAnnualPriceInline />
    </span>
  );
}
