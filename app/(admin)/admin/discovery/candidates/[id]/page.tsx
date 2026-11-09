import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminActionForm } from "@/components/admin/admin-action-form";
import {
  AdminMetaList,
  AdminPageHeader,
  JsonBlock,
} from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  approveOpportunityCandidateAction,
  rejectOpportunityCandidateAction,
} from "@/lib/admin/actions";
import { loadDiscoveryCandidate } from "@/lib/admin/discovery";
import { readAdmin } from "@/lib/admin/page";
import { adminDealPath, parseAdminIdParam } from "@/lib/admin/paths";
import { formatDealDateTime } from "@/lib/deals/format";

export const metadata: Metadata = {
  title: "Discovery candidate",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminDiscoveryCandidatePage({ params }: PageProps) {
  const id = parseAdminIdParam((await params).id);
  if (!id) {
    notFound();
  }
  const loaded = await readAdmin(() => loadDiscoveryCandidate(id));
  if (loaded.unavailable) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState title="Candidate unavailable" description="This candidate could not be loaded." />
      </Main>
    );
  }
  if (!loaded.data) {
    notFound();
  }
  const { candidate, extraction, preview } = loaded.data;
  const pending = candidate.status === "PENDING_REVIEW";

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title={candidate.title}
        description="Private candidate details are admin-only. The public preview must never expose the buyer, source URL or raw extraction."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/discovery/candidates">All candidates</Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={
            candidate.status === "PENDING_REVIEW"
              ? "warning"
              : candidate.status === "APPROVED"
                ? "success"
                : "outline"
          }
        >
          {candidate.status}
        </Badge>
        <Badge variant="outline">{candidate.opportunityType}</Badge>
        <span className="text-sm text-muted-foreground">{candidate.confidence}% confidence</span>
      </div>
      <AdminMetaList
        items={[
          { label: "Source", value: candidate.sourceKey ?? "—" },
          { label: "Buyer (private)", value: candidate.buyerName ?? "—" },
          { label: "Buyer domain (private)", value: candidate.buyerDomain ?? "—" },
          { label: "Location", value: candidate.location ?? "—" },
          {
            label: "Budget",
            value:
              candidate.budgetMin == null && candidate.budgetMax == null
                ? "—"
                : `${candidate.currency ?? ""} ${candidate.budgetMin ?? "?"}–${candidate.budgetMax ?? "?"}`,
          },
          { label: "Deadline", value: formatDealDateTime(candidate.deadline) ?? "—" },
          { label: "Discovered", value: formatDealDateTime(candidate.discoveredAt) ?? "—" },
          { label: "Reject reason", value: candidate.rejectReason ?? "—" },
          {
            label: "Source URL (private)",
            value: (
              <a className="underline" href={candidate.url} rel="noreferrer noopener" target="_blank">
                {candidate.normalizedUrl}
              </a>
            ),
          },
        ]}
      />
      <JsonBlock label="Private extraction" value={JSON.stringify(extraction, null, 2)} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Preview</h2>
        {preview ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <Link className="font-medium hover:underline" href={adminDealPath(preview.dealId)}>
              {preview.previewTitle}
            </Link>
            <Badge variant={preview.isPublished ? "success" : "outline"}>
              {preview.isPublished ? "Published" : "Unpublished"}
            </Badge>
            <Badge variant={preview.leakageRisk === "HIGH" ? "destructive" : "outline"}>
              {preview.leakageRisk}
            </Badge>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No linked preview exists yet. The candidate has not been merged into a deal.
          </p>
        )}
      </section>

      <section className="flex flex-wrap gap-6">
        {pending ? (
          <AdminActionForm
            action={approveOpportunityCandidateAction}
            submitLabel="Approve candidate"
            pendingLabel="Approving…"
            variant="default"
          >
            <input type="hidden" name="candidateId" value={candidate.id} />
          </AdminActionForm>
        ) : null}
        <AdminActionForm
          action={rejectOpportunityCandidateAction}
          submitLabel="Reject candidate"
          pendingLabel="Rejecting…"
          variant="destructive"
        >
          <input type="hidden" name="candidateId" value={candidate.id} />
          <input
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            name="reason"
            placeholder="Reason (optional)"
          />
        </AdminActionForm>
      </section>
    </Main>
  );
}
