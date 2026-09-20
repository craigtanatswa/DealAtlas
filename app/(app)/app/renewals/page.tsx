import type { Metadata } from "next";

import { IntelligencePaywall } from "@/components/intelligence/paywall";
import { RenewalList } from "@/components/intelligence/lists";
import { SimplePagination } from "@/components/intelligence/simple-pagination";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Main } from "@/components/layout/container";
import { readIntelligence, requireProIntelligence } from "@/lib/intelligence/page";
import { listRenewalIntelligence } from "@/lib/intelligence/protected";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Renewals",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RenewalsPage({ searchParams }: PageProps) {
  const gate = await requireProIntelligence("/app/renewals");
  if (gate.kind === "paywall") {
    return (
      <IntelligencePaywall
        title="Renewals"
        description="Join DealAtlas Pro to unlock upcoming renewal windows."
        returnTo="/app/renewals"
      />
    );
  }

  const params = await searchParams;
  const pageValue = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Number(pageValue || "1");
  const loaded = await readIntelligence(() =>
    listRenewalIntelligence(gate.access, {
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
        title="Renewals"
        description="Upcoming opportunities are ranked from recorded contract ends, extensions, source estimated renewal dates, next procurement dates, and renewal notices. Inferred dates are labelled DealAtlas analysis. DealAtlas does not invent expiry dates from contract duration."
      />
      <RenewalList
        items={list.items}
        empty="No evidenced renewal window falls in the current look-ahead. Dates appear after contracts or source renewal fields are ingested."
      />
      <SimplePagination
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        noun="renewal"
        hrefForPage={(nextPage) =>
          nextPage > 1 ? `/app/renewals?page=${nextPage}` : "/app/renewals"
        }
      />
    </Main>
  );
}
