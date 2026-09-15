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
import type { PublicSearchFilters } from "@/lib/search/params";

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
      <div className="sticky top-6 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="font-heading text-base font-semibold">Filters</h2>
        <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">
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
