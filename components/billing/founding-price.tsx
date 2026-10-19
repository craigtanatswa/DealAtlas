import { foundingBilledLine, foundingMonthlyEquivalent, proMonthlyShort, proMonthlyWasLabel } from "@/lib/billing/founding-ui";
import { DISPLAY_PRICING } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function FoundingPriceLead({ size = "lg", className }: { size?: "lg" | "md"; className?: string }) {
  const monthly = foundingMonthlyEquivalent();
  return (
    <div className={className}>
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className={cn("font-bold tracking-tight text-foreground tabular-nums", size === "lg" ? "text-3xl" : "text-2xl")}>
          {monthly ?? DISPLAY_PRICING.foundingAnnual}
          {monthly ? <span className={cn("font-semibold text-muted-foreground", size === "lg" ? "text-base" : "text-sm")}>/mo</span> : null}
        </span>
        <s aria-label={proMonthlyWasLabel()} className={cn("font-medium text-muted-foreground decoration-2 tabular-nums", size === "lg" ? "text-lg" : "text-base")}>{proMonthlyShort()}</s>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{foundingBilledLine()}</p>
    </div>
  );
}

/**
 * Founding button text: the action, then the usual monthly price struck through and the
 * founding monthly price in bold, e.g. "Become a founding member ~~£39/mo~~ **£24.17/mo**".
 * Prices come from DISPLAY_PRICING. The billed-yearly line stays outside the button.
 */
export function FoundingButtonLabel({ text }: { text: string }) {
  const monthly = foundingMonthlyEquivalent();
  return (
    <span className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 text-center">
      <span>{text}</span>
      <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap tabular-nums">
        <s aria-label={proMonthlyWasLabel()} className="font-normal opacity-75 decoration-1">
          {proMonthlyShort()}
        </s>
        <strong className="font-bold">
          {monthly ? `${monthly}/mo` : DISPLAY_PRICING.foundingAnnual.replace("/year", "/yr")}
        </strong>
      </span>
    </span>
  );
}
