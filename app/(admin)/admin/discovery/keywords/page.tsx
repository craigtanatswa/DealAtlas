import type { Metadata } from "next";

import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addDiscoveryKeywordAction,
  setDiscoveryKeywordEnabledAction,
} from "@/lib/admin/actions";
import { loadDiscoveryKeywords } from "@/lib/admin/discovery";
import { readAdmin } from "@/lib/admin/page";
import { formatDealDateTime } from "@/lib/deals/format";

export const metadata: Metadata = {
  title: "Discovery keywords",
  robots: { index: false, follow: false },
};

export default async function AdminDiscoveryKeywordsPage() {
  const loaded = await readAdmin(() => loadDiscoveryKeywords());
  if (loaded.unavailable || !loaded.data) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState
          title="Keywords are unavailable"
          description="The discovery keyword list could not be loaded."
        />
      </Main>
    );
  }
  const keywords = loaded.data;

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title="Discovery keywords"
        description="Candidates must match an enabled keyword before the classifier runs. Disable a keyword to stop new matches without deleting history."
      />
      <AdminActionForm
        action={addDiscoveryKeywordAction}
        submitLabel="Add keyword"
        pendingLabel="Adding…"
        variant="default"
      >
        <Input
          className="max-w-sm"
          name="keyword"
          placeholder="e.g. clinical waste collection"
          minLength={2}
          maxLength={120}
          required
        />
      </AdminActionForm>
      {keywords.length === 0 ? (
        <EmptyState
          title="No keywords configured"
          description="Add a keyword to let the pre-filter pass relevant opportunities to the classifier."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Keyword</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Added</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keywords.map((keyword) => (
              <TableRow key={keyword.id}>
                <TableCell className="font-medium">{keyword.keyword}</TableCell>
                <TableCell>
                  <Badge variant={keyword.enabled ? "success" : "outline"}>
                    {keyword.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </TableCell>
                <TableCell>{formatDealDateTime(keyword.createdAt) ?? "—"}</TableCell>
                <TableCell>
                  <AdminActionForm
                    action={setDiscoveryKeywordEnabledAction}
                    submitLabel={keyword.enabled ? "Disable" : "Enable"}
                    variant={keyword.enabled ? "destructive" : "default"}
                  >
                    <input type="hidden" name="keywordId" value={keyword.id} />
                    <input type="hidden" name="enabled" value={keyword.enabled ? "false" : "true"} />
                  </AdminActionForm>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Main>
  );
}
