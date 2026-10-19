import type { ReactNode } from "react";
import Link from "next/link";

import { DealList } from "@/components/deals/deal-list";
import { HOME_SEARCH_EXAMPLES } from "@/components/deals/hero-search-form";
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
  sort,
  maxPages,
}: {
  result: RankedDealSearchResult;
  filters: PublicSearchFilters;
  path?: string;
  publicSearch?: boolean;
  signedIn?: boolean;
  sort?: ReactNode;
  maxPages?: number;
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
        <p className="mt-2 text-sm text-muted-foreground">
          Try one of these searches:{" "}
          {HOME_SEARCH_EXAMPLES.map((term, index) => (
            <span key={term}>
              <Link
                href={searchHref(
                  { page: 1, limit: filters.limit, query: term },
                  1,
                  path,
                )}
                className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {term}
              </Link>
              {index < HOME_SEARCH_EXAMPLES.length - 1 ? ", " : "."}
            </span>
          ))}
        </p>
      </EmptyState>
    );
  }

  const count =
    result.total === 1
      ? "1 opportunity matches these filters."
      : `${result.total} opportunities match these filters.`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {count}
        </p>
        {sort}
      </div>
      <DealList items={result.items} signedIn={signedIn} />
      <PaginationNav
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        filters={filters}
        path={path}
        maxPages={maxPages}
      />
    </div>
  );
}
