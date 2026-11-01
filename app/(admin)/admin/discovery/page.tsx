import type { Metadata } from "next";
import Link from "next/link";

import { AdminActionForm } from "@/components/admin/admin-action-form";
import {
  AdminPageHeader,
  AdminStatCard,
} from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { runSourceIngestionAction } from "@/lib/admin/actions";
import { loadDiscoveryOverview } from "@/lib/admin/discovery";
import { readAdmin } from "@/lib/admin/page";
import {
  adminDiscoveryCandidatePath,
  adminSourcePath,
} from "@/lib/admin/paths";
import { formatDealDateTime } from "@/lib/deals/format";

export const metadata: Metadata = {
  title: "Admin discovery",
  robots: { index: false, follow: false },
};

export default async function AdminDiscoveryPage() {
  const loaded = await readAdmin(() => loadDiscoveryOverview());
  if (loaded.unavailable || !loaded.data) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState
          title="Discovery is unavailable"
          description="The private discovery queue could not be loaded."
        />
      </Main>
    );
  }
  const overview = loaded.data;
  const pending = overview.counts.PENDING_REVIEW;
  const approved = overview.counts.APPROVED;

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title="Private discovery"
        description="Candidates stay private and unpublished until an admin approves them. Auto-publish remains off unless every source, compliance and confidence gate passes."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/discovery/candidates">Review candidates</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/discovery/keywords">Keywords</Link>
            </Button>
          </>
        }
      />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard label="Pending review" value={pending} tone={pending > 0 ? "warning" : "default"} />
        <AdminStatCard label="Approved" value={approved} />
        <AdminStatCard label="Rejected" value={overview.counts.REJECTED} />
        <AdminStatCard label="Duplicates / expired" value={overview.counts.DUPLICATE + overview.counts.EXPIRED} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Discovery sources</h2>
        {overview.sources.length === 0 ? (
          <EmptyState
            title="No discovery sources configured"
            description="Add discovery_method and parser settings to a compliant source before running discovery."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Auto-publish</TableHead>
                <TableHead>Candidates</TableHead>
                <TableHead>Last success</TableHead>
                <TableHead>Run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell>
                    <Link className="font-medium hover:underline" href={adminSourcePath(source.id)}>
                      {source.name}
                    </Link>
                    <p className="text-[0.8125rem] text-muted-foreground">{source.sourceKey}</p>
                    {source.lastError ? (
                      <p className="text-[0.8125rem] text-destructive">{source.lastError}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{source.discoveryMethod ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={source.enabled ? "success" : "outline"}>
                      {source.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {source.autoPublish ? (
                      <Badge variant="warning">
                        On · min {source.autoPublishMinConfidence}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Off</Badge>
                    )}
                  </TableCell>
                  <TableCell>{source.candidateCount}</TableCell>
                  <TableCell>{formatDealDateTime(source.lastSuccessAt) ?? "—"}</TableCell>
                  <TableCell>
                    <AdminActionForm
                      action={runSourceIngestionAction}
                      submitLabel="Run discovery"
                      pendingLabel="Discovering…"
                    >
                      <input type="hidden" name="sourceId" value={source.id} />
                    </AdminActionForm>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent candidates</h2>
        {overview.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No candidates discovered yet.</p>
        ) : (
          <ul className="grid gap-2">
            {overview.recent.map((candidate) => (
              <li
                key={candidate.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    className="font-medium hover:underline"
                    href={adminDiscoveryCandidatePath(candidate.id)}
                  >
                    {candidate.title}
                  </Link>
                  <p className="text-[0.8125rem] text-muted-foreground">
                    {candidate.sourceKey ?? "—"} · {candidate.buyerName ?? "Buyer hidden"} ·{" "}
                    {formatDealDateTime(candidate.discoveredAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{candidate.opportunityType}</Badge>
                  <Badge variant={candidate.status === "PENDING_REVIEW" ? "warning" : "outline"}>
                    {candidate.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">{candidate.confidence}%</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Main>
  );
}
