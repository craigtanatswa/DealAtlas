import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminMetaList, AdminPageHeader } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { runSourceIngestionAction, setSourceEnabledAction } from "@/lib/admin/actions";
import { getAdminSource, listAdminErrors, listAdminRuns } from "@/lib/admin/load";
import { readAdmin } from "@/lib/admin/page";
import { parseAdminIdParam } from "@/lib/admin/paths";
import { formatDealDateTime } from "@/lib/deals/format";

export const metadata: Metadata = {
  title: "Admin source",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminSourceDetailPage({ params }: PageProps) {
  const id = parseAdminIdParam((await params).id);
  if (!id) {
    notFound();
  }
  const loaded = await readAdmin(async () => {
    const source = await getAdminSource(id);
    if (!source) {
      return null;
    }
    const [runs, errors] = await Promise.all([
      listAdminRuns({ page: 1, sourceId: id }),
      listAdminErrors({ page: 1, sourceId: id }),
    ]);
    return { source, runs, errors };
  });
  if (loaded.unavailable) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState title="Source unavailable" description="This source could not be loaded." />
      </Main>
    );
  }
  if (!loaded.data) {
    notFound();
  }
  const { source, runs, errors } = loaded.data;

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title={source.name}
        description={`${source.sourceKey} · ${source.sourceType}. Enablement respects the database compliance trigger.`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/sources">All sources</Link>
          </Button>
        }
      />
      <AdminMetaList
        items={[
          { label: "Reuse status", value: source.reuseStatus },
          { label: "Access method", value: source.accessMethod },
          {
            label: "Enabled",
            value: source.enabled ? "Yes" : "No",
          },
          { label: "Scraping permitted", value: source.scrapingPermitted ? "Yes" : "No" },
          { label: "Licence", value: source.licenceName ?? source.licenceUrl ?? "—" },
          { label: "Terms", value: source.termsUrl ?? "—" },
          { label: "API URL", value: source.apiUrl ?? "—" },
          { label: "Schedule", value: source.scheduleExpression ?? "—" },
          { label: "Robots checked", value: formatDealDateTime(source.robotsCheckedAt) ?? "—" },
          { label: "Terms checked", value: formatDealDateTime(source.termsCheckedAt) ?? "—" },
          { label: "Last success", value: formatDealDateTime(source.lastSuccessAt) ?? "—" },
          { label: "Consecutive failures", value: String(source.consecutiveFailures) },
        ]}
      />
      {source.complianceNotes ? (
        <p className="max-w-3xl text-sm text-muted-foreground">{source.complianceNotes}</p>
      ) : null}
      {source.enableBlockedReason ? (
        <p className="text-sm text-destructive">{source.enableBlockedReason}</p>
      ) : null}
      {source.ingestionBlockedReason && source.enabled ? (
        <p className="text-sm text-muted-foreground">{source.ingestionBlockedReason}</p>
      ) : null}
      <div className="flex flex-wrap gap-6">
        <AdminActionForm
          action={setSourceEnabledAction}
          submitLabel={source.enabled ? "Disable source" : "Enable source"}
          variant={source.enabled ? "destructive" : "default"}
        >
          <input type="hidden" name="sourceId" value={source.id} />
          <input type="hidden" name="enabled" value={source.enabled ? "false" : "true"} />
        </AdminActionForm>
        <AdminActionForm
          action={runSourceIngestionAction}
          submitLabel="Run limited ingestion"
          pendingLabel="Ingesting…"
        >
          <input type="hidden" name="sourceId" value={source.id} />
        </AdminActionForm>
      </div>
      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Recent runs</h2>
          {runs.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs recorded.</p>
          ) : (
            <ul className="grid gap-2">
              {runs.rows.map((run) => (
                <li key={run.id}>
                  <Link className="text-sm hover:underline" href={`/admin/ingestion/runs/${run.id}`}>
                    {run.status} · {run.triggerType} · {formatDealDateTime(run.createdAt)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">Recent errors</h2>
          {errors.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No errors recorded.</p>
          ) : (
            <ul className="grid gap-2">
              {errors.rows.map((item) => (
                <li key={item.id} className="text-sm">
                  <Badge variant="outline">{item.errorStage}</Badge> {item.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </Main>
  );
}
