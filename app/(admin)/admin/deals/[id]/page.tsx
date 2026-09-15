import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminActionForm } from "@/components/admin/admin-action-form";
import {
  AdminMetaList,
  AdminPageHeader,
  JsonBlock,
  LeakageBadge,
} from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  publishPreviewAction,
  regeneratePreviewAction,
  releasePreviewHoldAction,
  updateDealQualityAction,
} from "@/lib/admin/actions";
import { compareCanonicalToPreview } from "@/lib/admin/compare";
import { getAdminDealDetail } from "@/lib/admin/load";
import { readAdmin } from "@/lib/admin/page";
import {
  adminOrganisationPath,
  adminRawRecordPath,
  adminSourcePath,
  parseAdminIdParam,
} from "@/lib/admin/paths";
import { formatDealDateTime, formatDealValueRange } from "@/lib/deals/format";

export const metadata: Metadata = {
  title: "Admin deal",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminDealDetailPage({ params }: PageProps) {
  const id = parseAdminIdParam((await params).id);
  if (!id) {
    notFound();
  }
  const loaded = await readAdmin(() => getAdminDealDetail(id));
  if (loaded.unavailable) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState title="Deal unavailable" description="This canonical deal could not be loaded." />
      </Main>
    );
  }
  if (!loaded.data) {
    notFound();
  }

  const { deal, preview, buyer, source, notices, noticeVersions, previewRuns } = loaded.data;
  const compare = preview
    ? compareCanonicalToPreview({
        sourceTitle: deal.source_title,
        sourceDescription: deal.source_description,
        buyerName: buyer?.canonicalName ?? null,
        sourceUrl: deal.source_url,
        reference: deal.reference,
        ocid: deal.ocid,
        exactValueText: deal.exact_value_text,
        valueMinExVat: deal.value_min_ex_vat,
        valueMaxExVat: deal.value_max_ex_vat,
        submissionDeadline: deal.submission_deadline,
        exactLocationText: deal.exact_location_text,
        previewTitle: preview.previewTitle,
        previewSummary: preview.previewSummary,
        valueBand: preview.valueBand,
        deadlineBand: preview.deadlineBand,
        broadRegion: preview.broadRegion,
        leakageRisk: preview.leakageRisk,
        isPublished: preview.isPublished,
        unpublishedByAdmin: preview.unpublishedByAdmin,
      })
    : [];

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title={deal.source_title}
        description="Canonical source record versus sanitised preview. Protected identity stays on this admin page only."
      />
      <div className="flex flex-wrap items-center gap-2">
        <LeakageBadge
          risk={preview?.leakageRisk ?? null}
          published={preview?.isPublished}
          held={preview?.unpublishedByAdmin}
        />
        {source ? (
          <Link className="text-sm text-primary hover:underline" href={adminSourcePath(source.id)}>
            {source.name}
          </Link>
        ) : null}
        {buyer ? (
          <Link className="text-sm text-primary hover:underline" href={adminOrganisationPath(buyer.id)}>
            {buyer.canonicalName}
          </Link>
        ) : null}
      </div>

      <AdminMetaList
        items={[
          { label: "Status / stage", value: `${deal.status} · ${deal.stage}` },
          {
            label: "Value",
            value:
              formatDealValueRange({
                exactValueText: deal.exact_value_text,
                valueMinExVat: deal.value_min_ex_vat,
                valueMaxExVat: deal.value_max_ex_vat,
                currency: deal.currency,
              }) ?? "—",
          },
          { label: "Deadline", value: formatDealDateTime(deal.submission_deadline) ?? "—" },
          { label: "OCID", value: deal.ocid ?? "—" },
          { label: "Reference", value: deal.reference ?? "—" },
          { label: "Source URL", value: deal.source_url ?? "—" },
          { label: "Quality score", value: String(deal.data_quality_score ?? "—") },
          { label: "Last verified", value: formatDealDateTime(deal.last_verified_at) ?? "—" },
        ]}
      />

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-semibold">Canonical description</h2>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {deal.source_description || "—"}
          </p>
        </div>
        <div>
          <h2 className="mb-2 text-lg font-semibold">Sanitised preview</h2>
          {preview ? (
            <>
              <p className="text-sm font-medium">{preview.previewTitle}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {preview.previewSummary}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No preview has been generated.</p>
          )}
        </div>
      </section>

      {compare.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Canonical vs preview</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Canonical</TableHead>
                <TableHead>Preview</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compare.map((row) => (
                <TableRow key={row.field}>
                  <TableCell>{row.field}</TableCell>
                  <TableCell className="max-w-md whitespace-normal">{row.canonical}</TableCell>
                  <TableCell className="max-w-md whitespace-normal">{row.preview}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <AdminActionForm
          action={holdPreviewUnpublishedAction}
          submitLabel="Keep unpublished"
          variant="destructive"
        >
          <input type="hidden" name="dealId" value={deal.id} />
        </AdminActionForm>
        <AdminActionForm action={releasePreviewHoldAction} submitLabel="Release unpublished hold">
          <input type="hidden" name="dealId" value={deal.id} />
        </AdminActionForm>
        <AdminActionForm
          action={regeneratePreviewAction}
          submitLabel="Regenerate preview"
          pendingLabel="Regenerating…"
        >
          <input type="hidden" name="dealId" value={deal.id} />
        </AdminActionForm>
        <AdminActionForm action={publishPreviewAction} submitLabel="Publish if LOW" variant="default">
          <input type="hidden" name="dealId" value={deal.id} />
        </AdminActionForm>
        <AdminActionForm action={updateDealQualityAction} submitLabel="Update quality score">
          <input type="hidden" name="dealId" value={deal.id} />
          <Label htmlFor="dataQualityScore">Data quality score</Label>
          <Input
            id="dataQualityScore"
            name="dataQualityScore"
            type="number"
            min={0}
            max={100}
            defaultValue={deal.data_quality_score ?? 0}
            className="max-w-[8rem]"
          />
        </AdminActionForm>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Notice history</h2>
        {notices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notices linked.</p>
        ) : (
          <ul className="grid gap-2">
            {notices.map((notice) => (
              <li key={notice.id} className="text-sm">
                {notice.noticeIdentifier ?? notice.id} · {notice.noticeType ?? "notice"} ·{" "}
                {formatDealDateTime(notice.publishedAt) ?? "undated"}
                {notice.sourceUrl ? (
                  <>
                    {" "}
                    ·{" "}
                    <a className="text-primary hover:underline" href={notice.sourceUrl}>
                      source link
                    </a>
                  </>
                ) : null}
                {notice.rawRecordId ? (
                  <>
                    {" "}
                    ·{" "}
                    <Link className="text-primary hover:underline" href={adminRawRecordPath(notice.rawRecordId)}>
                      raw record
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {noticeVersions.length > 0 ? (
          <div className="mt-4 grid gap-4">
            {noticeVersions.slice(0, 3).map((version) => (
              <JsonBlock
                key={version.id}
                label={`Notice version ${version.versionNumber} (${version.contentHash.slice(0, 12)})`}
                value={version.payloadPreview}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Preview generation runs</h2>
        {previewRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leak-scan runs recorded.</p>
        ) : (
          <ul className="grid gap-3">
            {previewRuns.map((run) => (
              <li key={run.id} className="rounded-lg border border-border px-4 py-3 text-sm">
                <p>
                  Attempt {run.attemptNumber} · {run.leakageRisk} ·{" "}
                  {run.isPublished ? "published" : "unpublished"} ·{" "}
                  {formatDealDateTime(run.createdAt)}
                </p>
                {run.findings.length > 0 ? (
                  <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                    {run.findings.map((finding, index) => (
                      <li key={`${run.id}-${index}`}>
                        {finding.code}: {finding.detail}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-muted-foreground">No leak findings.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Main>
  );
}
