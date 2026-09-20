import type { Metadata } from "next";
import Link from "next/link";

import { CategoryShortcuts } from "@/components/deals/category-shortcuts";
import { DealList } from "@/components/deals/deal-list";
import { HeroSearchForm } from "@/components/deals/hero-search-form";
import { EmptyState } from "@/components/feedback/empty-state";
import { Heading } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { listAlertCentre } from "@/lib/alerts/centre";
import { requireUser } from "@/lib/auth/session";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { searchDealPreviewsForUser } from "@/lib/matching/search";
import { featureLimit, quotaLabel } from "@/lib/quotas";
import { countSavedDeals, countSavedSearches } from "@/lib/saves/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Workspace",
};

export default async function AppHomePage() {
  const { user, profile } = await requireUser("/app");
  const firstName = profile.display_name?.split(" ")[0] ?? "there";
  const entitlement = await getCurrentEntitlement(user.id);
  const client = await createSupabaseServerClient();
  const [savedDeals, savedSearches, alerts, latest, closingSoon] =
    await Promise.all([
      countSavedDeals(client, user.id),
      countSavedSearches(client, user.id),
      listAlertCentre({ userId: user.id, limit: 5 }),
      searchDealPreviewsForUser({
        client,
        searchParams: { limit: "8" },
        userId: user.id,
        defaultSort: "relevance",
      }),
      searchDealPreviewsForUser({
        client,
        searchParams: { status: "CLOSING_SOON", limit: "4" },
        userId: user.id,
        defaultSort: "updated",
      }),
    ]);
  const latestSlugs = new Set(
    latest.result.items.map((item) => item.preview.slug),
  );
  const closingItems = closingSoon.result.items.filter(
    (item) => !latestSlugs.has(item.preview.slug),
  );

  return (
    <Main className="gap-10">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            Welcome, {firstName}
          </p>
          <Heading>Discover opportunities</Heading>
          <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground md:text-base">
            Search and browse live previews first. Source identity stays locked
            until Pro is verified.
          </p>
        </div>
        <HeroSearchForm path="/app/search" />
        <CategoryShortcuts path="/app/search" />
      </div>

      <section className="flex flex-col gap-6" aria-labelledby="workspace-latest-heading">
        <SectionHeader
          id="workspace-latest-heading"
          title="Opportunities for you"
          description="Newest sanitised previews, ranked by your company profile when one is saved."
          action={
            <Button asChild variant="outline">
              <Link href="/app/search">View all opportunities</Link>
            </Button>
          }
        />
        {latest.result.items.length === 0 ? (
          <EmptyState kind="noDealsMatchFilters">
            <Button asChild variant="outline">
              <Link href="/app/search">Open Discover</Link>
            </Button>
          </EmptyState>
        ) : (
          <DealList items={latest.result.items} />
        )}
      </section>

      {closingItems.length > 0 ? (
        <section className="flex flex-col gap-6" aria-labelledby="workspace-closing-heading">
          <SectionHeader
            id="workspace-closing-heading"
            title="Closing soon"
            action={
              <Button asChild variant="outline">
                <Link href="/app/search?status=CLOSING_SOON">View closing soon</Link>
              </Button>
            }
          />
          <DealList items={closingItems} />
        </section>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-3">
        <li className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Saved opportunities</p>
          <p className="mt-2 text-lg font-semibold tabular-nums">
            {quotaLabel(savedDeals, featureLimit(entitlement.plan, "savedDeals"))}
          </p>
        </li>
        <li className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Saved searches</p>
          <p className="mt-2 text-lg font-semibold tabular-nums">
            {quotaLabel(
              savedSearches,
              featureLimit(entitlement.plan, "savedSearches"),
            )}
          </p>
        </li>
        <li className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Unread alerts</p>
          <p className="mt-2 text-lg font-semibold tabular-nums">{alerts.unreadCount}</p>
        </li>
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/app/alerts">Alert centre</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/app/profile">Company profile</Link>
        </Button>
      </div>
    </Main>
  );
}
