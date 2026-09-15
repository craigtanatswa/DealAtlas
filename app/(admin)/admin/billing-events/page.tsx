import type { Metadata } from "next";
import Link from "next/link";

import { AdminPageHeader, JsonBlock } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/feedback/empty-state";
import { SimplePagination } from "@/components/intelligence/simple-pagination";
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
import { getAdminBillingEvent, listAdminBillingEvents } from "@/lib/admin/load";
import { readAdmin } from "@/lib/admin/page";
import { firstSearchParam, parseAdminIdParam, parseAdminPage } from "@/lib/admin/paths";
import { formatDealDateTime } from "@/lib/deals/format";

export const metadata: Metadata = {
  title: "Admin billing events",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminBillingEventsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parseAdminPage(params.page);
  const selectedId = parseAdminIdParam(firstSearchParam(params.event));
  const loaded = await readAdmin(async () => {
    const list = await listAdminBillingEvents({ page });
    const selected = selectedId ? await getAdminBillingEvent(selectedId) : null;
    return { list, selected };
  });
  if (loaded.unavailable || !loaded.data) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState
          title="Billing events unavailable"
          description="Provider webhook diagnostics could not be loaded."
        />
      </Main>
    );
  }
  const { list, selected } = loaded.data;

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title="Billing events"
        description="Read-only Dodo webhook diagnostics. Entitlement is never granted from this screen; only verified webhook processing updates Pro access."
      />
      {list.rows.length === 0 ? (
        <EmptyState
          title="No billing events"
          description="Verified provider webhooks will appear here with processing status."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.rows.map((event) => (
              <TableRow key={event.id}>
                <TableCell>
                  <Link
                    className="hover:underline"
                    href={`/admin/billing-events?page=${list.page}&event=${event.id}`}
                  >
                    {event.eventType}
                  </Link>
                  <p className="text-[0.8125rem] text-muted-foreground">{event.providerEventId}</p>
                </TableCell>
                <TableCell>
                  <Badge variant={event.status === "FAILED" ? "destructive" : "outline"}>
                    {event.status}
                  </Badge>
                </TableCell>
                <TableCell>{formatDealDateTime(event.receivedAt) ?? "—"}</TableCell>
                <TableCell className="max-w-md whitespace-normal">
                  {event.processingError ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <SimplePagination
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        hrefForPage={(next) => `/admin/billing-events?page=${next}`}
        noun="event"
      />
      {selected ? (
        <JsonBlock
          label={`${selected.eventType} payload (${selected.payloadHash.slice(0, 12)})`}
          value={selected.payloadPreview ?? ""}
        />
      ) : null}
    </Main>
  );
}
