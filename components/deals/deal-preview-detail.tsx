import type { ReactNode } from "react";
import { LockIcon } from "lucide-react";

import { DealProCard } from "@/components/deals/deal-pro-card";
import { MatchReasons } from "@/components/deals/match-reasons";
import { deadlineKeyFact, DealStatusBadge } from "@/components/deals/deal-status";
import { OpeningAlertButton } from "@/components/deals/opening-alert";
import { buyerSectorLabel, levelLabel } from "@/components/deals/types";
import { Button } from "@/components/ui/button";
import type { FoundingPublicCount } from "@/lib/billing/founding-ui";
import { signupPathWithAlert } from "@/lib/auth/redirect";
import { DISPLAY_PRICING } from "@/lib/constants";
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
import { cn } from "@/lib/utils";

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2
        id={id}
        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function FactGrid({
  cells,
}: {
  cells: { label: string; value: string | null | undefined }[];
}) {
  const visible = cells.filter((cell) => Boolean(cell.value));
  if (visible.length === 0) {
    return null;
  }
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
      {visible.map((cell) => (
        <div key={cell.label} className="bg-card p-4">
          <dt className="text-xs font-medium text-muted-foreground">
            {cell.label}
          </dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Bullets({
  items,
  className,
}: {
  items: string[];
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "space-y-2 text-[15px] leading-relaxed text-foreground/80",
        className,
      )}
    >
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <span
            aria-hidden="true"
            className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

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
    mode?: "anonymous" | "free" | "pro";
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
  const metaParts = [
    buyerLabel ? `${buyerLabel} buyer` : null,
    DEAL_TYPE_LABELS[deal.dealType],
    deal.freshnessLabel,
  ].filter((part): part is string => Boolean(part));
  const category = categoryLabel(deal.mainCategory);
  const valueBand = disclosed(deal.valueBand);
  const durationBand = disclosed(deal.durationBand);
  const specificSector = distinctSpecificSector(
    deal.specificSector,
    deal.goodsServices,
    category,
  );
  // Placeholders (UNKNOWN, Not disclosed) and duplicates are not rendered.
  const sectorChip = disclosed(deal.specificSector) ?? category;
  const isPro = unlock?.mode === "pro";
  const cardProps = {
    mode: unlock?.mode,
    loginHref: unlock?.loginHref,
    revealHref: unlock?.revealHref,
    returnTo: unlock?.returnTo,
    founding: unlock?.founding,
    alertsHref: signedIn
      ? "/app/alerts"
      : signupPathWithAlert(`/deals/${deal.slug}`),
  };
  const barLabel =
    unlock?.founding?.offered && unlock.founding.remaining > 0
      ? `Unlock with Pro · from ${DISPLAY_PRICING.foundingAnnual.replace("/year", "/yr")}`
      : `Unlock with Pro · from ${DISPLAY_PRICING.proMonthly.replace("/month", "/mo")}`;
  const specs = [
    ...deal.quantities,
    ...deal.technicalSpecs,
    ...deal.standards,
  ];
  const deliveryItems = [
    ...deal.deliveryRequirements,
    ...deal.commercialRequirements,
  ];

  return (
    <article
      className={cn(
        "grid grid-cols-1 gap-8 lg:grid-cols-[3fr_2fr] lg:gap-10",
        !isPro && "pb-24 lg:pb-0",
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <DealStatusBadge status={deal.status} deadlineBand={deal.deadlineBand} />
          {sectorChip ? (
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
              {sectorChip}
            </span>
          ) : null}
        </div>

        <h1 className="mt-3 font-heading text-2xl font-bold leading-tight tracking-tight text-wrap text-foreground sm:text-3xl">
          {deal.previewTitle}
        </h1>

        {metaParts.length > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {metaParts.join(" · ")}
          </p>
        ) : null}

        <div className="mt-4">{save}</div>
        {deal.status === "UPCOMING" ? (
          <OpeningAlertButton
            href={`/deals/${deal.slug}`}
            signedIn={Boolean(signedIn)}
            variant="page"
          />
        ) : null}

        <Section id="summary-heading" title="Requirement summary">
          <p className="text-[15px] leading-relaxed text-foreground/80 text-pretty">
            {deal.previewSummary}
          </p>
        </Section>

        <Section id="facts-heading" title="Key facts">
          <FactGrid
            cells={[
              { label: "Category", value: category },
              { label: "Region", value: disclosed(deal.broadRegion) },
              {
                label: "Value band",
                value:
                  deal.currency && valueBand
                    ? `${valueBand} (${deal.currency})`
                    : valueBand,
              },
              { label: "Duration", value: durationBand },
              {
                label: "SME suitability",
                value: disclosed(levelLabel(deal.smeSuitability, "")),
              },
              { label: "Sector", value: specificSector },
            ]}
          />
        </Section>

        <div className="mt-8 lg:hidden" id="unlock-mobile">
          <DealProCard {...cardProps} idSuffix="mobile" />
        </div>

        {deal.goodsServices.length > 0 ? (
          <Section id="goods-heading" title="Goods & services">
            <Bullets items={deal.goodsServices} />
          </Section>
        ) : null}

        <Section id="requirements-heading" title="Products and services required">
          {deal.requirementsPreview.length > 0 ? (
            <Bullets items={deal.requirementsPreview} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No general requirements are listed for this opportunity.
            </p>
          )}
        </Section>

        {specs.length > 0 ? (
          <Section id="spec-heading" title="Specs & standards">
            <Bullets items={specs} className="tabular-nums" />
          </Section>
        ) : null}

        {deliveryItems.length > 0 || deal.scope ? (
          <Section id="delivery-heading" title="Delivery & commercial terms">
            {deal.scope ? (
              <p className="text-[15px] leading-relaxed text-foreground/80 text-pretty">
                {deal.scope}
              </p>
            ) : null}
            {deliveryItems.length > 0 ? (
              <Bullets
                items={deliveryItems}
                className={deal.scope ? "mt-3" : undefined}
              />
            ) : null}
          </Section>
        ) : null}

        <Section id="fit-heading" title="Eligibility & fit">
          <FactGrid
            cells={[
              {
                label: "Bid complexity",
                value: disclosed(levelLabel(deal.bidComplexity, "")),
              },
              {
                label: "Competition",
                value: disclosed(levelLabel(deal.competitionLevel, "")),
              },
            ]}
          />
          {deal.relevanceTags.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
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
          <p className="mt-2 text-xs text-muted-foreground">
            Fit labels are DealAtlas analysis, not official procurement facts.
          </p>
          {match ? (
            <div className="mt-4">
              <MatchReasons
                score={match.score}
                reasons={match.reasons}
                caption="Relevance based on your company profile."
              />
            </div>
          ) : null}
        </Section>

        <Section id="timing-heading" title="Key timing">
          <FactGrid
            cells={[
              {
                label: keyFact?.label ?? "Tender deadline",
                value: disclosed(keyFact?.value ?? deal.deadlineBand),
              },
              {
                label: "Key dates",
                value: keyDatesRemainder(deal.keyDates, {
                  deadlineBand: deal.deadlineBand,
                  durationBand: deal.durationBand,
                }),
              },
              { label: "Stage", value: DEAL_STAGE_LABELS[deal.stage] },
            ]}
          />
        </Section>
      </div>

      <div className="hidden lg:block">
        <div className="sticky top-6">
          <DealProCard {...cardProps} idSuffix="desktop" />
        </div>
      </div>

      {!isPro ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background px-4 py-3 shadow-[0_-4px_12px_rgba(15,27,61,0.08)] lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold text-foreground">
              <LockIcon className="size-3.5 text-primary" aria-hidden="true" />
              {barLabel}
            </p>
            <Button asChild size="sm" className="h-10 shrink-0 px-4">
              <a href="#unlock-mobile">Unlock</a>
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
