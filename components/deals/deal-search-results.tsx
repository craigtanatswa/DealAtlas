import Link from "next/link";

import { DealList } from "@/components/deals/deal-list";
import { PaginationNav } from "@/components/deals/pagination-nav";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { signupPathWithAlert } from "@/lib/auth/redirect";
import type { RankedDealSearchResult } from "@/lib/search/dto";
import { searchHref, type PublicSearchFilters } from "@/lib/search/params";

export function DealSearchResults({
  result,
  filters,
  path = "/deals",
  publicSearch = false,
  signedIn = false,
}: {
  result: RankedDealSearchResult;
  filters: PublicSearchFilters;
  path?: string;
  publicSearch?: boolean;
  signedIn?: boolean;
}) {
  if (result.total === 0) {
    if (publicSearch && filters.status === "CLOSING_SOON") {
      return (
        <EmptyState
          title="Nothing closes in the next 7 days."
          description="Open opportunities are still listed."
        >
          <Button asChild variant="outline" className="min-h-11">
            <Link href={searchHref({ ...filters, status: "OPEN", page: 1 }, 1, path)}>
              See all open opportunities
            </Link>
          </Button>
        </EmptyState>
      );
    }
    if (publicSearch && filters.status === "UPCOMING") {
      return (
        <EmptyState
          title="No upcoming opportunities match these filters yet."
          description="You can still ask to be told when a matching notice opens."
        >
          <Button asChild className="min-h-11">
            <Link href={signedIn ? "/app/alerts" : signupPathWithAlert(searchHref(filters, 1, path))}>
              Set an alert for this search
            </Link>
          </Button>
        </EmptyState>
      );
    }
    return (
      <EmptyState kind="noDealsMatchFilters">
        <Button asChild variant="outline">
          <Link href={path}>Clear filters</Link>
        </Button>
      </EmptyState>
    );
  }

  const count = publicSearch && !filters.status
    ? result.total === 1
      ? "1 biddable opportunity"
      : `${result.total} biddable opportunities`
    : result.total === 1
      ? "1 opportunity matches these filters."
      : `${result.total} opportunities match these filters.`;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {count}
      </p>
      <DealList items={result.items} signedIn={signedIn} />
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
