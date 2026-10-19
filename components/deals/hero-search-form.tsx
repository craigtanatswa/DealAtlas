import Link from "next/link";

import { DealKeywordForm } from "@/components/deals/deal-keyword-form";
import type { PublicSearchFilters } from "@/lib/search/params";

import type { HomeSearchChip } from "@/lib/search/home-chips";
import { HOME_SEARCH_EXAMPLES } from "@/lib/search/home-search-examples";

export { HOME_SEARCH_EXAMPLES };

const EMPTY_FILTERS: PublicSearchFilters = {
  page: 1,
  limit: 20,
};

export function HeroSearchForm({
  path = "/deals",
  examples,
}: {
  path?: string;
  /** Live chips picked server-side (homepage). Omit for the curated static terms. */
  examples?: HomeSearchChip[];
}) {
  const chips =
    examples ??
    HOME_SEARCH_EXAMPLES.map((term) => ({
      label: term,
      href: `${path}?q=${encodeURIComponent(term)}`,
    }));
  return (
    <div className="flex w-full flex-col gap-4">
      <DealKeywordForm filters={EMPTY_FILTERS} path={path} variant="hero" />
      {chips.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Try{" "}
          {chips.map((chip, index) => (
            <span key={chip.href}>
              <Link
                href={chip.href}
                className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:rounded-sm focus-visible:outline-none"
              >
                {chip.label}
              </Link>
              {index < chips.length - 1 ? ", " : "."}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
