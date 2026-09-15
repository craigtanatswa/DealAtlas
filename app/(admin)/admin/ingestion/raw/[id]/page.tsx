import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminMetaList, AdminPageHeader, JsonBlock } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { reprocessRawRecordAction } from "@/lib/admin/actions";
import { getAdminRawRecord } from "@/lib/admin/load";
import { readAdmin } from "@/lib/admin/page";
import { adminSourcePath, parseAdminIdParam } from "@/lib/admin/paths";
import { formatDealDateTime } from "@/lib/deals/format";

export const metadata: Metadata = {
  title: "Admin raw record",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminRawRecordPage({ params }: PageProps) {
  const id = parseAdminIdParam((await params).id);
  if (!id) {
    notFound();
  }
  const loaded = await readAdmin(() => getAdminRawRecord(id));
  if (loaded.unavailable) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState title="Raw record unavailable" description="This source snapshot could not be loaded." />
      </Main>
    );
  }
  if (!loaded.data) {
    notFound();
  }
  const record = loaded.data;

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title={record.externalRecordId}
        description="Immutable source snapshot. Reprocessing parses this payload into canonical Deal data and regenerates the preview."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={adminSourcePath(record.sourceId)}>Source</Link>
          </Button>
        }
      />
      <AdminMetaList
        items={[
          { label: "Source", value: record.sourceKey ?? record.sourceId },
          { label: "Content type", value: record.contentType ?? "—" },
          { label: "Hash", value: record.contentHash },
          { label: "Fetched", value: formatDealDateTime(record.fetchedAt) ?? "—" },
          { label: "Published", value: formatDealDateTime(record.publishedAt) ?? "—" },
          { label: "Source URL", value: record.sourceUrl ?? "—" },
        ]}
      />
      <AdminActionForm
        action={reprocessRawRecordAction}
        submitLabel="Reprocess into canonical Deal"
        pendingLabel="Reprocessing…"
        variant="default"
      >
        <input type="hidden" name="rawRecordId" value={record.id} />
      </AdminActionForm>
      <JsonBlock label="Raw payload" value={record.payloadPreview} />
    </Main>
  );
}
