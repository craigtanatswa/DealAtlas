import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminMetaList, AdminPageHeader, JsonBlock } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { getAdminRun, listAdminErrors, listAdminRawRecords } from "@/lib/admin/load";
import { readAdmin } from "@/lib/admin/page";
import { adminRawRecordPath, adminSourcePath, parseAdminIdParam } from "@/lib/admin/paths";
import { formatDealDateTime } from "@/lib/deals/format";

export const metadata: Metadata = {
  title: "Admin ingestion run",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminIngestionRunPage({ params }: PageProps) {
  const id = parseAdminIdParam((await params).id);
  if (!id) {
    notFound();
  }
  const loaded = await readAdmin(async () => {
    const run = await getAdminRun(id);
    if (!run) {
      return null;
    }
    const [errors, raw] = await Promise.all([
      listAdminErrors({ page: 1, runId: id }),
      listAdminRawRecords({ page: 1, runId: id }),
    ]);
    return { run, errors, raw };
  });
  if (loaded.unavailable) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState title="Run unavailable" description="This ingestion run could not be loaded." />
      </Main>
    );
  }
  if (!loaded.data) {
    notFound();
  }
  const { run, errors, raw } = loaded.data;

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title={`Run ${run.status}`}
        description={`${run.sourceKey ?? run.sourceId} · ${run.triggerType}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={adminSourcePath(run.sourceId)}>Source</Link>
          </Button>
        }
      />
      <AdminMetaList
        items={[
          { label: "Discovered", value: String(run.discoveredCount) },
          { label: "Fetched", value: String(run.fetchedCount) },
          { label: "New", value: String(run.newCount) },
          { label: "Updated", value: String(run.updatedCount) },
          { label: "Unchanged", value: String(run.unchangedCount) },
          { label: "Errors", value: String(run.errorCount) },
          { label: "Started", value: formatDealDateTime(run.startedAt) ?? "—" },
          { label: "Finished", value: formatDealDateTime(run.finishedAt) ?? "—" },
        ]}
      />
      <JsonBlock label="Run metadata" value={JSON.stringify(run.metadata, null, 2)} />
      <section>
        <h2 className="mb-3 text-lg font-semibold">Raw records</h2>
        {raw.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No raw records linked to this run.</p>
        ) : (
          <ul className="grid gap-2">
            {raw.rows.map((record) => (
              <li key={record.id}>
                <Link className="text-sm hover:underline" href={adminRawRecordPath(record.id)}>
                  {record.externalRecordId}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Errors</h2>
        {errors.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No errors on this run.</p>
        ) : (
          <ul className="grid gap-2">
            {errors.rows.map((item) => (
              <li key={item.id} className="text-sm">
                {item.errorStage}: {item.message}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Main>
  );
}
