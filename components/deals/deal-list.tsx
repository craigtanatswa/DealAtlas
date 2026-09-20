import { DealCard } from "@/components/deals/deal-card";
import { toDealCardData, type RankedDealSearchItem } from "@/lib/search/dto";

export function DealList({
  items,
  hrefForSlug,
}: {
  items: RankedDealSearchItem[];
  hrefForSlug?: (slug: string) => string;
}) {
  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li key={item.preview.slug}>
          <DealCard
            deal={toDealCardData(
              item.preview,
              item.match?.score,
              item.match?.reasons.map((reason) => reason.label),
            )}
            href={hrefForSlug?.(item.preview.slug)}
          />
        </li>
      ))}
    </ul>
  );
}
