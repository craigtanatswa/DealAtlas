import { DealKeywordFields } from "@/components/deals/deal-search-fields";
import { Button } from "@/components/ui/button";
import type { PublicSearchFilters } from "@/lib/search/params";

export function DealKeywordForm({
  filters,
  path = "/deals",
}: {
  filters: PublicSearchFilters;
  path?: string;
}) {
  return (
    <form
      method="get"
      action={path}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-end"
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
        <DealKeywordFields filters={filters} idPrefix="search" />
      </div>
      <Button type="submit">Search</Button>
    </form>
  );
}
