import Link from "next/link";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { SimplePagination } from "@/components/intelligence/simple-pagination";
import { formatDealDate } from "@/lib/deals/format";
import type { OrganizationListDto } from "@/lib/intelligence/types";

export function OrganizationDirectory({
  list,
  path,
  itemHref,
  query,
  emptyTitle,
  emptyDescription,
}: {
  list: OrganizationListDto;
  path: string;
  itemHref: (id: string) => string;
  query: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
        <Field id="q" label="Search organisations" className="min-w-0 flex-1">
          <Input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="Organisation name"
          />
        </Field>
        <Button type="submit">Search</Button>
      </form>
      {list.items.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <ul className="grid gap-3">
          {list.items.map((item) => (
            <li key={item.id} className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-semibold">
                <Link className="hover:underline" href={itemHref(item.id)}>
                  {item.name}
                </Link>
              </p>
              <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">
                {[
                  item.region,
                  `${item.dealCount} recorded ${item.dealCount === 1 ? "record" : "records"}`,
                  formatDealDate(item.latestActivityAt),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
      <SimplePagination
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        noun="organisation"
        hrefForPage={(page) => {
          const params = new URLSearchParams();
          if (query) {
            params.set("q", query);
          }
          if (page > 1) {
            params.set("page", String(page));
          }
          const qs = params.toString();
          return qs ? `${path}?${qs}` : path;
        }}
      />
    </div>
  );
}
