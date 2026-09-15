import type { Metadata } from "next";
import Link from "next/link";

import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { runSourceIngestionAction, setSourceEnabledAction } from "@/lib/admin/actions";
import { listAdminSources } from "@/lib/admin/load";
import { readAdmin } from "@/lib/admin/page";
import { adminSourcePath } from "@/lib/admin/paths";
import { formatDealDateTime } from "@/lib/deals/format";

export const metadata: Metadata = {
  title: "Admin sources",
  robots: { index: false, follow: false },
};

export default async function AdminSourcesPage() {
  const loaded = await readAdmin(() => listAdminSources());
  if (loaded.unavailable || !loaded.data) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState
          title="Sources are unavailable"
          description="The source registry could not be loaded."
        />
      </Main>
    );
  }

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title="Source registry"
        description="Compliance status gates enablement. UNKNOWN and PROHIBITED sources cannot be turned on, and HTML/PDF discovery still requires scraping_permitted."
      />
      {loaded.data.length === 0 ? (
        <EmptyState
          title="No sources registered"
          description="Seeded data sources will appear here with reuse status and enablement controls."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Reuse</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Last success</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loaded.data.map((source) => (
              <TableRow key={source.id}>
                <TableCell>
                  <Link className="font-medium hover:underline" href={adminSourcePath(source.id)}>
                    {source.name}
                  </Link>
                  <p className="text-[0.8125rem] text-muted-foreground">{source.sourceKey}</p>
                </TableCell>
                <TableCell>
                  <Badge variant={source.reuseStatus === "PROHIBITED" ? "destructive" : "outline"}>
                    {source.reuseStatus}
                  </Badge>
                </TableCell>
                <TableCell>{source.accessMethod}</TableCell>
                <TableCell>
                  {source.enabled ? (
                    <Badge variant="success">Enabled</Badge>
                  ) : (
                    <Badge variant="outline">Disabled</Badge>
                  )}
                </TableCell>
                <TableCell>{formatDealDateTime(source.lastSuccessAt) ?? "—"}</TableCell>
                <TableCell className="min-w-[14rem]">
                  <div className="flex flex-col gap-2">
                    {source.enableBlockedReason ? (
                      <p className="text-[0.8125rem] text-muted-foreground">
                        {source.enableBlockedReason}
                      </p>
                    ) : null}
                    <AdminActionForm
                      action={setSourceEnabledAction}
                      submitLabel={source.enabled ? "Disable" : "Enable"}
                      variant={source.enabled ? "destructive" : "default"}
                    >
                      <input type="hidden" name="sourceId" value={source.id} />
                      <input
                        type="hidden"
                        name="enabled"
                        value={source.enabled ? "false" : "true"}
                      />
                    </AdminActionForm>
                    <AdminActionForm
                      action={runSourceIngestionAction}
                      submitLabel="Run ingestion"
                      pendingLabel="Ingesting…"
                    >
                      <input type="hidden" name="sourceId" value={source.id} />
                    </AdminActionForm>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Main>
  );
}
