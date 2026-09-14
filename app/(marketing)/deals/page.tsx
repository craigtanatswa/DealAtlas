import type { Metadata } from "next";

import { DealKeywordForm } from "@/components/deals/deal-keyword-form";
import {
  DealSearchFilterDrawer,
  DealSearchFilterRail,
} from "@/components/deals/deal-search-filters";
import { DealSearchResults } from "@/components/deals/deal-search-results";
import { Heading, Text } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { publicDealsIndexMetadata } from "@/lib/search/metadata";
import {
  hasActivePublicFilters,
  parsePublicSearchParams,
} from "@/lib/search/params";
import { searchPublicDealPreviewsFromParams } from "@/lib/search/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  return publicDealsIndexMetadata(
    hasActivePublicFilters(parsePublicSearchParams(params)),
  );
}

export default async function DealsIndexPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const client = await createSupabaseServerClient();
  const { filters, result } = await searchPublicDealPreviewsFromParams(
    client,
    params,
  );

  return (
    <Main className="gap-8">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Find deals</p>
        <Heading>Discover sanitised opportunities</Heading>
        <Text variant="muted" className="max-w-3xl">
          Browse useful commercial context without buyer names, source titles,
          or original documents. Unlock those details with DealAtlas Pro.
        </Text>
      </div>
      <div className="sticky top-0 z-20 flex flex-col gap-3 bg-background py-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <DealKeywordForm filters={filters} />
        </div>
        <DealSearchFilterDrawer filters={filters} />
      </div>
      <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <DealSearchFilterRail filters={filters} />
        <DealSearchResults result={result} filters={filters} />
      </div>
    </Main>
  );
}
