import {
  FOUNDING_COPY,
  FOUNDING_LIMITED_PLACES,
  foundingAnnualShort,
  foundingMonthlyEquivalent,
  proMonthlyShort,
  proMonthlyWasLabel,
} from "@/lib/billing/founding-ui";
import { cn } from "@/lib/utils";

/**
 * The one founding price format:
 * struck-through usual monthly price, bold founding monthly price, then the
 * founding annual price in brackets, e.g. "£39/mo £24.17/mo (£290/yr)".
 * Every founding surface renders this component so the numbers cannot drift.
 */
export function FoundingPriceInline({ className }: { className?: string }) {
  const monthly = foundingMonthlyEquivalent();
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
      <strong className="font-bold">{monthly ? `${monthly}/mo` : foundingAnnualShort()}</strong>{" "}
      <span className="font-normal opacity-75">({foundingAnnualShort()})</span>
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
      <p className="mt-1 text-sm text-muted-foreground">
        <span>{FOUNDING_LIMITED_PLACES}</span>
        {" · "}
        <span>{FOUNDING_COPY.priceLocked}</span>
      </p>
    </div>
  );
}

/**
 * Founding button text: the action, then the shared founding price format.
 * Prices come from DISPLAY_PRICING helpers via FoundingPriceInline.
 */
export function FoundingButtonLabel({ text }: { text: string }) {
  return (
    <span className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 text-center">
      <span>{text}</span>
      <FoundingPriceInline />
    </span>
  );
}
