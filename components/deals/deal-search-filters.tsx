"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { SlidersHorizontalIcon } from "lucide-react";

import {
  DealFilterSelects,
  DealKeywordFields,
  DealRelevanceFields,
} from "@/components/deals/deal-search-fields";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BUYER_SECTOR_LABELS } from "@/lib/constants";
import { DEAL_STATUS_LABELS, DEAL_TYPE_LABELS } from "@/lib/search/filters";
import { hasActivePublicFilters, searchHref, type PublicSearchFilters } from "@/lib/search/params";

function submitWithoutEmptyFields(event: FormEvent<HTMLFormElement>, path: string) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const params = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    if (typeof value === "string" && value.trim()) {
      params.set(key, value.trim());
    }
  }
  const query = params.toString();
  window.location.assign(query ? `${path}?${query}` : path);
}

function FilterForm({
  filters,
  idPrefix,
  includeKeyword,
  className,
  path = "/deals",
  showRelevance = false,
}: {
  filters: PublicSearchFilters;
  idPrefix: string;
  includeKeyword?: boolean;
  className?: string;
  path?: string;
  showRelevance?: boolean;
}) {
  return (
    <form
      method="get"
      action={path}
      className={className}
      onSubmit={(event) => submitWithoutEmptyFields(event, path)}
    >
      {includeKeyword ? (
        <div className="mb-4">
          <DealKeywordFields filters={filters} idPrefix={idPrefix} />
        </div>
      ) : filters.query ? (
        <input type="hidden" name="q" value={filters.query} />
      ) : null}
      {showRelevance ? (
        <div className="mb-4">
          <DealRelevanceFields filters={filters} idPrefix={idPrefix} />
        </div>
      ) : null}
      <DealFilterSelects filters={filters} idPrefix={idPrefix} />
      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="submit">Apply filters</Button>
        <Button asChild variant="outline">
          <Link href={path}>Clear</Link>
        </Button>
      </div>
    </form>
  );
}

export function DealSearchFilterRail({
  filters,
  path = "/deals",
  showRelevance = false,
}: {
  filters: PublicSearchFilters;
  path?: string;
  showRelevance?: boolean;
}) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 rounded-[1.5rem] border border-border bg-background p-4">
        <h2 className="font-heading text-base font-semibold text-balance">Filters</h2>
        <p className="mt-1 text-pretty text-[0.8125rem] leading-5 text-muted-foreground">
          {showRelevance
            ? "Search sanitised previews and sort by your company profile relevance."
            : "Free search uses sanitised preview fields only."}
        </p>
        <FilterForm
          filters={filters}
          idPrefix="desktop-filter"
          className="mt-4"
          path={path}
          showRelevance={showRelevance}
        />
      </div>
    </aside>
  );
}

export function DealSearchFilterDrawer({
  filters,
  path = "/deals",
  showRelevance = false,
}: {
  filters: PublicSearchFilters;
  path?: string;
  showRelevance?: boolean;
}) {
  return (
    <div className="lg:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <Button type="button" variant="outline">
            <SlidersHorizontalIcon aria-hidden="true" />
            Filters
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>
              Narrow sanitised opportunities. Buyer and source identity are not
              included.
            </SheetDescription>
          </SheetHeader>
          <FilterForm
            filters={filters}
            idPrefix="mobile-filter"
            includeKeyword
            className="px-4 pb-6"
            path={path}
            showRelevance={showRelevance}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

const FILTER_CHIPS: Array<{
  key: keyof PublicSearchFilters;
  label: string;
  value: (filters: PublicSearchFilters) => string | undefined;
}> = [
  { key: "query", label: "Search", value: (filters) => filters.query },
  { key: "category", label: "Category", value: (filters) => filters.category },
  {
    key: "buyerSector",
    label: "Sector",
    value: (filters) =>
      filters.buyerSector ? BUYER_SECTOR_LABELS[filters.buyerSector] : undefined,
  },
  { key: "region", label: "Location", value: (filters) => filters.region },
  { key: "valueBand", label: "Value", value: (filters) => filters.valueBand },
  {
    key: "deadlineBand",
    label: "Deadline",
    value: (filters) => filters.deadlineBand,
  },
  {
    key: "dealType",
    label: "Type",
    value: (filters) =>
      filters.dealType ? DEAL_TYPE_LABELS[filters.dealType] : undefined,
  },
  {
    key: "status",
    label: "Status",
    value: (filters) =>
      filters.status ? DEAL_STATUS_LABELS[filters.status] : undefined,
  },
];

export function DealActiveFilters({
  filters,
  path = "/deals",
}: {
  filters: PublicSearchFilters;
  path?: string;
}) {
  if (!hasActivePublicFilters(filters)) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-[0.8125rem] font-medium text-muted-foreground">Active filters</p>
      {FILTER_CHIPS.map((chip) => {
        const value = chip.value(filters);
        if (!value) {
          return null;
        }
        const nextFilters = { ...filters, [chip.key]: undefined, page: 1 };
        return (
          <Link
            key={chip.key}
            href={searchHref(nextFilters, 1, path)}
            className="inline-flex min-h-8 items-center rounded-md border border-border bg-background px-2 py-1 text-[0.8125rem] leading-5 text-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="text-muted-foreground">{chip.label}:</span>
            <span className="ml-1 font-medium">{value}</span>
            <span className="sr-only"> Remove {chip.label} filter</span>
          </Link>
        );
      })}
      <Button asChild variant="ghost" size="sm">
        <Link href={path}>Clear all</Link>
      </Button>
    </div>
  );
}
