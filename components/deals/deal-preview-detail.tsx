import { DeadlineBand } from "@/components/deals/deadline-band";
import { DealStatusBadge } from "@/components/deals/deal-status";
import { UnlockPanel } from "@/components/deals/unlock-panel";
import {
  buyerVisibilityLabel,
  levelLabel,
} from "@/components/deals/types";
import { ValueBand } from "@/components/deals/value-band";
import { Heading, Text } from "@/components/layout/heading";
import { Badge } from "@/components/ui/badge";
import { BUYER_SECTOR_LABELS } from "@/lib/constants";
import type { PublicDealPreview } from "@/lib/search/dto";
import {
  DEAL_STAGE_LABELS,
  DEAL_TYPE_LABELS,
} from "@/lib/search/filters";

export function DealPreviewDetail({ deal }: { deal: PublicDealPreview }) {
  return (
    <article className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <DealStatusBadge status={deal.status} />
          <Badge variant="outline">
            {buyerVisibilityLabel(deal.buyerSector)} buyer
          </Badge>
          <Badge variant="secondary">{DEAL_TYPE_LABELS[deal.dealType]}</Badge>
          {deal.buyerSector !== "PUBLIC" && deal.buyerSector !== "PRIVATE" ? (
            <Badge variant="secondary">
              {BUYER_SECTOR_LABELS[deal.buyerSector]}
            </Badge>
          ) : null}
          {deal.freshnessLabel ? (
            <Badge variant="ghost">{deal.freshnessLabel}</Badge>
          ) : null}
        </div>
        <Heading>{deal.previewTitle}</Heading>
        <Text variant="muted" className="max-w-3xl">
          Sanitised preview. Buyer identity, original title, and source remain
          locked.
        </Text>
      </header>

      <section aria-labelledby="opportunity-snapshot-heading" className="flex flex-col gap-4">
        <Heading id="opportunity-snapshot-heading" level={2}>
          Opportunity snapshot
        </Heading>
        <dl className="grid gap-3 sm:grid-cols-2">
          <SnapshotItem label="Category" value={deal.mainCategory} />
          <SnapshotItem label="Region" value={deal.broadRegion} />
          <div>
            <dt className="text-[0.8125rem] font-medium text-muted-foreground">
              Value
            </dt>
            <dd className="mt-1">
              <ValueBand value={deal.valueBand} />
            </dd>
          </div>
          <div>
            <dt className="text-[0.8125rem] font-medium text-muted-foreground">
              Closing
            </dt>
            <dd className="mt-1">
              <DeadlineBand value={deal.deadlineBand} />
            </dd>
          </div>
          <SnapshotItem
            label="Contract term"
            value={deal.durationBand}
          />
          <SnapshotItem
            label="Stage"
            value={DEAL_STAGE_LABELS[deal.stage]}
          />
        </dl>
      </section>

      <section aria-labelledby="summary-heading" className="flex flex-col gap-3">
        <Heading id="summary-heading" level={2}>
          Sanitised summary
        </Heading>
        <Text variant="body" className="max-w-3xl">
          {deal.previewSummary}
        </Text>
      </section>

      <section aria-labelledby="requirements-heading" className="flex flex-col gap-3">
        <Heading id="requirements-heading" level={2}>
          General requirements
        </Heading>
        {deal.requirementsPreview.length > 0 ? (
          <ul className="max-w-3xl list-disc space-y-2 pl-5 text-[0.9375rem] leading-7">
            {deal.requirementsPreview.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        ) : (
          <Text variant="muted">
            No general requirements are listed for this preview.
          </Text>
        )}
      </section>

      <section aria-labelledby="fit-heading" className="flex flex-col gap-3">
        <Heading id="fit-heading" level={2}>
          DealAtlas fit indicators
        </Heading>
        <p className="text-[0.8125rem] leading-5 text-muted-foreground">
          These labels are DealAtlas analysis, not official procurement facts.
        </p>
        <dl className="grid gap-3 sm:grid-cols-3">
          <SnapshotItem
            label="SME suitability"
            value={levelLabel(deal.smeSuitability, "Not stated")}
          />
          <SnapshotItem
            label="Bid complexity"
            value={levelLabel(deal.bidComplexity, "Not stated")}
          />
          <SnapshotItem
            label="Competition"
            value={levelLabel(deal.competitionLevel, "Not stated")}
          />
        </dl>
        {deal.relevanceTags.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {deal.relevanceTags.map((tag) => (
              <li key={tag}>
                <Badge variant="outline">{tag}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="locked-heading" className="flex flex-col gap-3">
        <Heading id="locked-heading" level={2}>
          Locked source and buyer intelligence
        </Heading>
        <UnlockPanel />
      </section>
    </article>
  );
}

function SnapshotItem({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <dt className="text-[0.8125rem] font-medium text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-foreground">
        {value ?? "Not stated"}
      </dd>
    </div>
  );
}
