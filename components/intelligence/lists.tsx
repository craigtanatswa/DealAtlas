import type { ReactNode } from "react";
import Link from "next/link";

import { AnalysisBadge, AnalysisCaption } from "@/components/intelligence/analysis-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { Heading, Text } from "@/components/layout/heading";
import { Badge } from "@/components/ui/badge";
import { formatDealDate, formatDealMoney, formatDealValueRange } from "@/lib/deals/format";
import { appDealPath } from "@/lib/deals/paths";
import { appBuyerPath, appSupplierPath } from "@/lib/intelligence/paths";
import type {
  AwardRecordDto,
  ContractRecordDto,
  IncumbentSignalDto,
  IntelligenceDealRef,
  PaymentRecordDto,
  PerformanceRecordDto,
  RelatedProcurementDto,
  RenewalSignalDto,
} from "@/lib/intelligence/types";
import { DEAL_STATUS_LABELS, DEAL_TYPE_LABELS } from "@/lib/search/filters";

export function DealHistoryList({ deals }: { deals: IntelligenceDealRef[] }) {
  if (deals.length === 0) {
    return (
      <Text variant="muted">
        No procurement history is recorded for this organisation yet.
      </Text>
    );
  }

  return (
    <ul className="grid gap-3">
      {deals.map((deal) => (
        <li key={deal.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{DEAL_TYPE_LABELS[deal.dealType as keyof typeof DEAL_TYPE_LABELS] ?? deal.dealType}</Badge>
            <Badge variant="secondary">
              {DEAL_STATUS_LABELS[deal.status as keyof typeof DEAL_STATUS_LABELS] ?? deal.status}
            </Badge>
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">
            <Link className="hover:underline" href={appDealPath(deal.id)}>
              {deal.sourceTitle}
            </Link>
          </p>
          <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">
            {[
              deal.mainCategory,
              formatDealValueRange({
                exactValueText: null,
                valueMinExVat: deal.valueMinExVat,
                valueMaxExVat: deal.valueMaxExVat,
                currency: deal.currency,
              }),
              formatDealDate(deal.contractEndDate ?? deal.firstPublishedAt),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function AwardList({ awards, empty }: { awards: AwardRecordDto[]; empty: string }) {
  if (awards.length === 0) {
    return <Text variant="muted">{empty}</Text>;
  }

  return (
    <ul className="grid gap-3">
      {awards.map((award) => (
        <li key={award.id} className="rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            <Link className="hover:underline" href={appDealPath(award.dealId)}>
              {award.dealTitle}
            </Link>
          </p>
          <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">
            {[
              formatDealDate(award.awardDate),
              formatDealMoney(award.awardValue, award.currency),
              award.numberOfTenders != null ? `${award.numberOfTenders} tenders` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {award.suppliers.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {award.suppliers.map((supplier) => (
                <li key={supplier.id}>
                  <Link className="text-sm text-primary hover:underline" href={appSupplierPath(supplier.id)}>
                    {supplier.name}
                  </Link>
                  {supplier.awardedValue != null
                    ? ` · ${formatDealMoney(supplier.awardedValue, award.currency)}`
                    : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function IncumbentList({ items }: { items: IncumbentSignalDto[] }) {
  if (items.length === 0) {
    return (
      <Text variant="muted">
        No incumbent is recorded. DealAtlas does not infer an incumbent without an award,
        incumbent role, or related previous award.
      </Text>
    );
  }

  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li
          key={`${item.organization.id}:${item.dealId}:${item.evidence.field}`}
          className="rounded-lg border border-border px-4 py-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="text-sm font-medium text-foreground hover:underline"
              href={appSupplierPath(item.organization.id)}
            >
              {item.organization.name}
            </Link>
            <AnalysisBadge evidence={item.evidence} />
          </div>
          <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">
            <Link className="hover:underline" href={appDealPath(item.dealId)}>
              {item.dealTitle}
            </Link>
          </p>
          <AnalysisCaption evidence={item.evidence} />
        </li>
      ))}
    </ul>
  );
}

export function ContractList({
  contracts,
  empty,
}: {
  contracts: ContractRecordDto[];
  empty: string;
}) {
  if (contracts.length === 0) {
    return <Text variant="muted">{empty}</Text>;
  }

  return (
    <ul className="grid gap-3">
      {contracts.map((contract) => (
        <li key={contract.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">
            <Link className="hover:underline" href={appDealPath(contract.dealId)}>
              {contract.dealTitle}
            </Link>
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-[0.8125rem] text-muted-foreground">Start</dt>
              <dd className="text-sm">{formatDealDate(contract.startDate) ?? "Not stated"}</dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] text-muted-foreground">End</dt>
              <dd className="text-sm">{formatDealDate(contract.endDate) ?? "Not stated"}</dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] text-muted-foreground">Extension end</dt>
              <dd className="text-sm">
                {formatDealDate(contract.extensionEndDate) ?? "Not stated"}
              </dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] text-muted-foreground">Value</dt>
              <dd className="text-sm">
                {formatDealMoney(contract.currentValue ?? contract.originalValue, contract.currency) ??
                  "Not stated"}
              </dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] text-muted-foreground">Buyer</dt>
              <dd className="text-sm">
                {contract.buyer ? (
                  <Link className="hover:underline" href={appBuyerPath(contract.buyer.id)}>
                    {contract.buyer.name}
                  </Link>
                ) : (
                  "Not stated"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] text-muted-foreground">Suppliers</dt>
              <dd className="text-sm">
                {contract.suppliers.length > 0
                  ? contract.suppliers.map((supplier) => (
                      <Link
                        key={supplier.id}
                        className="mr-2 hover:underline"
                        href={appSupplierPath(supplier.id)}
                      >
                        {supplier.name}
                      </Link>
                    ))
                  : "Not stated"}
              </dd>
            </div>
          </dl>
          <PaymentList payments={contract.payments} />
          <PerformanceList records={contract.performance} />
        </li>
      ))}
    </ul>
  );
}

export function RelatedList({ items }: { items: RelatedProcurementDto[] }) {
  if (items.length === 0) {
    return (
      <Text variant="muted">
        No previous or next procurement is linked. DealAtlas only shows source related
        processes or sequenced contracts for the same buyer and category.
      </Text>
    );
  }

  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li
          key={`${item.deal.id}:${item.relationshipType}:${item.direction}`}
          className="rounded-lg border border-border px-4 py-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{item.direction}</Badge>
            <AnalysisBadge evidence={item.evidence} />
          </div>
          <p className="mt-2 text-sm font-medium">
            <Link className="hover:underline" href={appDealPath(item.deal.id)}>
              {item.deal.sourceTitle}
            </Link>
          </p>
          <AnalysisCaption evidence={item.evidence} />
        </li>
      ))}
    </ul>
  );
}

export function RenewalList({
  items,
  empty,
}: {
  items: RenewalSignalDto[];
  empty: string;
}) {
  if (items.length === 0) {
    return <EmptyState title="No evidenced renewal windows" description={empty} />;
  }

  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li key={`${item.dealId}:${item.date ?? "undated"}`} className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={item.window === "upcoming" ? "warning" : "secondary"}>
              {item.window === "undated" ? "Date not stated" : item.window}
            </Badge>
            <AnalysisBadge evidence={item.primary} />
          </div>
          <p className="mt-2 text-sm font-semibold">
            <Link className="hover:underline" href={appDealPath(item.dealId)}>
              {item.dealTitle}
            </Link>
          </p>
          {item.buyer ? (
            <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">
              <Link className="hover:underline" href={appBuyerPath(item.buyer.id)}>
                {item.buyer.name}
              </Link>
            </p>
          ) : null}
          <p className="mt-1 text-sm text-foreground">
            {item.date ? formatDealDate(item.date) : "No evidenced renewal date"}
          </p>
          <AnalysisCaption evidence={item.primary} />
          {item.incumbents.length > 0 ? (
            <p className="mt-2 text-[0.8125rem] leading-5 text-muted-foreground">
              Incumbent evidence:{" "}
              {item.incumbents.map((org) => (
                <Link key={org.id} className="mr-2 hover:underline" href={appSupplierPath(org.id)}>
                  {org.name}
                </Link>
              ))}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function PaymentList({ payments }: { payments: PaymentRecordDto[] }) {
  if (payments.length === 0) {
    return (
      <p className="mt-3 text-[0.8125rem] leading-5 text-muted-foreground">
        No payment transparency records are available.
      </p>
    );
  }

  return (
    <ul className="mt-3 grid gap-1 text-[0.8125rem] leading-5 text-muted-foreground">
      {payments.map((payment) => (
        <li key={payment.id}>
          {[
            formatDealDate(payment.paymentDate),
            formatDealMoney(payment.amountNetVat, payment.currency),
          ]
            .filter(Boolean)
            .join(" · ") || "Payment recorded without a stated date or amount"}
        </li>
      ))}
    </ul>
  );
}

export function PerformanceList({ records }: { records: PerformanceRecordDto[] }) {
  if (records.length === 0) {
    return null;
  }

  return (
    <ul className="mt-2 list-disc pl-5 text-[0.8125rem] leading-5 text-muted-foreground">
      {records.map((row) => (
        <li key={row.id}>
          {[row.kpiName, row.rating, formatDealDate(row.reportDate)]
            .filter(Boolean)
            .join(" · ") || "Performance record without stated KPI or date"}
          {row.poorPerformance ? " · Poor performance recorded" : ""}
          {row.breachReported ? " · Breach reported" : ""}
        </li>
      ))}
    </ul>
  );
}

export function IntelligenceSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <Heading id={id} level={2}>
        {title}
      </Heading>
      {children}
    </section>
  );
}
