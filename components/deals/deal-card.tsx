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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BUYER_SECTOR_LABELS } from "@/lib/constants";

export function DealCard({
  deal,
  href,
}: {
  deal: DealCardData;
  href?: string;
}) {
  const destination = href ?? `/deals/${deal.slug}`;

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DealStatusBadge status={deal.status} />
          <Badge variant="outline">{buyerVisibilityLabel(deal.buyerSector)} buyer</Badge>
          {deal.buyerSector !== "PUBLIC" && deal.buyerSector !== "PRIVATE" ? (
            <Badge variant="secondary">
              {BUYER_SECTOR_LABELS[deal.buyerSector]}
            </Badge>
          ) : null}
        </div>
        <h3 className="font-heading text-lg leading-snug font-semibold">
          <Link
            href={destination}
            className="rounded-sm hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {deal.previewTitle}
          </Link>
        </h3>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="text-[0.9375rem] leading-6 text-muted-foreground">
          {deal.previewSummary}
        </p>
        <dl className="flex flex-wrap gap-2">
          {deal.mainCategory ? (
            <div className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.8125rem] leading-5 text-foreground">
              <dt className="font-medium">Category</dt>
              <dd>{deal.mainCategory}</dd>
            </div>
          ) : null}
          {deal.broadRegion ? (
            <div className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.8125rem] leading-5 text-foreground">
              <dt className="font-medium">Region</dt>
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
          <div className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.8125rem] leading-5 text-foreground">
            <dt className="font-medium">SME fit</dt>
            <dd>{levelLabel(deal.smeSuitability, "Not stated")}</dd>
          </div>
          <div className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.8125rem] leading-5 text-foreground">
            <dt className="font-medium">Bid complexity</dt>
            <dd>{levelLabel(deal.bidComplexity, "Not stated")}</dd>
          </div>
        </dl>
        {typeof deal.matchScore === "number" ? (
          <div className="flex flex-col gap-2">
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
      </CardContent>
      <CardFooter>
        <Button asChild>
          <Link href={destination}>View opportunity</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export function DealCardSkeleton() {
  return (
    <Card aria-hidden="true">
      <CardHeader className="gap-3">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-6 w-3/4" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-32" />
        </div>
      </CardContent>
      <CardFooter>
        <Skeleton className="h-9 w-36" />
      </CardFooter>
      <span className="sr-only">Loading opportunity</span>
    </Card>
  );
}
