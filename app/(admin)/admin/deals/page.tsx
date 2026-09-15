import type { Metadata } from "next";
import Link from "next/link";

import { AdminPageHeader, LeakageBadge } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/feedback/empty-state";
import { SimplePagination } from "@/components/intelligence/simple-pagination";
import { Main } from "@/components/layout/container";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAdminDeals } from "@/lib/admin/load";
import { readAdmin } from "@/lib/admin/page";
import { adminDealPath, firstSearchParam, parseAdminPage } from "@/lib/admin/paths";
import { formatDealDateTime } from "@/lib/deals/format";

export const metadata: Metadata = {
  title: "Admin deals",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminDealsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = firstSearchParam(params.q).trim();
  const unpublishedOnly = firstSearchParam(params.unpublished) === "1";
  const page = parseAdminPage(params.page);
  const loaded = await readAdmin(() =>
    listAdminDeals({ page, query, unpublishedOnly }),
  );
  if (loaded.unavailable || !loaded.data) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState title="Deals unavailable" description="Canonical deals could not be loaded." />
      </Main>
    );
  }

  const list = loaded.data;

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title="Canonical deals"
        description="Inspect source-bearing deals, compare sanitised previews, and hold risky previews unpublished."
      />
      <form className="flex flex-wrap gap-2" method="get">
        <Input name="q" defaultValue={query} placeholder="Search source title" className="max-w-sm" />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="unpublished" value="1" defaultChecked={unpublishedOnly} />
          Unpublished only
        </label>
        <button className="text-sm text-primary hover:underline" type="submit">
          Filter
        </button>
      </form>
      {list.rows.length === 0 ? (
        <EmptyState
          title="No deals match"
          description="Ingested canonical deals will appear here for inspection."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>Preview</TableHead>
              <TableHead>Verified</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.rows.map((deal) => (
              <TableRow key={deal.id}>
                <TableCell>
                  <Link className="hover:underline" href={adminDealPath(deal.id)}>
                    {deal.sourceTitle}
                  </Link>
                  <p className="text-[0.8125rem] text-muted-foreground">{deal.sourceKey}</p>
                </TableCell>
                <TableCell>{deal.buyerName ?? "—"}</TableCell>
                <TableCell>
                  <LeakageBadge
                    risk={deal.leakageRisk}
                    published={deal.isPublished}
                    held={deal.unpublishedByAdmin}
                  />
                </TableCell>
                <TableCell>{formatDealDateTime(deal.lastVerifiedAt) ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <SimplePagination
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        hrefForPage={(next) => {
          const nextParams = new URLSearchParams();
          if (query) nextParams.set("q", query);
          if (unpublishedOnly) nextParams.set("unpublished", "1");
          nextParams.set("page", String(next));
          return `/admin/deals?${nextParams.toString()}`;
        }}
        noun="deal"
      />
    </Main>
  );
}
