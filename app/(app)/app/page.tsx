import type { Metadata } from "next";
import Link from "next/link";

import { Heading } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { listAlertCentre } from "@/lib/alerts/centre";
import { requireUser } from "@/lib/auth/session";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
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
  const [savedDeals, savedSearches, alerts] = await Promise.all([
    countSavedDeals(client, user.id),
    countSavedSearches(client, user.id),
    listAlertCentre({ userId: user.id, limit: 5 }),
  ]);

  return (
    <Main className="gap-8">
      <div className="flex flex-col gap-2">
        <Heading>Welcome, {firstName}</Heading>
        <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground md:text-base">
          Keep matching, saved searches, and alerts running so new opportunities
          are not missed. Source identity stays locked until Pro is verified.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-3">
        <li className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Saved opportunities</p>
          <p className="mt-2 text-lg font-semibold">
            {quotaLabel(savedDeals, featureLimit(entitlement.plan, "savedDeals"))}
          </p>
        </li>
        <li className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Saved searches</p>
          <p className="mt-2 text-lg font-semibold">
            {quotaLabel(
              savedSearches,
              featureLimit(entitlement.plan, "savedSearches"),
            )}
          </p>
        </li>
        <li className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Unread alerts</p>
          <p className="mt-2 text-lg font-semibold">{alerts.unreadCount}</p>
        </li>
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/app/search">Discover</Link>
        </Button>
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
