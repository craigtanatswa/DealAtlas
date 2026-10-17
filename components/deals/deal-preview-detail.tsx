import type { ReactNode } from "react";

import { MatchReasons } from "@/components/deals/match-reasons";
import { deadlineKeyFact, DealStatusBadge } from "@/components/deals/deal-status";
import { OpeningAlertButton } from "@/components/deals/opening-alert";
import { UnlockPanel, type UnlockCtaMode } from "@/components/deals/unlock-panel";
import {
  buyerSectorLabel,
  levelLabel,
} from "@/components/deals/types";
import { MetaItem } from "@/components/intelligence/meta-item";
import { Heading, Text } from "@/components/layout/heading";
import type { FoundingPublicCount } from "@/lib/billing/founding-ui";
import {
  categoryLabel,
  disclosed,
  distinctSpecificSector,
  keyDatesRemainder,
} from "@/lib/preview/display";
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
  signedIn = false,
}: {
  deal: PublicDealPreview;
  match?: SafeMatchView | null;
  save?: ReactNode;
  unlock?: {
    mode?: UnlockCtaMode;
    loginHref?: string;
    revealHref?: string;
    returnTo?: string;
    founding?: FoundingPublicCount;
  };
  signedIn?: boolean;
}) {
  const keyFact = deadlineKeyFact({
    status: deal.status,
    deadlineBand: deal.deadlineBand,
  });
  const buyerLabel = buyerSectorLabel(deal.buyerSector, deal.dealType);
  const category = categoryLabel(deal.mainCategory);
  const valueBand = disclosed(deal.valueBand);
  const durationBand = disclosed(deal.durationBand);
  const deadlineValue = disclosed(keyFact?.value ?? deal.deadlineBand);
  // Placeholders (UNKNOWN, Not disclosed) and duplicates are not rendered.
  const details: Array<[string, string | null]> = [
    ["Sector", distinctSpecificSector(deal.specificSector, deal.goodsServices, category)],
    ["Category", category],
    ["Region", disclosed(deal.broadRegion)],
    ["Value", valueBand && deal.currency ? `${valueBand} (${deal.currency})` : valueBand],
    [keyFact?.label ?? "Deadline", deadlineValue],
    [
      "Key dates",
      keyDatesRemainder(deal.keyDates, {
        deadlineBand: deal.deadlineBand,
        durationBand: deal.durationBand,
      }),
    ],
    ["Contract term", durationBand],
    ["Stage", DEAL_STAGE_LABELS[deal.stage]],
  ];
  const fit: Array<[string, string | null]> = [
    ["SME suitability", disclosed(levelLabel(deal.smeSuitability, ""))],
    ["Bid complexity", disclosed(levelLabel(deal.bidComplexity, ""))],
    ["Competition", disclosed(levelLabel(deal.competitionLevel, ""))],
  ];
  const visibleFit = fit.filter(([, value]) => value);
  return (
    <article className="flex flex-col gap-10">
      <header className="flex flex-col gap-4 border-b border-border pb-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <DealStatusBadge status={deal.status} deadlineBand={deal.deadlineBand} />
          {buyerLabel ? <span>{buyerLabel} buyer</span> : null}
          <span>{DEAL_TYPE_LABELS[deal.dealType]}</span>
          {deal.freshnessLabel ? <span>{deal.freshnessLabel}</span> : null}
        </div>
        <Heading>{deal.previewTitle}</Heading>
        <Text variant="muted" className="max-w-3xl">
          Join DealAtlas Pro to unlock the buyer, original title, and source for
          this opportunity.
        </Text>
        {save}
        {deal.status === "UPCOMING" ? (
          <OpeningAlertButton
            href={`/deals/${deal.slug}`}
            signedIn={Boolean(signedIn)}
            variant="page"
          />
        ) : null}
      </header>

      <section aria-labelledby="summary-heading" className="flex flex-col gap-3">
        <Heading id="summary-heading" level={2}>
          Summary
        </Heading>
        <Text variant="body" className="max-w-3xl text-pretty">
          {deal.previewSummary}
        </Text>
      </section>

      {deal.goodsServices.length > 0 ? (
        <section aria-labelledby="goods-heading" className="flex flex-col gap-3">
          <Heading id="goods-heading" level={2}>
            Goods and services
          </Heading>
          <ul className="max-w-3xl list-disc space-y-2 pl-5 text-[0.9375rem] leading-7">
            {deal.goodsServices.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

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
          {details
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <MetaItem key={label} label={label} value={value} />
            ))}
        </dl>
      </section>

      {deal.quantities.length > 0 || deal.technicalSpecs.length > 0 || deal.standards.length > 0 ? (
        <section aria-labelledby="spec-heading" className="flex flex-col gap-3">
          <Heading id="spec-heading" level={2}>
            Quantities, specifications and standards
          </Heading>
          <ul className="max-w-3xl list-disc space-y-2 pl-5 text-[0.9375rem] leading-7 tabular-nums">
            {[...deal.quantities, ...deal.technicalSpecs, ...deal.standards].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {deal.deliveryRequirements.length > 0 || deal.scope || deal.commercialRequirements.length > 0 ? (
        <section aria-labelledby="delivery-heading" className="flex flex-col gap-3">
          <Heading id="delivery-heading" level={2}>
            Delivery, scope and commercial terms
          </Heading>
          {deal.scope ? <Text variant="body" className="max-w-3xl text-pretty">{deal.scope}</Text> : null}
          <ul className="max-w-3xl list-disc space-y-2 pl-5 text-[0.9375rem] leading-7">
            {[...deal.deliveryRequirements, ...deal.commercialRequirements].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="fit-heading" className="flex flex-col gap-3">
        <Heading id="fit-heading" level={2}>
          Eligibility and fit
        </Heading>
        <p className="text-[0.8125rem] leading-5 text-muted-foreground">
          These labels are DealAtlas analysis, not official procurement facts.
        </p>
        {visibleFit.length > 0 ? (
          <dl className="grid gap-3 sm:grid-cols-3">
            {visibleFit.map(([label, value]) => (
              <MetaItem key={label} label={label} value={value} />
            ))}
          </dl>
        ) : null}
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
          founding={unlock?.founding}
          hasScope={deal.requirementsPreview.length > 0}
        />
      </section>
    </article>
  );
}
