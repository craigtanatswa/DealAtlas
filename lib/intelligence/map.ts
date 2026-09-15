import { aggregateCategoryActivity, aggregateYearActivity } from "@/lib/intelligence/activity";
import { classifyIncumbents, winningSuppliersFromAwards } from "@/lib/intelligence/incumbents";
import { relateProcurements } from "@/lib/intelligence/related";
import {
  buildRenewalSignal,
  contractExpiryFacts,
  dealDateFacts,
  insightRenewalFact,
  isRenewalDateInScope,
  type RenewalDateFact,
} from "@/lib/intelligence/renewals";
import type {
  AwardRecordDto,
  ContractRecordDto,
  IntelligenceDealRef,
  IntelligenceOrgRef,
  PaymentRecordDto,
  PerformanceRecordDto,
  RenewalSignalDto,
} from "@/lib/intelligence/types";

export type MappedDeal = IntelligenceDealRef & {
  buyerOrganizationId: string | null;
};

export type MappedOrg = IntelligenceOrgRef & {
  sector: string | null;
  website: string | null;
  domain: string | null;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  isSme: boolean | null;
};

export function mapDealRef(row: {
  id: string;
  source_title: string;
  buyer_organization_id: string | null;
  deal_type: string;
  buyer_sector: string;
  stage: string;
  status: string;
  main_category: string | null;
  currency: string | null;
  value_min_ex_vat: number | null;
  value_max_ex_vat: number | null;
  award_decision_date: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  extension_end_date: string | null;
  next_procurement_date: string | null;
  estimated_renewal_date: string | null;
  first_published_at: string | null;
}): MappedDeal {
  return {
    id: row.id,
    sourceTitle: row.source_title,
    status: row.status,
    stage: row.stage,
    dealType: row.deal_type,
    mainCategory: row.main_category,
    buyerSector: row.buyer_sector,
    currency: row.currency,
    valueMinExVat: row.value_min_ex_vat,
    valueMaxExVat: row.value_max_ex_vat,
    firstPublishedAt: row.first_published_at,
    contractStartDate: row.contract_start_date,
    contractEndDate: row.contract_end_date,
    extensionEndDate: row.extension_end_date,
    nextProcurementDate: row.next_procurement_date,
    estimatedRenewalDate: row.estimated_renewal_date,
    awardDecisionDate: row.award_decision_date,
    buyerOrganizationId: row.buyer_organization_id,
  };
}

export function mapOrg(row: {
  id: string;
  canonical_name: string;
  buyer_sector?: string | null;
  website?: string | null;
  domain?: string | null;
  city?: string | null;
  region?: string | null;
  country_code?: string | null;
  is_sme?: boolean | null;
}): MappedOrg {
  return {
    id: row.id,
    name: row.canonical_name,
    sector: row.buyer_sector ?? null,
    website: row.website ?? null,
    domain: row.domain ?? null,
    city: row.city ?? null,
    region: row.region ?? null,
    countryCode: row.country_code ?? null,
    isSme: row.is_sme ?? null,
  };
}

export function mapAwards(input: {
  awards: Array<{
    id: string;
    deal_id: string;
    award_identifier: string | null;
    award_date: string | null;
    award_value: number | null;
    currency: string | null;
    number_of_tenders: number | null;
  }>;
  suppliers: Array<{
    award_id: string;
    organization_id: string;
    awarded_value: number | null;
  }>;
  deals: Map<string, MappedDeal>;
  organizations: Map<string, IntelligenceOrgRef>;
}): AwardRecordDto[] {
  const suppliersByAward = new Map<string, AwardRecordDto["suppliers"]>();
  for (const row of input.suppliers) {
    const org = input.organizations.get(row.organization_id);
    if (!org) {
      continue;
    }
    const list = suppliersByAward.get(row.award_id) ?? [];
    list.push({ ...org, awardedValue: row.awarded_value });
    suppliersByAward.set(row.award_id, list);
  }

  return input.awards.flatMap((award) => {
    const deal = input.deals.get(award.deal_id);
    if (!deal) {
      return [];
    }
    return [
      {
        id: award.id,
        dealId: award.deal_id,
        dealTitle: deal.sourceTitle,
        awardIdentifier: award.award_identifier,
        awardDate: award.award_date,
        awardValue: award.award_value,
        currency: award.currency,
        numberOfTenders: award.number_of_tenders,
        suppliers: suppliersByAward.get(award.id) ?? [],
      },
    ];
  });
}

export function mapContracts(input: {
  contracts: Array<{
    id: string;
    deal_id: string;
    contract_identifier: string | null;
    signed_date: string | null;
    start_date: string | null;
    end_date: string | null;
    extension_end_date: string | null;
    original_value: number | null;
    current_value: number | null;
    currency: string | null;
    status: string | null;
  }>;
  deals: Map<string, MappedDeal>;
  organizations: Map<string, IntelligenceOrgRef>;
  awards: AwardRecordDto[];
  payments: Array<{
    id: string;
    contract_id: string;
    payment_date: string | null;
    amount_net_vat: number | null;
    currency: string | null;
  }>;
  performance: Array<{
    id: string;
    contract_id: string;
    report_date: string | null;
    kpi_name: string | null;
    rating: string | null;
    poor_performance: boolean | null;
    breach_reported: boolean | null;
  }>;
}): ContractRecordDto[] {
  const awardsByDeal = new Map<string, AwardRecordDto[]>();
  for (const award of input.awards) {
    const list = awardsByDeal.get(award.dealId) ?? [];
    list.push(award);
    awardsByDeal.set(award.dealId, list);
  }
  const paymentsByContract = new Map<string, PaymentRecordDto[]>();
  for (const payment of input.payments) {
    const list = paymentsByContract.get(payment.contract_id) ?? [];
    list.push({
      id: payment.id,
      paymentDate: payment.payment_date,
      amountNetVat: payment.amount_net_vat,
      currency: payment.currency,
    });
    paymentsByContract.set(payment.contract_id, list);
  }
  const performanceByContract = new Map<string, PerformanceRecordDto[]>();
  for (const row of input.performance) {
    const list = performanceByContract.get(row.contract_id) ?? [];
    list.push({
      id: row.id,
      reportDate: row.report_date,
      kpiName: row.kpi_name,
      rating: row.rating,
      poorPerformance: row.poor_performance,
      breachReported: row.breach_reported,
    });
    performanceByContract.set(row.contract_id, list);
  }

  return input.contracts.flatMap((contract) => {
    const deal = input.deals.get(contract.deal_id);
    if (!deal) {
      return [];
    }
    const buyer = deal.buyerOrganizationId
      ? (input.organizations.get(deal.buyerOrganizationId) ?? null)
      : null;
    const suppliers = [
      ...new Map(
        (awardsByDeal.get(deal.id) ?? [])
          .flatMap((award) => award.suppliers)
          .map((supplier) => [supplier.id, supplier] as const),
      ).values(),
    ].map((supplier) => ({ id: supplier.id, name: supplier.name }));

    return [
      {
        id: contract.id,
        dealId: deal.id,
        dealTitle: deal.sourceTitle,
        contractIdentifier: contract.contract_identifier,
        status: contract.status,
        signedDate: contract.signed_date,
        startDate: contract.start_date,
        endDate: contract.end_date,
        extensionEndDate: contract.extension_end_date,
        originalValue: contract.original_value,
        currentValue: contract.current_value,
        currency: contract.currency,
        buyer,
        suppliers,
        payments: paymentsByContract.get(contract.id) ?? [],
        performance: performanceByContract.get(contract.id) ?? [],
      },
    ];
  });
}

export function mapRenewalSignals(input: {
  deals: MappedDeal[];
  contracts: ContractRecordDto[];
  insights: Array<{ deal_id: string; estimated_renewal_date: string | null }>;
  organizations: Map<string, IntelligenceOrgRef>;
  incumbentsByDeal: Map<string, IntelligenceOrgRef[]>;
  now: Date;
}): RenewalSignalDto[] {
  const contractsByDeal = new Map<string, ContractRecordDto[]>();
  for (const contract of input.contracts) {
    const list = contractsByDeal.get(contract.dealId) ?? [];
    list.push(contract);
    contractsByDeal.set(contract.dealId, list);
  }
  const insightByDeal = new Map(
    input.insights.map((row) => [row.deal_id, row.estimated_renewal_date]),
  );

  return input.deals.flatMap((deal) => {
    const facts: RenewalDateFact[] = [
      ...dealDateFacts({
        contractEndDate: deal.contractEndDate,
        extensionEndDate: deal.extensionEndDate,
        estimatedRenewalDate: deal.estimatedRenewalDate,
        nextProcurementDate: deal.nextProcurementDate,
      }),
      ...(contractsByDeal.get(deal.id) ?? []).flatMap((contract) =>
        contractExpiryFacts({
          endDate: contract.endDate,
          extensionEndDate: contract.extensionEndDate,
        }),
      ),
    ];
    const insight = insightRenewalFact(insightByDeal.get(deal.id) ?? null);
    if (insight) {
      facts.push(insight);
    }
    const signal = buildRenewalSignal(
      {
        dealId: deal.id,
        dealTitle: deal.sourceTitle,
        dealType: deal.dealType,
        status: deal.status,
        buyer: deal.buyerOrganizationId
          ? (input.organizations.get(deal.buyerOrganizationId) ?? null)
          : null,
        incumbents: input.incumbentsByDeal.get(deal.id) ?? [],
        facts,
      },
      input.now,
    );
    return signal ? [signal] : [];
  });
}

export function expiringContracts(
  contracts: ContractRecordDto[],
  now: Date,
): ContractRecordDto[] {
  return contracts.filter((contract) => {
    const date = contract.extensionEndDate ?? contract.endDate;
    return date ? isRenewalDateInScope(date, now) : false;
  });
}

export function assembleDealGraph(input: {
  deals: MappedDeal[];
  awards: AwardRecordDto[];
  contracts: ContractRecordDto[];
  roles: Array<{ dealId: string; organizationId: string; role: string }>;
  relatedLinks: Array<{
    dealId: string;
    relatedDealId: string;
    relationshipType: string;
    confidence: number | null;
  }>;
  insights: Array<{
    deal_id: string;
    estimated_renewal_date: string | null;
    incumbent_organization_id: string | null;
  }>;
  organizations: Map<string, IntelligenceOrgRef>;
  now: Date;
}) {
  const dealsById = new Map(input.deals.map((deal) => [deal.id, deal]));
  const awardsByDeal = new Map<string, AwardRecordDto[]>();
  for (const award of input.awards) {
    const list = awardsByDeal.get(award.dealId) ?? [];
    list.push(award);
    awardsByDeal.set(award.dealId, list);
  }
  const insightByDeal = new Map(input.insights.map((row) => [row.deal_id, row]));
  const incumbentsByDeal = new Map<string, ReturnType<typeof classifyIncumbents>>();

  for (const deal of input.deals) {
    const relatedPreviousAwards = input.relatedLinks
      .filter(
        (link) =>
          link.dealId === deal.id || link.relatedDealId === deal.id,
      )
      .flatMap((link) => {
        const relatedId = link.dealId === deal.id ? link.relatedDealId : link.dealId;
        const related = dealsById.get(relatedId);
        if (!related) {
          return [];
        }
        const relatedEnd =
          related.extensionEndDate ?? related.contractEndDate ?? related.awardDecisionDate;
        const currentStart = deal.contractStartDate ?? deal.firstPublishedAt;
        if (relatedEnd && currentStart && relatedEnd <= currentStart) {
          return awardsByDeal.get(related.id) ?? [];
        }
        return [];
      });

    incumbentsByDeal.set(
      deal.id,
      classifyIncumbents({
        dealId: deal.id,
        dealTitle: deal.sourceTitle,
        awards: awardsByDeal.get(deal.id) ?? [],
        roles: input.roles,
        organizations: input.organizations,
        relatedPreviousAwards,
        insightIncumbentId: insightByDeal.get(deal.id)?.incumbent_organization_id ?? null,
      }),
    );
  }

  const incumbentRefs = new Map<string, IntelligenceOrgRef[]>();
  for (const [dealId, signals] of incumbentsByDeal) {
    const unique = new Map<string, IntelligenceOrgRef>();
    for (const signal of signals) {
      unique.set(signal.organization.id, signal.organization);
    }
    incumbentRefs.set(dealId, [...unique.values()]);
  }

  const renewals = mapRenewalSignals({
    deals: input.deals,
    contracts: input.contracts,
    insights: input.insights,
    organizations: input.organizations,
    incumbentsByDeal: incumbentRefs,
    now: input.now,
  });

  return {
    categoryActivity: aggregateCategoryActivity(input.deals),
    yearActivity: aggregateYearActivity(input.deals),
    winningSuppliers: winningSuppliersFromAwards(input.awards),
    incumbents: [...incumbentsByDeal.values()].flat(),
    incumbentsByDeal,
    renewals,
    expiringContracts: expiringContracts(input.contracts, input.now),
  };
}

export function relatedForDeal(input: {
  deal: MappedDeal;
  others: MappedDeal[];
  links: Array<{
    dealId: string;
    relatedDealId: string;
    relationshipType: string;
    confidence: number | null;
  }>;
}) {
  return relateProcurements({
    currentDealId: input.deal.id,
    current: input.deal,
    buyerId: input.deal.buyerOrganizationId,
    others: input.others,
    links: input.links,
  });
}
