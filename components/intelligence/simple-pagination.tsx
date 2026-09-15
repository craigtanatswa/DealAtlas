import Link from "next/link";

import { Button } from "@/components/ui/button";

export function SimplePagination({
  page,
  pageSize,
  total,
  hrefForPage,
  noun,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefForPage: (page: number) => string;
  noun: string;
}) {
  if (total === 0) {
    return null;
  }
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  return (
    <nav
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Pagination"
    >
      <p className="text-[0.8125rem] leading-5 text-muted-foreground">
        Showing {from}–{to} of {total} {total === 1 ? noun : `${noun}s`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {current > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefForPage(current - 1)}>Previous</Link>
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}
        {current < pageCount ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefForPage(current + 1)}>Next</Link>
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled>
            Next
          </Button>
        )}
      </div>
    </nav>
  );
}
