import type { Metadata } from "next";
import Link from "next/link";

import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminPageHeader, LeakageBadge } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  holdPreviewUnpublishedAction,
  retryDocumentJobAction,
  retryMatchJobAction,
} from "@/lib/admin/actions";
import { listFailedJobs, listStaleDeals, listUnpublishedPreviews } from "@/lib/admin/load";
import { readAdmin } from "@/lib/admin/page";
import { adminDealPath, parseAdminPage } from "@/lib/admin/paths";
import { formatDealDateTime } from "@/lib/deals/format";

export const metadata: Metadata = {
  title: "Admin data quality",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminDataQualityPage({ searchParams }: PageProps) {
  const page = parseAdminPage((await searchParams).page);
  const loaded = await readAdmin(async () => {
    const [stale, unpublished, jobs] = await Promise.all([
      listStaleDeals(page),
      listUnpublishedPreviews(page),
      listFailedJobs(),
    ]);
    return { stale, unpublished, jobs };
  });
  if (loaded.unavailable || !loaded.data) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState
          title="Data quality unavailable"
          description="Stale records and failed jobs could not be loaded."
        />
      </Main>
    );
  }
  const { stale, unpublished, jobs } = loaded.data;

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title="Data quality"
        description="Unpublished leak reviews, stale open deals, failed document processing, and failed intelligence match jobs."
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Unpublished previews</h2>
        {unpublished.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No unpublished previews.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Preview</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Hold</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unpublished.rows.map((preview) => (
                <TableRow key={preview.dealId}>
                  <TableCell>
                    <Link className="hover:underline" href={adminDealPath(preview.dealId)}>
                      {preview.previewTitle}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <LeakageBadge
                      risk={preview.leakageRisk}
                      published={preview.isPublished}
                      held={preview.unpublishedByAdmin}
                    />
                  </TableCell>
                  <TableCell>
                    <AdminActionForm
                      action={holdPreviewUnpublishedAction}
                      submitLabel="Keep unpublished"
                      variant="destructive"
                    >
                      <input type="hidden" name="dealId" value={preview.dealId} />
                    </AdminActionForm>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Stale open deals</h2>
        {stale.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stale open deals.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal</TableHead>
                <TableHead>Last verified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stale.rows.map((deal) => (
                <TableRow key={deal.id}>
                  <TableCell>
                    <Link className="hover:underline" href={adminDealPath(deal.id)}>
                      {deal.sourceTitle}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDealDateTime(deal.lastVerifiedAt) ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Failed jobs</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No failed document or match jobs.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Retry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={`${job.kind}-${job.id}`}>
                  <TableCell>
                    {job.dealId ? (
                      <Link className="hover:underline" href={adminDealPath(job.dealId)}>
                        {job.label}
                      </Link>
                    ) : (
                      job.label
                    )}
                  </TableCell>
                  <TableCell>{job.status}</TableCell>
                  <TableCell className="max-w-md whitespace-normal">
                    {job.errorMessage ?? "—"}
                  </TableCell>
                  <TableCell>
                    {job.kind === "match" ? (
                      <AdminActionForm action={retryMatchJobAction} submitLabel="Retry match">
                        <input type="hidden" name="jobId" value={job.id} />
                      </AdminActionForm>
                    ) : (
                      <AdminActionForm action={retryDocumentJobAction} submitLabel="Retry document">
                        <input type="hidden" name="documentId" value={job.id} />
                      </AdminActionForm>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </Main>
  );
}
