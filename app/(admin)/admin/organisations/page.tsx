import type { Metadata } from "next";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/admin-ui";
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
import { listAdminOrganisations } from "@/lib/admin/load";
import { readAdmin } from "@/lib/admin/page";
import { adminOrganisationPath, firstSearchParam, parseAdminPage } from "@/lib/admin/paths";

export const metadata: Metadata = {
  title: "Admin organisations",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminOrganisationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = firstSearchParam(params.q).trim();
  const page = parseAdminPage(params.page);
  const loaded = await readAdmin(() => listAdminOrganisations({ page, query }));
  if (loaded.unavailable || !loaded.data) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState
          title="Organisations unavailable"
          description="Canonical organisations could not be loaded."
        />
      </Main>
    );
  }

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title="Organisations"
        description="Inspect canonical buyers and suppliers. Use deduplication to merge review candidates that ingestion would not auto-merge."
      />
      <form className="flex flex-wrap gap-2" method="get">
        <Input name="q" defaultValue={query} placeholder="Search name" className="max-w-sm" />
        <button className="text-sm text-primary hover:underline" type="submit">
          Search
        </button>
      </form>
      {loaded.data.rows.length === 0 ? (
        <EmptyState title="No organisations" description="Ingested organisations will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loaded.data.rows.map((org) => (
              <TableRow key={org.id}>
                <TableCell>
                  <Link className="hover:underline" href={adminOrganisationPath(org.id)}>
                    {org.canonicalName}
                  </Link>
                </TableCell>
                <TableCell>{org.domain ?? "—"}</TableCell>
                <TableCell>{[org.city, org.region].filter(Boolean).join(", ") || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <SimplePagination
        page={loaded.data.page}
        pageSize={loaded.data.pageSize}
        total={loaded.data.total}
        hrefForPage={(next) => {
          const nextParams = new URLSearchParams();
          if (query) nextParams.set("q", query);
          nextParams.set("page", String(next));
          return `/admin/organisations?${nextParams.toString()}`;
        }}
        noun="organisation"
      />
    </Main>
  );
}
