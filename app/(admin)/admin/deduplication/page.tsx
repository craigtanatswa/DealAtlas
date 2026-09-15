import type { Metadata } from "next";
import Link from "next/link";

import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminPageHeader } from "@/components/admin/admin-ui";
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
import { mergeOrganizationsAction } from "@/lib/admin/actions";
import { listAdminDedupCandidates } from "@/lib/admin/load";
import { readAdmin } from "@/lib/admin/page";
import { adminOrganisationPath } from "@/lib/admin/paths";

export const metadata: Metadata = {
  title: "Admin deduplication",
  robots: { index: false, follow: false },
};

export default async function AdminDeduplicationPage() {
  const loaded = await readAdmin(() => listAdminDedupCandidates());
  if (loaded.unavailable || !loaded.data) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState
          title="Dedup candidates unavailable"
          description="Organisation review candidates could not be loaded."
        />
      </Main>
    );
  }

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title="Organisation deduplication"
        description="Ingestion never auto-merges ambiguous names. Review candidates come from ORG_REVIEW_CANDIDATE errors. Merging is audited."
      />
      {loaded.data.length === 0 ? (
        <EmptyState
          title="No merge candidates"
          description="Ambiguous organisation matches recorded during ingestion will appear here."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Keep</TableHead>
              <TableHead>Duplicate</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Merge</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loaded.data.map((candidate) => (
              <TableRow key={`${candidate.keepId}-${candidate.dropId}-${candidate.sourceErrorId}`}>
                <TableCell>
                  <Link className="hover:underline" href={adminOrganisationPath(candidate.keepId)}>
                    {candidate.keepName}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link className="hover:underline" href={adminOrganisationPath(candidate.dropId)}>
                    {candidate.dropName}
                  </Link>
                </TableCell>
                <TableCell className="max-w-md whitespace-normal">{candidate.reason}</TableCell>
                <TableCell>
                  <AdminActionForm
                    action={mergeOrganizationsAction}
                    submitLabel="Merge"
                    variant="destructive"
                  >
                    <input type="hidden" name="keepId" value={candidate.keepId} />
                    <input type="hidden" name="dropId" value={candidate.dropId} />
                  </AdminActionForm>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <section className="max-w-lg">
        <h2 className="mb-3 text-lg font-semibold">Manual merge</h2>
        <AdminActionForm
          action={mergeOrganizationsAction}
          submitLabel="Merge organisations"
          variant="destructive"
        >
          <Label htmlFor="keepId">Keep organisation ID</Label>
          <Input id="keepId" name="keepId" />
          <Label htmlFor="dropId">Drop organisation ID</Label>
          <Input id="dropId" name="dropId" />
        </AdminActionForm>
      </section>
    </Main>
  );
}
