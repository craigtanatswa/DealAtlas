import type { Metadata } from "next";

import { IntelligencePaywall } from "@/components/intelligence/paywall";
import { ContractList } from "@/components/intelligence/lists";
import { SimplePagination } from "@/components/intelligence/simple-pagination";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Main } from "@/components/layout/container";
import { readIntelligence, requireProIntelligence } from "@/lib/intelligence/page";
import { listContractIntelligence } from "@/lib/intelligence/protected";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contracts",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ContractsPage({ searchParams }: PageProps) {
  const gate = await requireProIntelligence("/app/contracts");
  if (gate.kind === "paywall") {
    return (
      <IntelligencePaywall
        title="Contracts"
        description="Contract start, end, extension, payment, and performance records are Pro-only."
        returnTo="/app/contracts"
      />
    );
  }

  const params = await searchParams;
  const pageValue = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Number(pageValue || "1");
  const loaded = await readIntelligence(() =>
    listContractIntelligence(gate.access, {
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

  const list = loaded.data;
  return (
    <Main className="gap-8">
      <PageHeader
        title="Contracts"
        description="Dates and values come from recorded contract rows. Missing payment or performance data is left blank rather than estimated."
      />
      {list.items.length === 0 ? (
        <EmptyState
          title="No contracts recorded"
          description="Contract intelligence appears after award and contract notices are ingested."
        />
      ) : (
        <ContractList contracts={list.items} empty="No contracts recorded." />
      )}
      <SimplePagination
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        noun="contract"
        hrefForPage={(nextPage) =>
          nextPage > 1 ? `/app/contracts?page=${nextPage}` : "/app/contracts"
        }
      />
    </Main>
  );
}
