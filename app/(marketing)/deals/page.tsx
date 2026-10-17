import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DealKeywordForm } from "@/components/deals/deal-keyword-form";
import { DealSortForm } from "@/components/deals/deal-sort-form";
import {
  DealActiveFilters,
  DealSearchFilterDrawer,
  DealSearchFilterRail,
} from "@/components/deals/deal-search-filters";
import { DealSearchResults } from "@/components/deals/deal-search-results";
import { PageHeader } from "@/components/layout/page-header";
import { Main } from "@/components/layout/container";
import { getAuthUser } from "@/lib/auth/session";
import { searchDealPreviewsForUser } from "@/lib/matching/search";
import { getAppOrigin } from "@/lib/auth/urls";
import {
  hasActivePublicFilters,
  parsePublicSearchParams,
  searchHref,
} from "@/lib/search/params";
import { publicDealsIndexMetadata } from "@/lib/search/metadata";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const filters = parsePublicSearchParams(params);
  const origin = getAppOrigin();
  return publicDealsIndexMetadata({
    hasFilters: hasActivePublicFilters(filters),
    page: filters.page,
    canonicalUrl: `${origin}/deals`,
  });
}

export default async function DealsIndexPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const client = await createSupabaseServerClient();
  const user = await getAuthUser();
  const { filters, result, companyProfileId } = await searchDealPreviewsForUser({
    client,
    searchParams: params,
    userId: user?.id,
    defaultSort: "biddable",
  });

  const lastPage = Math.max(1, Math.ceil(result.total / filters.limit));
  if (result.total > 0 && filters.page > lastPage) {
    redirect(searchHref(filters, lastPage, "/deals"));
  }

  return (
    <Main className="gap-8">
      <PageHeader
        title="Discover opportunities"
        description="Browse contracts, supply requests and deals. Join DealAtlas Pro to unlock buyer identity, original notices, and how to apply."
      />
      <div className="sticky top-16 z-20 flex flex-col gap-3 border-b border-border bg-background py-3">
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <DealKeywordForm filters={filters} />
          </div>
          <DealSortForm filters={filters} />
        </div>
        <DealSearchFilterDrawer
          filters={filters}
          showRelevance={Boolean(companyProfileId)}
          publicStatus
        />
      </div>
      <DealActiveFilters filters={filters} />
      <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <DealSearchFilterRail
          filters={filters}
          showRelevance={Boolean(companyProfileId)}
          publicStatus
        />
        <DealSearchResults
          result={result}
          filters={filters}
          publicSearch
          signedIn={Boolean(user)}
        />
      </div>
    </Main>
  );
}
