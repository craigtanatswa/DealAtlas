import type { Metadata } from "next";
import Link from "next/link";

import { AdminPageHeader, AdminStatCard, LeakageBadge } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadAdminDashboard } from "@/lib/admin/load";
import { readAdmin } from "@/lib/admin/page";
import { adminDealPath, adminIngestionRunPath } from "@/lib/admin/paths";
import { formatDealDateTime } from "@/lib/deals/format";

export const metadata: Metadata = {
  title: "Admin overview",
  robots: { index: false, follow: false },
};

export default async function AdminHomePage() {
  const loaded = await readAdmin(() => loadAdminDashboard());
  if (loaded.unavailable || !loaded.data) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState
          title="Admin data is unavailable"
          description="The operations console could not load ingestion health from the database."
        />
      </Main>
    );
  }

  const dashboard = loaded.data;

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title="Operations overview"
        description="Diagnose source-to-preview health, keep risky previews unpublished, and audit production ingestion without exposing a public admin API."
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <AdminStatCard
          label="Enabled sources"
          value={`${dashboard.sources.enabled}/${dashboard.sources.total}`}
          hint={`${dashboard.sources.blocked} blocked by compliance · ${dashboard.sources.stale} stale`}
        />
        <AdminStatCard
          label="Failed runs (24h)"
          value={dashboard.runs.failed24h}
          hint={`${dashboard.runs.skipped24h} skipped`}
          tone={dashboard.runs.failed24h > 0 ? "danger" : "default"}
        />
        <AdminStatCard
          label="Unpublished leak queue"
          value={dashboard.previews.unpublishedRisk}
          hint={`${dashboard.previews.heldByAdmin} held by admin`}
          tone={dashboard.previews.unpublishedRisk > 0 ? "warning" : "default"}
        />
        <AdminStatCard
          label="Stale open deals"
          value={dashboard.staleDeals}
          hint={`${dashboard.failedMatchJobs} failed match jobs · ${dashboard.failedDocuments} failed documents`}
        />
        <AdminStatCard
          label="Alert email"
          value={dashboard.emailConfigured ? "Configured" : "Not configured"}
          hint="Resend key stays on the server. Test with the alerts job in test mode."
        />
        <AdminStatCard
          label="Error monitoring"
          value={dashboard.monitoringConfigured ? "Configured" : "Log-only"}
          hint="Sentry DSN optional. Jobs still emit structured logs without secrets."
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Recent scheduled jobs</h2>
        {dashboard.recentJobRuns.length === 0 ? (
          <EmptyState
            title="No scheduled job runs yet"
            description="GitHub Actions ingestion, alerts, renewals, and data-quality jobs will appear here after the first run."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.recentJobRuns.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>{run.jobName}</TableCell>
                  <TableCell>{run.status}</TableCell>
                  <TableCell>{run.mode}</TableCell>
                  <TableCell>{formatDealDateTime(run.startedAt) ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="grid gap-8 xl:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent ingestion runs</h2>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/ingestion">All runs</Link>
            </Button>
          </div>
          {dashboard.recentRuns.length === 0 ? (
            <EmptyState
              title="No ingestion runs yet"
              description="Manual or scheduled ingestion will appear here with counters and errors."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.recentRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <Link className="hover:underline" href={adminIngestionRunPath(run.id)}>
                        {run.sourceKey ?? run.sourceName ?? run.sourceId}
                      </Link>
                    </TableCell>
                    <TableCell>{run.status}</TableCell>
                    <TableCell>{run.errorCount}</TableCell>
                    <TableCell>{formatDealDateTime(run.startedAt) ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Preview leak queue</h2>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/data-quality">Data quality</Link>
            </Button>
          </div>
          {dashboard.leakQueue.length === 0 ? (
            <EmptyState
              title="No unpublished REVIEW/HIGH previews"
              description="Risky previews stay here until regenerated or held unpublished."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal</TableHead>
                  <TableHead>Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.leakQueue.map((deal) => (
                  <TableRow key={deal.id}>
                    <TableCell>
                      <Link className="hover:underline" href={adminDealPath(deal.id)}>
                        {deal.sourceTitle}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <LeakageBadge
                        risk={deal.leakageRisk}
                        published={deal.isPublished}
                        held={deal.unpublishedByAdmin}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Recent admin changes</h2>
        {dashboard.recentAudit.length === 0 ? (
          <EmptyState
            title="No audited mutations yet"
            description="Source enablement, preview holds, reprocessing, and organisation merges are recorded here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.recentAudit.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{event.action}</TableCell>
                  <TableCell className="max-w-xl whitespace-normal">{event.summary}</TableCell>
                  <TableCell>{formatDealDateTime(event.createdAt) ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </Main>
  );
}
