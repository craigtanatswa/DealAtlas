import type { Metadata } from "next";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/feedback/empty-state";
import { SimplePagination } from "@/components/intelligence/simple-pagination";
import { Main } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAdminErrors, listAdminRuns } from "@/lib/admin/load";
import { readAdmin } from "@/lib/admin/page";
import { adminIngestionRunPath, adminRawRecordPath, parseAdminPage } from "@/lib/admin/paths";
import { formatDealDateTime } from "@/lib/deals/format";

export const metadata: Metadata = {
  title: "Admin ingestion",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminIngestionPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parseAdminPage(params.page);
  const loaded = await readAdmin(async () => {
    const [runs, errors] = await Promise.all([
      listAdminRuns({ page }),
      listAdminErrors({ page }),
    ]);
    return { runs, errors };
  });
  if (loaded.unavailable || !loaded.data) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState
          title="Ingestion data is unavailable"
          description="Runs and errors could not be loaded."
        />
      </Main>
    );
  }

  const { runs, errors } = loaded.data;

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title="Ingestion"
        description="Inspect runs, parser errors, and raw source records used to build canonical deals and sanitised previews."
      />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Runs</h2>
        {runs.rows.length === 0 ? (
          <EmptyState title="No runs" description="No ingestion runs have been recorded yet." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>New / updated / errors</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.rows.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <Link className="hover:underline" href={adminIngestionRunPath(run.id)}>
                      {run.sourceKey ?? run.sourceId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={run.status === "FAILED" ? "destructive" : "outline"}>
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{run.triggerType}</TableCell>
                  <TableCell>
                    {run.newCount} / {run.updatedCount} / {run.errorCount}
                  </TableCell>
                  <TableCell>{formatDealDateTime(run.startedAt) ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <SimplePagination
          page={runs.page}
          pageSize={runs.pageSize}
          total={runs.total}
          hrefForPage={(next) => `/admin/ingestion?page=${next}`}
          noun="run"
        />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Errors</h2>
        {errors.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ingestion errors recorded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Raw record</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errors.rows.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Badge variant="outline">{item.errorStage}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xl whitespace-normal">{item.message}</TableCell>
                  <TableCell>
                    {item.rawRecordId ? (
                      <Link className="hover:underline" href={adminRawRecordPath(item.rawRecordId)}>
                        Inspect
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{formatDealDateTime(item.createdAt) ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </Main>
  );
}
