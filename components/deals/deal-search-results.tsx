import Link from "next/link";

import { DealCard } from "@/components/deals/deal-card";
import { PaginationNav } from "@/components/deals/pagination-nav";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { toDealCardData, type RankedDealSearchResult } from "@/lib/search/dto";
import type { PublicSearchFilters } from "@/lib/search/params";

export function DealSearchResults({
  result,
  filters,
  path = "/deals",
}: {
  result: RankedDealSearchResult;
  filters: PublicSearchFilters;
  path?: string;
}) {
  if (result.total === 0) {
    return (
      <EmptyState kind="noDealsMatchFilters">
        <Button asChild variant="outline">
          <Link href={path}>Clear filters</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p
        className="text-sm text-muted-foreground"
        aria-live="polite"
      >
        {result.total === 1
          ? "1 opportunity matches these filters."
          : `${result.total} opportunities match these filters.`}
      </p>
      <ul className="grid gap-4">
        {result.items.map((item) => (
          <li key={item.preview.slug}>
            <DealCard
              deal={toDealCardData(
                item.preview,
                item.match?.score,
                item.match?.reasons.map((reason) => reason.label),
              )}
            />
          </li>
        ))}
      </ul>
      <PaginationNav
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        filters={filters}
        path={path}
      />
    </div>
  );
}
