import type { ReactNode } from "react";

import { MatchReasons } from "@/components/deals/match-reasons";
import { DealStatusBadge } from "@/components/deals/deal-status";
import { UnlockPanel, type UnlockCtaMode } from "@/components/deals/unlock-panel";
import {
  buyerVisibilityLabel,
  levelLabel,
} from "@/components/deals/types";
import { MetaItem } from "@/components/intelligence/meta-item";
import { Heading, Text } from "@/components/layout/heading";
import { BUYER_SECTOR_LABELS } from "@/lib/constants";
import type { PublicDealPreview } from "@/lib/search/dto";
import type { SafeMatchView } from "@/lib/matching/types";
import {
  DEAL_STAGE_LABELS,
  DEAL_TYPE_LABELS,
} from "@/lib/search/filters";

export function DealPreviewDetail({
  deal,
  match,
  save,
  unlock,
}: {
  deal: PublicDealPreview;
  match?: SafeMatchView | null;
  save?: ReactNode;
  unlock?: {
    mode?: UnlockCtaMode;
    loginHref?: string;
    revealHref?: string;
    returnTo?: string;
  };
}) {
  return (
    <article className="flex flex-col gap-10">
      <header className="flex flex-col gap-4 border-b border-border pb-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <DealStatusBadge status={deal.status} />
          <span>{buyerVisibilityLabel(deal.buyerSector)} buyer</span>
          <span>{DEAL_TYPE_LABELS[deal.dealType]}</span>
          {deal.buyerSector !== "PUBLIC" && deal.buyerSector !== "PRIVATE" ? (
            <span>{BUYER_SECTOR_LABELS[deal.buyerSector]}</span>
          ) : null}
          {deal.freshnessLabel ? <span>{deal.freshnessLabel}</span> : null}
        </div>
        <Heading>{deal.previewTitle}</Heading>
        <Text variant="muted" className="max-w-3xl">
          Join DealAtlas Pro to unlock the buyer, original title, and source for
          this opportunity.
        </Text>
        {save}
      </header>

      <section aria-labelledby="summary-heading" className="flex flex-col gap-3">
        <Heading id="summary-heading" level={2}>
          Summary
        </Heading>
        <Text variant="body" className="max-w-3xl">
          {deal.previewSummary}
        </Text>
      </section>

      <section aria-labelledby="requirements-heading" className="flex flex-col gap-3">
        <Heading id="requirements-heading" level={2}>
          Products and services required
        </Heading>
        {deal.requirementsPreview.length > 0 ? (
          <ul className="max-w-3xl list-disc space-y-2 pl-5 text-[0.9375rem] leading-7">
            {deal.requirementsPreview.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        ) : (
          <Text variant="muted">
            No general requirements are listed for this opportunity.
          </Text>
        )}
      </section>

      <section aria-labelledby="opportunity-snapshot-heading" className="flex flex-col gap-4">
        <Heading id="opportunity-snapshot-heading" level={2}>
          Opportunity details
        </Heading>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetaItem label="Category" value={deal.mainCategory} />
          <MetaItem label="Location" value={deal.broadRegion} />
          <MetaItem label="Value" value={deal.valueBand} />
          <MetaItem label="Deadline" value={deal.deadlineBand} />
          <MetaItem label="Contract term" value={deal.durationBand} />
          <MetaItem label="Stage" value={DEAL_STAGE_LABELS[deal.stage]} />
        </dl>
      </section>

      <section aria-labelledby="fit-heading" className="flex flex-col gap-3">
        <Heading id="fit-heading" level={2}>
          Eligibility and fit
        </Heading>
        <p className="text-[0.8125rem] leading-5 text-muted-foreground">
          These labels are DealAtlas analysis, not official procurement facts.
        </p>
        <dl className="grid gap-3 sm:grid-cols-3">
          <MetaItem
            label="SME suitability"
            value={levelLabel(deal.smeSuitability, "Not stated")}
          />
          <MetaItem
            label="Bid complexity"
            value={levelLabel(deal.bidComplexity, "Not stated")}
          />
          <MetaItem
            label="Competition"
            value={levelLabel(deal.competitionLevel, "Not stated")}
          />
        </dl>
        {deal.relevanceTags.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {deal.relevanceTags.map((tag) => (
              <li
                key={tag}
                className="rounded-md bg-muted px-2 py-0.5 text-[0.8125rem] leading-5 text-muted-foreground"
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
        {match ? (
          <MatchReasons
            score={match.score}
            reasons={match.reasons}
            caption="Relevance based on your company profile."
          />
        ) : null}
      </section>

      <section aria-labelledby="locked-heading" className="flex flex-col gap-3">
        <Heading id="locked-heading" level={2}>
          Source information
        </Heading>
        <Text variant="muted" className="max-w-3xl">
          Join DealAtlas Pro to unlock buyer, notice, and application details.
        </Text>
        <UnlockPanel
          mode={unlock?.mode}
          loginHref={unlock?.loginHref}
          revealHref={unlock?.revealHref}
          returnTo={unlock?.returnTo}
        />
      </section>
    </article>
  );
}
