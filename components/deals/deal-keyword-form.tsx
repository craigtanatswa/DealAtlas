import { DealKeywordFields } from "@/components/deals/deal-search-fields";
import { Button } from "@/components/ui/button";
import type { PublicSearchFilters } from "@/lib/search/params";
import { cn } from "@/lib/utils";

export function DealKeywordForm({
  filters,
  path = "/deals",
  variant = "default",
}: {
  filters: PublicSearchFilters;
  path?: string;
  variant?: "default" | "hero";
}) {
  const isHero = variant === "hero";

  return (
    <form
      method="get"
      action={path}
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end",
        isHero
          ? "rounded-[1rem] border border-border bg-background p-2 shadow-sm sm:items-stretch"
          : "rounded-[1.25rem] border border-border bg-background p-3",
      )}
    >
      {filters.category ? (
        <input type="hidden" name="category" value={filters.category} />
      ) : null}
      {filters.buyerSector ? (
        <input type="hidden" name="buyerSector" value={filters.buyerSector} />
      ) : null}
      {filters.region ? (
        <input type="hidden" name="region" value={filters.region} />
      ) : null}
      {filters.valueBand ? (
        <input type="hidden" name="valueBand" value={filters.valueBand} />
      ) : null}
      {filters.deadlineBand ? (
        <input type="hidden" name="deadlineBand" value={filters.deadlineBand} />
      ) : null}
      {filters.dealType ? (
        <input type="hidden" name="dealType" value={filters.dealType} />
      ) : null}
      {filters.status ? (
        <input type="hidden" name="status" value={filters.status} />
      ) : null}
      {filters.sort && filters.sort !== "updated" ? (
        <input type="hidden" name="sort" value={filters.sort} />
      ) : null}
      {filters.minScore != null ? (
        <input type="hidden" name="minScore" value={String(filters.minScore)} />
      ) : null}
      <div className="min-w-0 flex-1">
        <DealKeywordFields
          filters={filters}
          idPrefix={isHero ? "hero" : "search"}
          label={isHero ? "Search opportunities" : "Keyword"}
          hint={isHero ? undefined : "Search by products, services, industries or locations."}
          placeholder={
            isHero
              ? "Search products, services, industries or locations"
              : "Search opportunities"
          }
          labelClassName={isHero ? "sr-only" : undefined}
          inputClassName={
            isHero
              ? "h-12 border-0 bg-transparent shadow-none focus-visible:ring-0 md:h-14 md:text-base"
              : undefined
          }
        />
      </div>
      <Button
        type="submit"
        size={isHero ? "lg" : "default"}
        className={isHero ? "h-12 px-6 sm:self-stretch md:h-14" : undefined}
      >
        Search
      </Button>
    </form>
  );
}
