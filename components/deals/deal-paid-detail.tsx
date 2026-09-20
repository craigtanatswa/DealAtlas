import type { ReactNode } from "react";
import Link from "next/link";

import { DealHistorySections } from "@/components/intelligence/deal-history";
import { DealStatusBadge } from "@/components/deals/deal-status";
import { ExternalSourceLink } from "@/components/deals/external-source-link";
import { MatchReasons } from "@/components/deals/match-reasons";
import { EmptyState } from "@/components/feedback/empty-state";
import { Heading, Text } from "@/components/layout/heading";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { BUYER_SECTOR_LABELS } from "@/lib/constants";
import {
  formatDealDate,
  formatDealDateTime,
  formatDealMoney,
  formatDealValueRange,
  REQUIREMENT_TYPE_LABELS,
  yesNoLabel,
} from "@/lib/deals/format";
import { reuseStatusLabel } from "@/lib/deals/licence";
import type { PaidDealDto, PaidIntelligenceDto, PaidIntelligenceFieldDto, PaidLotDto, PaidRequirementDto } from "@/lib/deals/paid-dto";
import type { DealHistoryDto } from "@/lib/intelligence/types";
import { appBuyerPath } from "@/lib/intelligence/paths";
import type { ProMatchView } from "@/lib/matching/types";
import {
  DEAL_STAGE_LABELS,
  DEAL_TYPE_LABELS,
} from "@/lib/search/filters";

export function DealPaidDetail({
  deal,
  history,
  match,
  save,
  exportCsv,
}: {
  deal: PaidDealDto;
  history?: DealHistoryDto | null;
  match?: ProMatchView | null;
  save?: ReactNode;
  exportCsv?: ReactNode;
}) {
  const withheld = deal.provenance.contentAccess === "withhold";
  const value = formatDealValueRange({
    exactValueText: deal.exactValueText,
    valueMinExVat: deal.valueMinExVat,
    valueMaxExVat: deal.valueMaxExVat,
    currency: deal.currency,
  });

  return (
    <article className="flex flex-col gap-10">
      <header className="flex flex-col gap-4 border-b border-border pb-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <DealStatusBadge status={deal.status} />
          <span>{DEAL_TYPE_LABELS[deal.dealType]}</span>
          <span>{BUYER_SECTOR_LABELS[deal.buyerSector]}</span>
          <span>{DEAL_STAGE_LABELS[deal.stage]}</span>
        </div>
        <Heading className="max-w-4xl">{deal.sourceTitle}</Heading>
        {deal.buyer ? (
          <Text variant="muted" className="max-w-3xl">
            <Link className="hover:underline" href={appBuyerPath(deal.buyer.id)}>
              {deal.buyer.name}
            </Link>
            {deal.buyer.city ? ` · ${deal.buyer.city}` : null}
            {deal.buyer.region ? ` · ${deal.buyer.region}` : null}
          </Text>
        ) : null}
        {deal.reference ? (
          <p className="text-[0.8125rem] leading-5 text-muted-foreground">
            Reference {deal.reference}
            {deal.ocid ? ` · ${deal.ocid}` : null}
          </p>
        ) : null}
      </header>

      <section
        aria-labelledby="paid-actions-heading"
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
      >
        <Heading id="paid-actions-heading" level={2} className="text-xl md:text-xl">
          Status, value, and source
        </Heading>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SnapshotItem label="Exact value" value={value} />
          <SnapshotItem
            label="Submission deadline"
            value={formatDealDateTime(deal.submissionDeadline)}
          />
          <SnapshotItem
            label="Enquiry deadline"
            value={formatDealDateTime(deal.enquiryDeadline)}
          />
          <SnapshotItem label="Location" value={deal.exactLocationText} />
          <SnapshotItem
            label="Procurement method"
            value={deal.procurementMethod}
          />
          {deal.mainCategory ? (
            <SnapshotItem label="Category" value={deal.mainCategory} />
          ) : null}
          <SnapshotItem
            label="First published"
            value={formatDealDate(deal.firstPublishedAt)}
          />
          <SnapshotItem
            label="Source updated"
            value={formatDealDate(deal.latestSourceAt)}
          />
        </dl>
        <div className="flex flex-wrap gap-3">
          {save}
          {exportCsv}
          <ExternalSourceLink href={deal.sourceUrl} variant="default">
            Open source notice
          </ExternalSourceLink>
          <ExternalSourceLink href={deal.applicationUrl}>
            Open application
          </ExternalSourceLink>
        </div>
        <p className="text-[0.8125rem] leading-5 text-muted-foreground">
          Source and application links open the original site in a new tab.
          DealAtlas does not host the official notice.
        </p>
      </section>

      {withheld ? (
        <EmptyState
          kind="paidDataUnavailable"
          title="Source content is withheld"
          description={deal.provenance.summary}
        >
          <ExternalSourceLink href={deal.sourceUrl} variant="default">
            Open original source
          </ExternalSourceLink>
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="summary-heading" className="flex flex-col gap-3">
            <Heading id="summary-heading" level={2}>
              Executive summary
            </Heading>
            {deal.sourceDescription ? (
              <Text variant="body" className="max-w-3xl whitespace-pre-wrap">
                {deal.sourceDescription}
              </Text>
            ) : (
              <div className="flex flex-col gap-3">
                <Text variant="muted" className="max-w-3xl">
                  {deal.provenance.summary}
                </Text>
                <ExternalSourceLink href={deal.sourceUrl}>
                  Read the official description
                </ExternalSourceLink>
              </div>
            )}
          </section>

          {deal.intelligence ? <IntelligenceSection intelligence={deal.intelligence} /> : null}

          {match ? (
            <MatchReasons
              score={match.score}
              reasons={match.reasons}
              mismatches={match.mismatches}
              caption="DealAtlas relevance against your company profile. Mismatch notes may use protected requirement types, not original notice wording."
            />
          ) : null}

          <section aria-labelledby="contact-heading" className="flex flex-col gap-3">
            <Heading id="contact-heading" level={2}>
              Procurement contact
            </Heading>
            {deal.procurementContact ? (
              <dl className="grid gap-3 sm:grid-cols-2">
                <SnapshotItem label="Name" value={deal.procurementContact.name} />
                <SnapshotItem label="Email" value={deal.procurementContact.email} />
                <SnapshotItem label="Phone" value={deal.procurementContact.phone} />
                <SnapshotItem label="City" value={deal.procurementContact.city} />
              </dl>
            ) : (
              <Text variant="muted">
                No procurement contact was published for supplier use on this
                notice.
              </Text>
            )}
            {deal.buyer?.website ? (
              <ExternalSourceLink href={deal.buyer.website}>
                Buyer website
              </ExternalSourceLink>
            ) : null}
          </section>

          <RequirementsSection requirements={deal.requirements} />
          <LotsSection lots={deal.lots} />
          <AwardCriteriaSection deal={deal} />
          <DocumentsSection deal={deal} />
          {history ? <DealHistorySections history={history} /> : null}
          <TimelineSection deal={deal} />
        </>
      )}

      <ProvenanceSection deal={deal} />
    </article>
  );
}

function RequirementsSection({
  requirements,
}: {
  requirements: PaidRequirementDto[];
}) {
  return (
    <section aria-labelledby="requirements-heading" className="flex flex-col gap-3">
      <Heading id="requirements-heading" level={2}>
        Requirements
      </Heading>
      {requirements.length === 0 ? (
        <Text variant="muted">No structured requirements are recorded yet.</Text>
      ) : (
        <ul className="grid gap-3">
          {requirements.map((requirement) => (
            <li
              key={requirement.id}
              className="rounded-lg border border-border bg-muted/30 px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">
                  {requirement.name}
                </p>
                <Badge variant="outline">
                  {REQUIREMENT_TYPE_LABELS[
                    requirement.requirementType as keyof typeof REQUIREMENT_TYPE_LABELS
                  ] ?? requirement.requirementType}
                </Badge>
                {requirement.mandatory ? (
                  <Badge variant="secondary">Mandatory</Badge>
                ) : null}
                {requirement.isInferred ? (
                  <Badge variant="ghost">DealAtlas inference</Badge>
                ) : null}
              </div>
              {requirement.description ? (
                <p className="mt-2 text-[0.9375rem] leading-7 text-muted-foreground">
                  {requirement.description}
                </p>
              ) : null}
              {requirement.evidenceRequired ? (
                <p className="mt-2 text-[0.8125rem] leading-5 text-muted-foreground">
                  Evidence: {requirement.evidenceRequired}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LotsSection({ lots }: { lots: PaidLotDto[] }) {
  return (
    <section aria-labelledby="lots-heading" className="flex flex-col gap-3">
      <Heading id="lots-heading" level={2}>
        Lots
      </Heading>
      {lots.length === 0 ? (
        <Text variant="muted">This opportunity is not split into lots.</Text>
      ) : (
        <ul className="grid gap-3">
          {lots.map((lot) => {
            const value =
              formatDealMoney(lot.valueMin, lot.currency) &&
              formatDealMoney(lot.valueMax, lot.currency) &&
              formatDealMoney(lot.valueMin, lot.currency) !==
                formatDealMoney(lot.valueMax, lot.currency)
                ? `${formatDealMoney(lot.valueMin, lot.currency)}–${formatDealMoney(lot.valueMax, lot.currency)}`
                : formatDealMoney(lot.valueMin, lot.currency) ??
                  formatDealMoney(lot.valueMax, lot.currency);

            return (
              <li
                key={lot.id}
                className="rounded-lg border border-border bg-card p-4 shadow-sm"
              >
                <p className="text-sm font-semibold text-foreground">
                  {lot.lotNumber ? `Lot ${lot.lotNumber}` : "Lot"}
                  {lot.sourceTitle ? `: ${lot.sourceTitle}` : ""}
                </p>
                {lot.sourceDescription ? (
                  <p className="mt-2 text-[0.9375rem] leading-7 text-muted-foreground">
                    {lot.sourceDescription}
                  </p>
                ) : null}
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <SnapshotItem label="Value" value={value} />
                  <SnapshotItem
                    label="Submission deadline"
                    value={formatDealDateTime(lot.submissionDeadline)}
                  />
                  <SnapshotItem label="Location" value={lot.exactLocationText} />
                  <SnapshotItem
                    label="SME suitable"
                    value={yesNoLabel(lot.smeSuitable)}
                  />
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AwardCriteriaSection({ deal }: { deal: PaidDealDto }) {
  return (
    <section aria-labelledby="criteria-heading" className="flex flex-col gap-3">
      <Heading id="criteria-heading" level={2}>
        Award criteria
      </Heading>
      {deal.awardCriteria.length === 0 ? (
        <Text variant="muted">No award criteria are recorded yet.</Text>
      ) : (
        <ol className="grid gap-3">
          {deal.awardCriteria.map((criterion, index) => (
            <li
              key={criterion.id}
              className="rounded-lg border border-border bg-muted/30 px-4 py-3"
            >
              <p className="text-sm font-medium text-foreground">
                {index + 1}. {criterion.name}
                {criterion.weightPercent !== null
                  ? ` · ${criterion.weightPercent}%`
                  : ""}
              </p>
              {criterion.description ? (
                <p className="mt-2 text-[0.9375rem] leading-7 text-muted-foreground">
                  {criterion.description}
                </p>
              ) : null}
              {criterion.criterionType ? (
                <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">
                  {criterion.criterionType}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DocumentsSection({ deal }: { deal: PaidDealDto }) {
  return (
    <section aria-labelledby="documents-heading" className="flex flex-col gap-3">
      <Heading id="documents-heading" level={2}>
        Documents
      </Heading>
      <Text variant="muted" className="max-w-3xl">
        DealAtlas links to original documents where linking is permitted. File
        contents are not copied onto this page.
      </Text>
      {deal.documents.length === 0 ? (
        <Text variant="muted">No source documents are listed.</Text>
      ) : (
        <ul className="grid gap-3">
          {deal.documents.map((document) => (
            <li
              key={document.id}
              className="flex flex-col gap-2 rounded-lg border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {document.name ?? "Source document"}
                </p>
                <p className="text-[0.8125rem] leading-5 text-muted-foreground">
                  {document.documentType ?? "Document"}
                  {document.publishedAt
                    ? ` · ${formatDealDateTime(document.publishedAt)}`
                    : ""}
                </p>
              </div>
              {document.access === "link" ? (
                <ExternalSourceLink href={document.sourceUrl}>
                  Open original document
                </ExternalSourceLink>
              ) : (
                <p className="text-[0.8125rem] leading-5 text-muted-foreground">
                  Linking is not permitted for this file.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TimelineSection({ deal }: { deal: PaidDealDto }) {
  return (
    <section aria-labelledby="timeline-heading" className="flex flex-col gap-3">
      <Heading id="timeline-heading" level={2}>
        Lifecycle timeline
      </Heading>
      {deal.timeline.length === 0 ? (
        <Text variant="muted">No dated lifecycle events are recorded yet.</Text>
      ) : (
        <ol className="relative flex flex-col gap-4 border-l border-border pl-4">
          {deal.timeline.map((event) => (
            <li key={event.id} className="flex flex-col gap-1">
              <p className="text-[0.8125rem] font-medium text-muted-foreground">
                {formatDealDateTime(event.occurredAt) ?? event.occurredAt}
              </p>
              <p className="text-sm font-medium text-foreground">{event.label}</p>
              {event.detail ? (
                <p className="text-[0.8125rem] leading-5 text-muted-foreground">
                  {event.detail}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ProvenanceSection({ deal }: { deal: PaidDealDto }) {
  return (
    <section aria-labelledby="provenance-heading">
      <Card>
        <CardHeader>
          <Heading id="provenance-heading" level={2} className="text-xl md:text-xl">
            Source provenance
          </Heading>
          <CardDescription>
            Paid-only record of where this opportunity came from and how DealAtlas
            is allowed to present it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-[0.9375rem] leading-7 text-muted-foreground">
            {deal.provenance.summary}
          </p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <SnapshotItem label="Source" value={deal.provenance.sourceName} />
            <SnapshotItem label="Source type" value={deal.provenance.sourceType} />
            <SnapshotItem
              label="Reuse status"
              value={reuseStatusLabel(deal.provenance.reuseStatus)}
            />
            <SnapshotItem
              label="Licence"
              value={deal.provenance.licenceName}
            />
          </dl>
          <div className="flex flex-wrap gap-3">
            <ExternalSourceLink href={deal.provenance.licenceUrl}>
              Open licence
            </ExternalSourceLink>
            <ExternalSourceLink href={deal.provenance.termsUrl}>
              Open source terms
            </ExternalSourceLink>
            <ExternalSourceLink href={deal.sourceUrl}>
              Open original source
            </ExternalSourceLink>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function formatIntelligenceValue(field: PaidIntelligenceFieldDto): string | null {
  if (Array.isArray(field.value)) {
    return field.value.length > 0 ? field.value.join("; ") : null;
  }
  return field.value;
}

function IntelligenceSection({ intelligence }: { intelligence: PaidIntelligenceDto }) {
  const confidence =
    intelligence.overallConfidence != null
      ? `${Math.round(intelligence.overallConfidence * 100)}%`
      : null;

  return (
    <section aria-labelledby="analysis-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Heading id="analysis-heading" level={2}>
          DealAtlas analysis
        </Heading>
        <Badge variant="secondary">Inferred</Badge>
      </div>
      <Text variant="muted" className="max-w-3xl">
        These fields are DealAtlas inference, not official source facts. Source
        title, description, value and dates remain in the sections above.
      </Text>
      <dl className="grid gap-3 sm:grid-cols-2">
        <SnapshotItem label="Summary" value={formatIntelligenceValue(intelligence.summary)} />
        <SnapshotItem label="Buyer need" value={formatIntelligenceValue(intelligence.buyerNeed)} />
        <SnapshotItem
          label="Ideal supplier"
          value={formatIntelligenceValue(intelligence.idealSupplier)}
        />
        <SnapshotItem
          label="SME accessibility"
          value={formatIntelligenceValue(intelligence.smeAccessibility)}
        />
        <SnapshotItem
          label="Bid complexity"
          value={formatIntelligenceValue(intelligence.bidComplexity)}
        />
        <SnapshotItem
          label="Competition"
          value={formatIntelligenceValue(intelligence.competitionLevel)}
        />
        <SnapshotItem
          label="Deadline urgency"
          value={formatIntelligenceValue(intelligence.deadlineUrgency)}
        />
        <SnapshotItem
          label="Model / confidence"
          value={[intelligence.modelVersion, confidence].filter(Boolean).join(" · ") || null}
        />
      </dl>
      {intelligence.riskFlags.value && Array.isArray(intelligence.riskFlags.value) ? (
        <ul className="list-disc pl-5 text-[0.9375rem] leading-7 text-foreground">
          {intelligence.riskFlags.value.map((flag) => (
            <li key={flag}>{flag}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SnapshotItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
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
