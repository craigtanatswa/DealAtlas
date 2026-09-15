import type { Metadata } from "next";
import Link from "next/link";

import { SavedSearchList } from "@/components/saves/saved-search-list";
import { EmptyState } from "@/components/feedback/empty-state";
import { Heading, Text } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { isEmailVerified, requireUser } from "@/lib/auth/session";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { featureLimit, quotaLabel } from "@/lib/quotas";
import { listSavedSearches } from "@/lib/saves/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved searches",
  robots: { index: false, follow: false },
};

export default async function SearchesPage() {
  const { user } = await requireUser("/app/searches");
  const entitlement = await getCurrentEntitlement(user.id);
  const client = await createSupabaseServerClient();
  const searches = await listSavedSearches(client, user.id);
  const limit = featureLimit(entitlement.plan, "savedSearches");
  const verified = isEmailVerified(user);

  return (
    <Main className="gap-8">
      <div className="flex flex-col gap-2">
        <Heading>Saved searches</Heading>
        <Text variant="muted" className="max-w-3xl">
          Free accounts can save one search. Pro accounts can save 50. Alerts
          from saved searches never reveal source identity on Free.
        </Text>
        <p className="text-sm text-muted-foreground">
          {quotaLabel(searches.length, limit)}
        </p>
      </div>
      {!verified ? (
        <EmptyState
          title="Confirm your email"
          description="Saved searches and alerts require a verified email address."
        >
          <Button asChild>
            <Link href="/verify-email">Verify email</Link>
          </Button>
        </EmptyState>
      ) : searches.length === 0 ? (
        <EmptyState
          title="No saved searches yet"
          description="Save a filter set from Discover. Free accounts can keep one saved search; Pro accounts can keep 50."
        >
          <Button asChild>
            <Link href="/app/search">Open Discover</Link>
          </Button>
        </EmptyState>
      ) : (
        <SavedSearchList searches={searches} />
      )}
    </Main>
  );
}
