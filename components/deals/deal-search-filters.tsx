"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { SlidersHorizontalIcon } from "lucide-react";

import {
  DealFilterSelects,
  DealKeywordFields,
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

function submitWithoutEmptyFields(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const params = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    if (typeof value === "string" && value.trim()) {
      params.set(key, value.trim());
    }
  }
  const query = params.toString();
  window.location.assign(query ? `/deals?${query}` : "/deals");
}

function FilterForm({
  filters,
  idPrefix,
  includeKeyword,
  className,
}: {
  filters: PublicSearchFilters;
  idPrefix: string;
  includeKeyword?: boolean;
  className?: string;
}) {
  return (
    <form
      method="get"
      action="/deals"
      className={className}
      onSubmit={submitWithoutEmptyFields}
    >
      {includeKeyword ? (
        <div className="mb-4">
          <DealKeywordFields filters={filters} idPrefix={idPrefix} />
        </div>
      ) : filters.query ? (
        <input type="hidden" name="q" value={filters.query} />
      ) : null}
      <DealFilterSelects filters={filters} idPrefix={idPrefix} />
      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="submit">Apply filters</Button>
        <Button asChild variant="outline">
          <Link href="/deals">Clear</Link>
        </Button>
      </div>
    </form>
  );
}

export function DealSearchFilterRail({
  filters,
}: {
  filters: PublicSearchFilters;
}) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-6 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="font-heading text-base font-semibold">Filters</h2>
        <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">
          Free search uses sanitised preview fields only.
        </p>
        <FilterForm
          filters={filters}
          idPrefix="desktop-filter"
          className="mt-4"
        />
      </div>
    </aside>
  );
}

export function DealSearchFilterDrawer({
  filters,
}: {
  filters: PublicSearchFilters;
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
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
