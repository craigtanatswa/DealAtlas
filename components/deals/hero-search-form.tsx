import Link from "next/link";

import { DealKeywordForm } from "@/components/deals/deal-keyword-form";
import type { PublicSearchFilters } from "@/lib/search/params";

export const HOME_SEARCH_EXAMPLES = [
  "office furniture",
  "cybersecurity",
  "construction",
  "medical equipment",
  "vehicle maintenance",
  "maize seed",
] as const;

const EMPTY_FILTERS: PublicSearchFilters = {
  page: 1,
  limit: 20,
};

export function HeroSearchForm({
  path = "/deals",
}: {
  path?: string;
}) {
  return (
    <div className="flex w-full flex-col gap-4">
      <DealKeywordForm filters={EMPTY_FILTERS} path={path} variant="hero" />
      <p className="text-sm text-muted-foreground">
        Try{" "}
        {HOME_SEARCH_EXAMPLES.map((example, index) => (
          <span key={example}>
            <Link
              href={`${path}?q=${encodeURIComponent(example)}`}
              className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:rounded-sm focus-visible:outline-none"
            >
              {example}
            </Link>
            {index < HOME_SEARCH_EXAMPLES.length - 1 ? ", " : "."}
          </span>
        ))}
      </p>
    </div>
  );
}
