import Link from "next/link";

import { DeadlineBand } from "@/components/deals/deadline-band";
import { DealStatusBadge } from "@/components/deals/deal-status";
import { MatchScore } from "@/components/deals/match-score";
import {
  buyerVisibilityLabel,
  levelLabel,
  type DealCardData,
} from "@/components/deals/types";
import { ValueBand } from "@/components/deals/value-band";
import { Skeleton } from "@/components/ui/skeleton";
import { DEAL_TYPE_LABELS } from "@/lib/search/filters";
import { cn } from "@/lib/utils";

export function DealCard({
  deal,
  href,
}: {
  deal: DealCardData;
  href?: string;
}) {
  const destination = href ?? `/deals/${deal.slug}`;
  const tags = (deal.relevanceTags ?? []).slice(0, 4);

  return (
    <article
      className={cn(
        "h-full rounded-lg border border-border bg-card p-5 transition-colors",
        "hover:border-primary/30 hover:bg-muted/20",
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] leading-5">
            <DealStatusBadge status={deal.status} />
            <span className="text-muted-foreground">
              {buyerVisibilityLabel(deal.buyerSector)} buyer
            </span>
            {deal.freshnessLabel ? (
              <span className="text-muted-foreground">{deal.freshnessLabel}</span>
            ) : null}
          </div>
          <h3 className="font-heading mt-3 text-lg leading-snug font-semibold text-balance">
            <Link
              href={destination}
              className="rounded-sm hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {deal.previewTitle}
            </Link>
          </h3>
          <p className="mt-2 max-w-3xl text-pretty text-[0.9375rem] leading-6 text-muted-foreground">
            {deal.previewSummary}
          </p>
          <dl className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {deal.mainCategory ? (
              <div className="text-[0.8125rem] leading-5 text-foreground">
                <dt className="sr-only">Category</dt>
                <dd>{deal.mainCategory}</dd>
              </div>
            ) : null}
            {deal.dealType ? (
              <div className="text-[0.8125rem] leading-5 text-foreground">
                <dt className="sr-only">Opportunity type</dt>
                <dd>{DEAL_TYPE_LABELS[deal.dealType]}</dd>
              </div>
            ) : null}
            {deal.broadRegion ? (
              <div className="text-[0.8125rem] leading-5 text-foreground">
                <dt className="sr-only">Region</dt>
                <dd>{deal.broadRegion}</dd>
              </div>
            ) : null}
            <div>
              <dt className="sr-only">Value</dt>
              <dd>
                <ValueBand value={deal.valueBand} />
              </dd>
            </div>
            <div>
              <dt className="sr-only">Closing</dt>
              <dd>
                <DeadlineBand value={deal.deadlineBand} />
              </dd>
            </div>
            <div className="text-[0.8125rem] leading-5 text-muted-foreground">
              <dt className="sr-only">SME fit</dt>
              <dd>SME fit {levelLabel(deal.smeSuitability, "not stated")}</dd>
            </div>
          </dl>
          {tags.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-md bg-muted px-2 py-0.5 text-[0.75rem] leading-5 text-muted-foreground"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
          {typeof deal.matchScore === "number" ? (
            <div className="mt-3 flex flex-col gap-2">
              <MatchScore score={deal.matchScore} />
              {deal.matchReasons && deal.matchReasons.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-[0.8125rem] leading-5 text-muted-foreground">
                  {deal.matchReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        <Link
          href={destination}
          className="inline-flex h-10 min-h-10 shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.96] motion-reduce:active:scale-100"
        >
          View opportunity
        </Link>
      </div>
    </article>
  );
}

export function DealCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="rounded-lg border border-border bg-card p-5"
    >
      <div className="flex gap-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="mt-3 h-6 w-3/4" />
      <div className="mt-3 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-32" />
      </div>
      <span className="sr-only">Loading opportunity</span>
    </div>
  );
}
