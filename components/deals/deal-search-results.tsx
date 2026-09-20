import Link from "next/link";

import { DealList } from "@/components/deals/deal-list";
import { PaginationNav } from "@/components/deals/pagination-nav";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import type { RankedDealSearchResult } from "@/lib/search/dto";
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
      <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {result.total === 1
          ? "1 opportunity matches these filters."
          : `${result.total} opportunities match these filters.`}
      </p>
      <DealList items={result.items} />
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
