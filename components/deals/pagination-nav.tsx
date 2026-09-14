import Link from "next/link";

import { Button } from "@/components/ui/button";
import { publicSearchHref, type PublicSearchFilters } from "@/lib/search/params";

export function PaginationNav({
  page,
  pageSize,
  total,
  filters,
}: {
  page: number;
  pageSize: number;
  total: number;
  filters: PublicSearchFilters;
}) {
  if (total === 0) {
    return null;
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const hasPrevious = current > 1;
  const hasNext = current < pageCount;

  const pages = visiblePages(current, pageCount);

  return (
    <nav
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Pagination"
    >
      <p className="text-[0.8125rem] leading-5 text-muted-foreground">
        Showing {from}–{to} of {total} {total === 1 ? "opportunity" : "opportunities"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {hasPrevious ? (
          <Button asChild variant="outline" size="sm">
            <Link href={publicSearchHref(filters, current - 1)}>Previous</Link>
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}
        <ul className="flex flex-wrap items-center gap-1">
          {pages.map((item, index) =>
            item === "ellipsis" ? (
              <li
                key={`ellipsis-${index}`}
                className="px-1 text-sm text-muted-foreground"
              >
                …
              </li>
            ) : (
              <li key={item}>
                {item === current ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    aria-current="page"
                  >
                    {item}
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={publicSearchHref(filters, item)}>{item}</Link>
                  </Button>
                )}
              </li>
            ),
          )}
        </ul>
        {hasNext ? (
          <Button asChild variant="outline" size="sm">
            <Link href={publicSearchHref(filters, current + 1)}>Next</Link>
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

function visiblePages(current: number, pageCount: number): Array<number | "ellipsis"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const items: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(pageCount - 1, current + 1);

  if (start > 2) {
    items.push("ellipsis");
  }

  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }

  if (end < pageCount - 1) {
    items.push("ellipsis");
  }

  items.push(pageCount);
  return items;
}
