import Link from "next/link";

import { MetaItem } from "@/components/intelligence/meta-item";
import {
  AwardList,
  ContractList,
  IncumbentList,
  IntelligenceSection,
  PaymentList,
  PerformanceList,
  RenewalList,
} from "@/components/intelligence/lists";
import { ExternalSourceLink } from "@/components/deals/external-source-link";
import { Heading, Text } from "@/components/layout/heading";
import { formatDealMoney, yesNoLabel } from "@/lib/deals/format";
import { appBuyerPath } from "@/lib/intelligence/paths";
import type { SupplierIntelligenceDto } from "@/lib/intelligence/types";

export function SupplierProfile({ intelligence }: { intelligence: SupplierIntelligenceDto }) {
  const org = intelligence.organization;

  return (
    <article className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <Heading>{org.name}</Heading>
        <Text variant="muted" className="max-w-3xl">
          Paid supplier and competitor history from recorded awards and contracts.
          Incumbent and renewal inferences are labelled DealAtlas analysis.
        </Text>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetaItem label="SME" value={yesNoLabel(org.isSme)} />
          <MetaItem label="City" value={org.city} />
          <MetaItem label="Region" value={org.region} />
        </dl>
        {org.website ? (
          <ExternalSourceLink href={org.website}>Supplier website</ExternalSourceLink>
        ) : null}
      </header>

      <IntelligenceSection id="awards-heading" title="Award history">
        <AwardList
          awards={intelligence.awards}
          empty="No awards naming this organisation are recorded."
        />
      </IntelligenceSection>

      <IntelligenceSection id="buyers-heading" title="Buyers awarded against">
        {intelligence.buyers.length === 0 ? (
          <Text variant="muted">No awarding buyers are recorded for this supplier.</Text>
        ) : (
          <ul className="grid gap-2">
            {intelligence.buyers.map((buyer) => (
              <li key={buyer.id} className="text-sm">
                <Link className="hover:underline" href={appBuyerPath(buyer.id)}>
                  {buyer.name}
                </Link>{" "}
                · {buyer.awardCount} {buyer.awardCount === 1 ? "award" : "awards"}
              </li>
            ))}
          </ul>
        )}
      </IntelligenceSection>

      <IntelligenceSection id="activity-heading" title="Category activity">
        {intelligence.categoryActivity.length === 0 ? (
          <Text variant="muted">No categorised awards are recorded yet.</Text>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {intelligence.categoryActivity.map((row) => (
              <li key={row.category} className="rounded-lg border border-border px-4 py-3">
                <p className="text-sm font-medium">{row.category}</p>
                <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">
                  {row.dealCount} recorded {row.dealCount === 1 ? "deal" : "deals"}
                  {row.statedValueSum != null
                    ? ` · ${formatDealMoney(row.statedValueSum, row.currency)}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </IntelligenceSection>

      <IntelligenceSection id="competitors-heading" title="Competitor awards on shared deals">
        <AwardList
          awards={intelligence.competitorAwards}
          empty="No other awarded suppliers are recorded on the same deals."
        />
      </IntelligenceSection>

      <IntelligenceSection id="incumbents-heading" title="Incumbent positions">
        <IncumbentList items={intelligence.incumbents} />
      </IntelligenceSection>

      <IntelligenceSection id="contracts-heading" title="Contracts">
        <ContractList
          contracts={intelligence.contracts}
          empty="No contracts naming this supplier are recorded."
        />
      </IntelligenceSection>

      <IntelligenceSection id="performance-heading" title="Payment and performance">
        {intelligence.payments.length === 0 && intelligence.performance.length === 0 ? (
          <Text variant="muted">
            No payment or performance records are available for this supplier.
          </Text>
        ) : (
          <div>
            <PaymentList payments={intelligence.payments} />
            {intelligence.performance.length === 0 ? (
              <p className="mt-2 text-[0.8125rem] leading-5 text-muted-foreground">
                No performance records are available.
              </p>
            ) : (
              <PerformanceList records={intelligence.performance} />
            )}
          </div>
        )}
      </IntelligenceSection>

      <IntelligenceSection id="renewals-heading" title="Related renewal signals">
        <RenewalList
          items={intelligence.renewalSignals}
          empty="No evidenced upcoming renewal is linked to this supplier as an incumbent."
        />
      </IntelligenceSection>
    </article>
  );
}
