import type { Metadata } from "next";

import { IntelligencePaywall } from "@/components/intelligence/paywall";
import { OrganizationDirectory } from "@/components/intelligence/org-directory";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Main } from "@/components/layout/container";
import { appBuyerPath } from "@/lib/intelligence/paths";
import { readIntelligence, requireProIntelligence } from "@/lib/intelligence/page";
import { listBuyerDirectory } from "@/lib/intelligence/protected";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buyers",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function BuyersIndexPage({ searchParams }: PageProps) {
  const gate = await requireProIntelligence("/app/buyers");
  if (gate.kind === "paywall") {
    return (
      <IntelligencePaywall
        title="Buyers"
        description="The buyer directory is Pro-only. Free accounts cannot enumerate organisation identity."
        returnTo="/app/buyers"
      />
    );
  }

  const params = await searchParams;
  const query = firstParam(params.q).trim();
  const page = Number(firstParam(params.page) || "1");
  const loaded = await readIntelligence(() =>
    listBuyerDirectory(gate.access, {
      query,
      page: Number.isFinite(page) ? page : 1,
    }),
  );
  if (loaded.unavailable || !loaded.data) {
    return (
      <Main>
        <EmptyState kind="paidDataUnavailable" />
      </Main>
    );
  }

  return (
    <Main className="gap-8">
      <PageHeader
        title="Buyers"
        description="Organisations appear here only when DealAtlas has recorded them as a buyer on a canonical opportunity."
      />
      <OrganizationDirectory
        list={loaded.data}
        path="/app/buyers"
        itemHref={appBuyerPath}
        query={query}
        emptyTitle="No buyers match this search"
        emptyDescription="Buyer pages stay empty until canonical procurement names a buying organisation."
      />
    </Main>
  );
}
