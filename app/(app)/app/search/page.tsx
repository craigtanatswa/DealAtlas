import Link from "next/link";
import type { Metadata } from "next";

import { SaveSearchForm } from "@/components/saves/save-search-form";
import { ExportDealsButton } from "@/components/exports/export-deals-button";
import { DealKeywordForm } from "@/components/deals/deal-keyword-form";
import {
  DealActiveFilters,
  DealSearchFilterDrawer,
  DealSearchFilterRail,
} from "@/components/deals/deal-search-filters";
import { DealSearchResults } from "@/components/deals/deal-search-results";
import { PageHeader } from "@/components/layout/page-header";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { requireUser, isEmailVerified } from "@/lib/auth/session";
import { isProEntitlement } from "@/lib/entitlements/policy";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { loadExportUsageForMonth } from "@/lib/exports/usage";
import { featureLimit } from "@/lib/quotas";
import { countSavedSearches } from "@/lib/saves/queries";
import { searchDealPreviewsForUser } from "@/lib/matching/search";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AppSearchPage({ searchParams }: PageProps) {
  const { user } = await requireUser("/app/search");
  const params = await searchParams;
  const client = await createSupabaseServerClient();
  const entitlement = await getCurrentEntitlement(user.id);
  const isPro = isProEntitlement(entitlement);
  const exportUsage = isPro
    ? await loadExportUsageForMonth(user.id)
    : { used: 0 };
  const savedSearchCount = await countSavedSearches(client, user.id);
  const { filters, result, companyProfileId } = await searchDealPreviewsForUser({
    client,
    searchParams: params,
    userId: user.id,
    defaultSort: "relevance",
  });

  return (
    <Main className="gap-8">
      <PageHeader
        eyebrow="Discover"
        title="Search matching opportunities"
        description="Signed-in search still uses sanitised previews. Relevance scores come from your company profile and never include buyer or source identity."
        actions={
          !companyProfileId ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/app/profile">Add company profile</Link>
            </Button>
          ) : undefined
        }
      />
      {!companyProfileId ? (
        <p className="text-sm text-muted-foreground">
          Save a company profile to sort and filter by relevance.
        </p>
      ) : null}
      <div className="sticky top-16 z-20 flex flex-col gap-3 border-b border-border bg-background py-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <DealKeywordForm filters={filters} path="/app/search" />
        </div>
        <DealSearchFilterDrawer
          filters={filters}
          path="/app/search"
          showRelevance={Boolean(companyProfileId)}
        />
      </div>
      <DealActiveFilters filters={filters} path="/app/search" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SaveSearchForm
          filters={filters}
          used={savedSearchCount}
          limit={featureLimit(entitlement.plan, "savedSearches")}
          emailVerified={isEmailVerified(user)}
        />
        <ExportDealsButton
          source="filters"
          filters={filters}
          isPro={isPro}
          used={exportUsage.used}
          limit={featureLimit(entitlement.plan, "exportRowsPerMonth")}
        />
      </div>
      <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <DealSearchFilterRail
          filters={filters}
          path="/app/search"
          showRelevance={Boolean(companyProfileId)}
        />
        <DealSearchResults
          result={result}
          filters={filters}
          path="/app/search"
        />
      </div>
    </Main>
  );
}
