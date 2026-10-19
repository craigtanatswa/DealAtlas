import Link from "next/link";

import { DeadlineBand } from "@/components/deals/deadline-band";
import { DealStatusBadge } from "@/components/deals/deal-status";
import { OpeningAlertButton } from "@/components/deals/opening-alert";
import { MatchScore } from "@/components/deals/match-score";
import {
  buyerSectorLabel,
  levelLabel,
  type DealCardData,
} from "@/components/deals/types";
import { ValueBand } from "@/components/deals/value-band";
import {
  categoryLabel,
  disclosed,
  keyDatesRemainder,
} from "@/lib/preview/display";
import { Skeleton } from "@/components/ui/skeleton";
import { DEAL_TYPE_LABELS } from "@/lib/search/filters";
import { cn } from "@/lib/utils";

export function DealCard({
  deal,
  href,
  signedIn = false,
  proLock = false,
}: {
  deal: DealCardData;
  href?: string;
  signedIn?: boolean;
  /** Static lock line. Never substitutes for hidden buyer or source text. */
  proLock?: boolean;
}) {
  const dealPath = `/deals/${deal.slug}`;
  const destination = href ?? dealPath;
  const tags = (deal.relevanceTags ?? []).slice(0, 4);
  const buyerLabel = buyerSectorLabel(deal.buyerSector, deal.dealType);
  const category = categoryLabel(deal.mainCategory);
  const valueBand = disclosed(deal.valueBand);
  const smeFit = disclosed(levelLabel(deal.smeSuitability, ""));
  // The closing window is already shown as a band below; keep only the rest.
  const keyDates = keyDatesRemainder(deal.keyDates, { deadlineBand: deal.deadlineBand });

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
            <DealStatusBadge status={deal.status} deadlineBand={deal.deadlineBand} />
            {buyerLabel ? (
              <span className="text-muted-foreground">{buyerLabel} buyer</span>
            ) : null}
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
          <p
            className={cn(
              "mt-2 max-w-3xl text-pretty text-[0.9375rem] leading-6 text-muted-foreground",
              proLock && "line-clamp-3",
            )}
          >
            {deal.previewSummary}
          </p>
          {deal.goodsServices && deal.goodsServices.length > 0 ? (
            <p className="mt-2 text-pretty text-[0.8125rem] leading-5 text-foreground">
              {deal.goodsServices.slice(0, 2).join(" · ")}
            </p>
          ) : null}
          {keyDates ? (
            <p className="mt-1 text-pretty text-[0.8125rem] leading-5 text-muted-foreground tabular-nums">
              {keyDates}
            </p>
          ) : null}
          {proLock ? (
            <p className="mt-3 text-[0.8125rem] leading-5 text-muted-foreground">
              🔒 Buyer, documents and contacts with Pro
            </p>
          ) : null}
          <dl className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {category ? (
              <div className="text-[0.8125rem] leading-5 text-foreground">
                <dt className="sr-only">Category</dt>
                <dd>{category}</dd>
              </div>
            ) : null}
            {deal.dealType ? (
              <div className="text-[0.8125rem] leading-5 text-foreground">
                <dt className="sr-only">Opportunity type</dt>
                <dd>{DEAL_TYPE_LABELS[deal.dealType]}</dd>
              </div>
            ) : null}
            {disclosed(deal.broadRegion) ? (
              <div className="text-[0.8125rem] leading-5 text-foreground">
                <dt className="sr-only">Region</dt>
                <dd>{deal.broadRegion}</dd>
              </div>
            ) : null}
            {valueBand ? (
              <div>
                <dt className="sr-only">Value</dt>
                <dd>
                  <ValueBand value={valueBand} />
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="sr-only">Closing</dt>
              <dd>
                <DeadlineBand value={deal.deadlineBand} />
              </dd>
            </div>
            {smeFit ? (
              <div className="text-[0.8125rem] leading-5 text-muted-foreground">
                <dt className="sr-only">SME fit</dt>
                <dd>SME fit {smeFit}</dd>
              </div>
            ) : null}
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
        <div className="flex w-full flex-col gap-2 md:w-auto">
          {deal.status === "UPCOMING" ? (
            <OpeningAlertButton href={dealPath} signedIn={signedIn} variant="card" />
          ) : null}
          <Link
            href={destination}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.96] motion-reduce:active:scale-100"
          >
            View opportunity
          </Link>
        </div>
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
