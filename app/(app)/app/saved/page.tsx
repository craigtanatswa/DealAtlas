import type { Metadata } from "next";
import Link from "next/link";

import { SavedDealList } from "@/components/saves/saved-deal-list";
import { ExportDealsButton } from "@/components/exports/export-deals-button";
import { EmptyState } from "@/components/feedback/empty-state";
import { Heading, Text } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { isProEntitlement } from "@/lib/entitlements/policy";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { loadExportUsageForMonth } from "@/lib/exports/usage";
import { featureLimit, quotaLabel } from "@/lib/quotas";
import { listSavedDeals } from "@/lib/saves/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved",
  robots: { index: false, follow: false },
};

export default async function SavedPage() {
  const { user } = await requireUser("/app/saved");
  const entitlement = await getCurrentEntitlement(user.id);
  const isPro = isProEntitlement(entitlement);
  const client = await createSupabaseServerClient();
  const items = await listSavedDeals(client, user.id);
  const limit = featureLimit(entitlement.plan, "savedDeals");
  const exportUsage = isPro
    ? await loadExportUsageForMonth(user.id)
    : { used: 0 };

  return (
    <Main className="gap-8">
      <div className="flex flex-col gap-2">
        <Heading>Saved opportunities</Heading>
        <Text variant="muted" className="max-w-3xl">
          Free accounts can save 5 sanitised previews. Saved items never include
          source identity until a verified Pro subscription unlocks the Deal.
        </Text>
        <p className="text-sm text-muted-foreground">
          {quotaLabel(items.length, limit)}
        </p>
        {items.length > 0 ? (
          <ExportDealsButton
            source="saved"
            isPro={isPro}
            used={exportUsage.used}
            limit={featureLimit(entitlement.plan, "exportRowsPerMonth")}
          />
        ) : null}
      </div>
      {items.length === 0 ? (
        <EmptyState
          title="No saved opportunities yet"
          description="Save a sanitised preview from search or a Deal page. Free accounts can keep 5."
        >
          <Button asChild>
            <Link href="/app/search">Find opportunities</Link>
          </Button>
        </EmptyState>
      ) : (
        <SavedDealList items={items} />
      )}
    </Main>
  );
}
