import { DealCard } from "@/components/deals/deal-card";
import { toDealCardData, type RankedDealSearchItem } from "@/lib/search/dto";
import { cn } from "@/lib/utils";

export function DealList({
  items,
  hrefForSlug,
  signedIn = false,
  className,
  proLock = false,
}: {
  items: RankedDealSearchItem[];
  hrefForSlug?: (slug: string) => string;
  signedIn?: boolean;
  className?: string;
  proLock?: boolean;
}) {
  return (
    <ul className={cn("grid gap-3", className)}>
      {items.map((item) => (
        <li key={item.preview.slug}>
          <DealCard
            deal={toDealCardData(
              item.preview,
              item.match?.score,
              item.match?.reasons.map((reason) => reason.label),
            )}
            href={hrefForSlug?.(item.preview.slug)}
            signedIn={signedIn}
            proLock={proLock}
          />
        </li>
      ))}
    </ul>
  );
}
