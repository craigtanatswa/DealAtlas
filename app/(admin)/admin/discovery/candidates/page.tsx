import type { Metadata } from "next";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/admin-ui";
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
import { loadDiscoveryCandidates } from "@/lib/admin/discovery";
import { readAdmin } from "@/lib/admin/page";
import {
  adminDiscoveryCandidatePath,
  firstSearchParam,
  parseAdminPage,
} from "@/lib/admin/paths";
import { formatDealDateTime } from "@/lib/deals/format";
import type { Database } from "@/lib/db/database.types";

export const metadata: Metadata = {
  title: "Discovery candidates",
  robots: { index: false, follow: false },
};

type CandidateStatus = Database["public"]["Enums"]["candidate_status"];
const STATUSES: CandidateStatus[] = [
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "DUPLICATE",
  "EXPIRED",
];

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminDiscoveryCandidatesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawStatus = firstSearchParam(params.status);
  const status = STATUSES.includes(rawStatus as CandidateStatus)
    ? (rawStatus as CandidateStatus)
    : null;
  const page = parseAdminPage(params.page);
  const loaded = await readAdmin(() => loadDiscoveryCandidates({ page, status }));
  if (loaded.unavailable || !loaded.data) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState
          title="Candidates are unavailable"
          description="The private candidate queue could not be loaded."
        />
      </Main>
    );
  }
  const list = loaded.data;

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title="Discovery candidates"
        description="Every candidate starts private and unpublished. Approval is required before a preview can publish."
      />
      <div className="flex flex-wrap gap-2">
        <Link
          className="rounded-full border border-border px-3 py-1 text-sm hover:bg-muted"
          href="/admin/discovery/candidates"
        >
          All
        </Link>
        {STATUSES.map((value) => (
          <Link
            key={value}
            className="rounded-full border border-border px-3 py-1 text-sm hover:bg-muted"
            href={`/admin/discovery/candidates?status=${value}`}
          >
            {value}
          </Link>
        ))}
      </div>
      {list.rows.length === 0 ? (
        <EmptyState
          title="No candidates match"
          description="Run a compliant discovery source or clear the status filter."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Confidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.rows.map((candidate) => (
              <TableRow key={candidate.id}>
                <TableCell>
                  <Link
                    className="font-medium hover:underline"
                    href={adminDiscoveryCandidatePath(candidate.id)}
                  >
                    {candidate.title}
                  </Link>
                  <p className="text-[0.8125rem] text-muted-foreground">
                    {candidate.sourceKey ?? "—"} · {formatDealDateTime(candidate.discoveredAt)}
                  </p>
                </TableCell>
                <TableCell>
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
                </TableCell>
                <TableCell>{candidate.opportunityType}</TableCell>
                <TableCell>{candidate.buyerName ?? "—"}</TableCell>
                <TableCell>{formatDealDateTime(candidate.deadline) ?? "—"}</TableCell>
                <TableCell>{candidate.confidence}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <SimplePagination
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        hrefForPage={(next) => {
          const nextParams = new URLSearchParams();
          if (status) nextParams.set("status", status);
          nextParams.set("page", String(next));
          return `/admin/discovery/candidates?${nextParams.toString()}`;
        }}
        noun="candidate"
      />
    </Main>
  );
}
