import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DealSortForm } from "@/components/deals/deal-sort-form";
import { DealSearchPanel } from "@/components/deals/deal-search-filters";
import { DealSearchResults } from "@/components/deals/deal-search-results";
import { PageHeader } from "@/components/layout/page-header";
import { Main } from "@/components/layout/container";
import { getAuthUser } from "@/lib/auth/session";
import { searchDealPreviewsForUser } from "@/lib/matching/search";
import { getAppOrigin } from "@/lib/auth/urls";
import {
  hasActivePublicFilters,
  isPublicDealsPageOutOfRange,
  parsePublicSearchParams,
  PUBLIC_DEALS_PAGE_SIZE,
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
  const requestedPage = parsePublicSearchParams(params).page;
  const client = await createSupabaseServerClient();
  const user = await getAuthUser();
  const { filters, result, matchEnabled } = await searchDealPreviewsForUser({
    client,
    searchParams: params,
    userId: user?.id,
    defaultSort: "biddable",
    pageSize: PUBLIC_DEALS_PAGE_SIZE,
  });
  const showRelevance = matchEnabled;

  if (isPublicDealsPageOutOfRange(requestedPage, result.total, filters.limit)) {
    notFound();
  }

  return (
    <Main back className="gap-8">
      <PageHeader
        title="Discover opportunities"
        description="Browse contracts, supply requests and deals. Join DealAtlas Pro to unlock buyer identity, original notices, and how to apply."
      />
      <DealSearchPanel
        filters={filters}
        showRelevance={showRelevance}
        publicStatus
      />
      <DealSearchResults
        result={result}
        filters={filters}
        publicSearch
        signedIn={Boolean(user)}
        sort={<DealSortForm filters={filters} showRelevance={showRelevance} />}
      />
    </Main>
  );
}
