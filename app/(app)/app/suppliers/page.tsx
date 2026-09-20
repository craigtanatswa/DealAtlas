import type { Metadata } from "next";

import { IntelligencePaywall } from "@/components/intelligence/paywall";
import { OrganizationDirectory } from "@/components/intelligence/org-directory";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Main } from "@/components/layout/container";
import { appSupplierPath } from "@/lib/intelligence/paths";
import { readIntelligence, requireProIntelligence } from "@/lib/intelligence/page";
import { listSupplierDirectory } from "@/lib/intelligence/protected";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Suppliers",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function SuppliersIndexPage({ searchParams }: PageProps) {
  const gate = await requireProIntelligence("/app/suppliers");
  if (gate.kind === "paywall") {
    return (
      <IntelligencePaywall
        title="Suppliers"
        description="Join DealAtlas Pro to unlock the supplier directory."
        returnTo="/app/suppliers"
      />
    );
  }

  const params = await searchParams;
  const query = firstParam(params.q).trim();
  const page = Number(firstParam(params.page) || "1");
  const loaded = await readIntelligence(() =>
    listSupplierDirectory(gate.access, {
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
        title="Suppliers"
        description="Organisations appear here only when they are named on a recorded award."
      />
      <OrganizationDirectory
        list={loaded.data}
        path="/app/suppliers"
        itemHref={appSupplierPath}
        query={query}
        emptyTitle="No suppliers match this search"
        emptyDescription="Supplier pages stay empty until canonical awards name a winning organisation."
      />
    </Main>
  );
}
