"use client";

import { DealSortSelect } from "@/components/deals/deal-search-fields";
import type { PublicSearchFilters } from "@/lib/search/params";

export function DealSortForm({
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
      className="w-full sm:w-auto"
      onChange={(event) => event.currentTarget.requestSubmit()}
    >
      {filters.query ? <input type="hidden" name="q" value={filters.query} /> : null}
      {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
      {filters.buyerSector ? (
        <input type="hidden" name="buyerSector" value={filters.buyerSector} />
      ) : null}
      {filters.region ? <input type="hidden" name="region" value={filters.region} /> : null}
      {filters.valueBand ? <input type="hidden" name="valueBand" value={filters.valueBand} /> : null}
      {filters.deadlineBand ? (
        <input type="hidden" name="deadlineBand" value={filters.deadlineBand} />
      ) : null}
      {filters.dealType ? <input type="hidden" name="dealType" value={filters.dealType} /> : null}
      {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
      <DealSortSelect filters={filters} idPrefix="deals-sort" />
    </form>
  );
}
