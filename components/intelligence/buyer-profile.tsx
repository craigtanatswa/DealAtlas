import Link from "next/link";

import { MetaItem } from "@/components/intelligence/meta-item";
import {
  AwardList,
  ContractList,
  DealHistoryList,
  IncumbentList,
  IntelligenceSection,
  RelatedList,
  RenewalList,
} from "@/components/intelligence/lists";
import { ExternalSourceLink } from "@/components/deals/external-source-link";
import { Heading, Text } from "@/components/layout/heading";
import { BUYER_SECTOR_LABELS } from "@/lib/constants";
import { formatDealMoney } from "@/lib/deals/format";
import { appSupplierPath } from "@/lib/intelligence/paths";
import type { BuyerIntelligenceDto } from "@/lib/intelligence/types";

export function BuyerProfile({ intelligence }: { intelligence: BuyerIntelligenceDto }) {
  const org = intelligence.organization;

  return (
    <article className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <Heading>{org.name}</Heading>
        <Text variant="muted" className="max-w-3xl">
          Paid buyer intelligence from recorded DealAtlas procurement, awards, and
          contracts. Inferred incumbent and renewal signals are labelled DealAtlas
          analysis.
        </Text>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetaItem
            label="Sector"
            value={
              org.sector
                ? (BUYER_SECTOR_LABELS[org.sector as keyof typeof BUYER_SECTOR_LABELS] ??
                  org.sector)
                : null
            }
          />
          <MetaItem label="City" value={org.city} />
          <MetaItem label="Region" value={org.region} />
        </dl>
        {org.website ? (
          <ExternalSourceLink href={org.website}>Buyer website</ExternalSourceLink>
        ) : null}
      </header>

      <IntelligenceSection id="history-heading" title="Procurement history">
        <DealHistoryList deals={intelligence.procurementHistory} />
      </IntelligenceSection>

      <IntelligenceSection id="activity-heading" title="Category and value activity">
        {intelligence.categoryActivity.length === 0 ? (
          <Text variant="muted">No categorised procurement is recorded yet.</Text>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {intelligence.categoryActivity.map((row) => (
              <li key={row.category} className="rounded-lg border border-border px-4 py-3">
                <p className="text-sm font-medium">{row.category}</p>
                <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">
                  {row.dealCount} recorded {row.dealCount === 1 ? "deal" : "deals"}
                  {row.statedValueSum != null
                    ? ` · ${formatDealMoney(row.statedValueSum, row.currency)} stated value`
                    : ""}
                  {row.dealsMissingValue > 0
                    ? ` · ${row.dealsMissingValue} without a stated value`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        {intelligence.yearActivity.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {intelligence.yearActivity.map((row) => (
              <li
                key={row.year}
                className="rounded-full border border-border px-3 py-1 text-[0.8125rem]"
              >
                {row.year}: {row.dealCount}
              </li>
            ))}
          </ul>
        ) : null}
      </IntelligenceSection>

      <IntelligenceSection id="awards-heading" title="Related awards">
        <AwardList
          awards={intelligence.awards}
          empty="No award records are linked to this buyer yet."
        />
      </IntelligenceSection>

      <IntelligenceSection id="winners-heading" title="Winning suppliers">
        {intelligence.winningSuppliers.length === 0 ? (
          <Text variant="muted">No awarded suppliers are recorded for this buyer.</Text>
        ) : (
          <ul className="grid gap-2">
            {intelligence.winningSuppliers.map((supplier) => (
              <li key={supplier.id} className="text-sm">
                <Link className="hover:underline" href={appSupplierPath(supplier.id)}>
                  {supplier.name}
                </Link>{" "}
                · {supplier.awardCount} {supplier.awardCount === 1 ? "award" : "awards"}
              </li>
            ))}
          </ul>
        )}
      </IntelligenceSection>

      <IntelligenceSection id="incumbents-heading" title="Known incumbents">
        <IncumbentList items={intelligence.incumbents} />
      </IntelligenceSection>

      <IntelligenceSection id="contracts-heading" title="Contracts">
        <ContractList
          contracts={intelligence.contracts}
          empty="No contract start, end, or extension records are stored for this buyer."
        />
      </IntelligenceSection>

      <IntelligenceSection id="expiring-heading" title="Expiring contracts">
        <ContractList
          contracts={intelligence.expiringContracts}
          empty="No contracts with an evidenced end or extension date fall in the current window."
        />
      </IntelligenceSection>

      <IntelligenceSection id="related-heading" title="Related previous and next procurements">
        <RelatedList items={intelligence.relatedProcurements} />
      </IntelligenceSection>

      <IntelligenceSection id="renewals-heading" title="Renewal signals">
        <RenewalList
          items={intelligence.renewalSignals}
          empty="Renewal dates are shown only when a contract end, extension, source estimated renewal, next procurement date, or renewal notice exists."
        />
      </IntelligenceSection>
    </article>
  );
}
