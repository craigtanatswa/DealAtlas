import "server-only";

import {
  getCanonicalOrganizationById,
  listCanonicalAwardSuppliers,
  listCanonicalAwardSuppliersForOrganization,
  listCanonicalAwardsByIds,
  listCanonicalAwardsForDeals,
  listCanonicalContractPayments,
  listCanonicalContractPerformance,
  listCanonicalContractsForDeals,
  listCanonicalContractsInDateWindow,
  listCanonicalContractsPage,
  listCanonicalDealOrganizationsForDeals,
  listCanonicalDealOrganizationsForOrganization,
  listCanonicalDealsByBuyer,
  listCanonicalDealsByIds,
  listCanonicalDealsInRenewalWindow,
  listCanonicalInsightsForDeals,
  listCanonicalInsightsInRenewalWindow,
  listCanonicalOrganizationsByIds,
  listCanonicalRelatedDeals,
  listRecentCanonicalAwardSupplierRefs,
  listRecentCanonicalBuyerDealRefs,
  searchCanonicalOrganizationsByName,
  type CanonicalAccess,
} from "@/lib/db/canonical";
import { aggregateCategoryActivity, aggregateYearActivity } from "@/lib/intelligence/activity";
import { winningSuppliersFromAwards } from "@/lib/intelligence/incumbents";
import { relateBuyerHistory } from "@/lib/intelligence/related";
import {
  RENEWAL_LOOKAHEAD_DAYS,
  RENEWAL_LOOKBEHIND_DAYS,
} from "@/lib/intelligence/renewals";
import {
  assembleDealGraph,
  mapAwards,
  mapContracts,
  mapDealRef,
  mapOrg,
  relatedForDeal,
  type MappedDeal,
  type MappedOrg,
} from "@/lib/intelligence/map";
import type {
  BuyerIntelligenceDto,
  ContractListDto,
  DealHistoryDto,
  OrganizationListDto,
  RenewalListDto,
  SupplierIntelligenceDto,
} from "@/lib/intelligence/types";
import { parseInput, uuidSchema } from "@/lib/validation";

const PAGE_SIZE = 20;
const BUYER_ROLES = new Set(["BUYER", "LEAD_BUYER", "JOINT_BUYER", "FRAMEWORK_AUTHORITY"]);
const SUPPLIER_ROLES = new Set([
  "SUPPLIER",
  "AWARDED_SUPPLIER",
  "INCUMBENT",
  "PRIME_CONTRACTOR",
]);

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function windowBounds(now: Date): { from: string; to: string } {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - RENEWAL_LOOKBEHIND_DAYS);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + RENEWAL_LOOKAHEAD_DAYS);
  return { from: dateOnly(from), to: dateOnly(to) };
}

async function loadGraph(access: CanonicalAccess, deals: MappedDeal[], now: Date) {
  const dealIds = deals.map((deal) => deal.id);
  const [awards, roles, related, insights, contracts] = await Promise.all([
    listCanonicalAwardsForDeals(dealIds, access),
    listCanonicalDealOrganizationsForDeals(dealIds, access),
    listCanonicalRelatedDeals(dealIds, access),
    listCanonicalInsightsForDeals(dealIds, access),
    listCanonicalContractsForDeals(dealIds, access),
  ]);
  const awardSuppliers = await listCanonicalAwardSuppliers(
    awards.map((award) => award.id),
    access,
  );
  const payments = await listCanonicalContractPayments(
    contracts.map((contract) => contract.id),
    access,
  );
  const performance = await listCanonicalContractPerformance(
    contracts.map((contract) => contract.id),
    access,
  );

  const relatedDealIds = related.flatMap((link) => [link.deal_id, link.related_deal_id]);
  const extraDeals = await listCanonicalDealsByIds(
    relatedDealIds.filter((id) => !deals.some((deal) => deal.id === id)),
    access,
  );
  const extraMapped = extraDeals.map(mapDealRef);
  const allDeals = [...deals, ...extraMapped];
  const dealsById = new Map(allDeals.map((deal) => [deal.id, deal]));

  const extraAwards = await listCanonicalAwardsForDeals(
    extraMapped.map((deal) => deal.id),
    access,
  );
  const extraAwardSuppliers = await listCanonicalAwardSuppliers(
    extraAwards.map((award) => award.id),
    access,
  );

  const orgIds = [
    ...allDeals.map((deal) => deal.buyerOrganizationId),
    ...roles.map((role) => role.organization_id),
    ...awardSuppliers.map((row) => row.organization_id),
    ...extraAwardSuppliers.map((row) => row.organization_id),
    ...insights.map((row) => row.incumbent_organization_id),
  ].filter((id): id is string => Boolean(id));
  const organizations = new Map(
    (await listCanonicalOrganizationsByIds(orgIds, access)).map((row) => [
      row.id,
      mapOrg(row),
    ]),
  );

  const mappedAwards = mapAwards({
    awards: [...awards, ...extraAwards],
    suppliers: [...awardSuppliers, ...extraAwardSuppliers],
    deals: dealsById,
    organizations,
  });
  const mappedContracts = mapContracts({
    contracts,
    deals: dealsById,
    organizations,
    awards: mappedAwards,
    payments,
    performance,
  });

  const graph = assembleDealGraph({
    deals: allDeals,
    awards: mappedAwards,
    contracts: mappedContracts,
    roles: roles.map((role) => ({
      dealId: role.deal_id,
      organizationId: role.organization_id,
      role: role.role,
    })),
    relatedLinks: related.map((link) => ({
      dealId: link.deal_id,
      relatedDealId: link.related_deal_id,
      relationshipType: link.relationship_type,
      confidence: link.confidence,
    })),
    insights,
    organizations,
    now,
  });

  return {
    dealsById,
    organizations,
    awards: mappedAwards,
    contracts: mappedContracts,
    related,
    insights,
    graph,
  };
}

export async function loadBuyerIntelligence(
  organizationId: string,
  access: CanonicalAccess,
  now = new Date(),
): Promise<BuyerIntelligenceDto | null> {
  const id = parseInput(uuidSchema, organizationId, "Organization id");
  const organization = await getCanonicalOrganizationById(id, access);
  if (!organization) {
    return null;
  }

  const [buyerDeals, orgRoles] = await Promise.all([
    listCanonicalDealsByBuyer(id, access),
    listCanonicalDealOrganizationsForOrganization(id, access),
  ]);
  const roleDealIds = orgRoles
    .filter((row) => BUYER_ROLES.has(row.role))
    .map((row) => row.deal_id);
  const extraBuyerDeals = await listCanonicalDealsByIds(
    roleDealIds.filter((dealId) => !buyerDeals.some((deal) => deal.id === dealId)),
    access,
  );
  const deals = [...buyerDeals, ...extraBuyerDeals].map(mapDealRef);
  const loaded = await loadGraph(access, deals, now);
  const buyerDealsOnly = deals.filter(
    (deal) =>
      deal.buyerOrganizationId === id ||
      orgRoles.some((role) => role.deal_id === deal.id && BUYER_ROLES.has(role.role)),
  );
  const related = relateBuyerHistory({
    buyerId: id,
    deals: [...loaded.dealsById.values()],
    links: loaded.related.map((link) => ({
      dealId: link.deal_id,
      relatedDealId: link.related_deal_id,
      relationshipType: link.relationship_type,
      confidence: link.confidence,
    })),
  });
  const seenRelated = new Set<string>();
  const relatedProcurements = related.filter((item) => {
    const key = `${item.deal.id}:${item.relationshipType}:${item.direction}`;
    if (seenRelated.has(key)) {
      return false;
    }
    seenRelated.add(key);
    return true;
  });

  const org = mapOrg(organization);
  return {
    organization: {
      id: org.id,
      name: org.name,
      sector: org.sector,
      website: org.website,
      domain: org.domain,
      city: org.city,
      region: org.region,
      countryCode: org.countryCode,
    },
    procurementHistory: buyerDealsOnly,
    categoryActivity: aggregateCategoryActivity(buyerDealsOnly),
    yearActivity: aggregateYearActivity(buyerDealsOnly),
    awards: loaded.awards.filter((award) =>
      buyerDealsOnly.some((deal) => deal.id === award.dealId),
    ),
    winningSuppliers: winningSuppliersFromAwards(
      loaded.awards.filter((award) =>
        buyerDealsOnly.some((deal) => deal.id === award.dealId),
      ),
    ),
    incumbents: loaded.graph.incumbents.filter((item) =>
      buyerDealsOnly.some((deal) => deal.id === item.dealId),
    ),
    contracts: loaded.contracts.filter((contract) =>
      buyerDealsOnly.some((deal) => deal.id === contract.dealId),
    ),
    expiringContracts: loaded.graph.expiringContracts.filter((contract) =>
      buyerDealsOnly.some((deal) => deal.id === contract.dealId),
    ),
    relatedProcurements,
    renewalSignals: loaded.graph.renewals.filter((item) =>
      buyerDealsOnly.some((deal) => deal.id === item.dealId),
    ),
  };
}

export async function loadSupplierIntelligence(
  organizationId: string,
  access: CanonicalAccess,
  now = new Date(),
): Promise<SupplierIntelligenceDto | null> {
  const id = parseInput(uuidSchema, organizationId, "Organization id");
  const organization = await getCanonicalOrganizationById(id, access);
  if (!organization) {
    return null;
  }

  const [awardLinks, orgRoles] = await Promise.all([
    listCanonicalAwardSuppliersForOrganization(id, access),
    listCanonicalDealOrganizationsForOrganization(id, access),
  ]);
  const roleDealIds = orgRoles
    .filter((row) => SUPPLIER_ROLES.has(row.role))
    .map((row) => row.deal_id);
  const awardsForOrg = await listCanonicalAwardsByIds(
    awardLinks.map((row) => row.award_id),
    access,
  );
  const dealIds = [...roleDealIds, ...awardsForOrg.map((award) => award.deal_id)];
  const deals = (await listCanonicalDealsByIds(dealIds, access)).map(mapDealRef);
  const loaded = await loadGraph(access, deals, now);
  const supplierAwardsDto = loaded.awards.filter((award) =>
    award.suppliers.some((supplier) => supplier.id === id),
  );
  const buyerCounts = new Map<string, { org: MappedOrg; awardCount: number }>();
  for (const award of supplierAwardsDto) {
    const deal = loaded.dealsById.get(award.dealId);
    if (!deal?.buyerOrganizationId) {
      continue;
    }
    const buyer = loaded.organizations.get(deal.buyerOrganizationId);
    if (!buyer) {
      continue;
    }
    const current = buyerCounts.get(buyer.id) ?? { org: buyer, awardCount: 0 };
    current.awardCount += 1;
    buyerCounts.set(buyer.id, current);
  }

  const competitorAwards = loaded.awards.filter(
    (award) =>
      supplierAwardsDto.some((own) => own.dealId === award.dealId) &&
      award.suppliers.some((supplier) => supplier.id !== id),
  );

  const org = mapOrg(organization);
  const contracts = loaded.contracts.filter((contract) =>
    contract.suppliers.some((supplier) => supplier.id === id),
  );

  return {
    organization: {
      id: org.id,
      name: org.name,
      isSme: org.isSme,
      website: org.website,
      domain: org.domain,
      city: org.city,
      region: org.region,
      countryCode: org.countryCode,
    },
    awards: supplierAwardsDto,
    buyers: [...buyerCounts.values()]
      .map((item) => ({ id: item.org.id, name: item.org.name, awardCount: item.awardCount }))
      .sort((left, right) => right.awardCount - left.awardCount),
    categoryActivity: aggregateCategoryActivity(
      supplierAwardsDto.flatMap((award) => {
        const deal = loaded.dealsById.get(award.dealId);
        return deal ? [deal] : [];
      }),
    ),
    contracts,
    incumbents: loaded.graph.incumbents.filter((item) => item.organization.id === id),
    competitorAwards,
    renewalSignals: loaded.graph.renewals.filter((item) =>
      item.incumbents.some((incumbent) => incumbent.id === id),
    ),
    payments: contracts.flatMap((contract) => contract.payments),
    performance: contracts.flatMap((contract) => contract.performance),
  };
}

export async function loadDealHistory(
  dealId: string,
  access: CanonicalAccess,
  now = new Date(),
): Promise<DealHistoryDto | null> {
  const id = parseInput(uuidSchema, dealId, "Deal id");
  const deals = (await listCanonicalDealsByIds([id], access)).map(mapDealRef);
  if (deals.length === 0) {
    return null;
  }
  const loaded = await loadGraph(access, deals, now);
  const current = deals[0];
  const others = [...loaded.dealsById.values()].filter((deal) => deal.id !== current.id);
  return {
    dealId: current.id,
    awards: loaded.awards.filter((award) => award.dealId === current.id),
    winningSuppliers: loaded.awards
      .filter((award) => award.dealId === current.id)
      .flatMap((award) => award.suppliers),
    incumbents: loaded.graph.incumbents.filter((item) => item.dealId === current.id),
    contracts: loaded.contracts.filter((contract) => contract.dealId === current.id),
    relatedProcurements: relatedForDeal({
      deal: current,
      others,
      links: loaded.related.map((link) => ({
        dealId: link.deal_id,
        relatedDealId: link.related_deal_id,
        relationshipType: link.relationship_type,
        confidence: link.confidence,
      })),
    }),
    renewalSignals: loaded.graph.renewals.filter((item) => item.dealId === current.id),
  };
}

export async function listBuyerDirectory(
  access: CanonicalAccess,
  options?: { query?: string; page?: number; pageSize?: number },
): Promise<OrganizationListDto> {
  const pageSize = options?.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, options?.page ?? 1);
  const query = options?.query?.trim() ?? "";

  if (query) {
    const searched = await searchCanonicalOrganizationsByName(query, access, {
      limit: 50,
      offset: 0,
    });
    const buyerDeals = await Promise.all(
      searched.items.map(async (org) => {
        const deals = await listCanonicalDealsByBuyer(org.id, access);
        return { org, deals };
      }),
    );
    const items = buyerDeals
      .filter((row) => row.deals.length > 0)
      .map((row) => ({
        id: row.org.id,
        name: row.org.canonical_name,
        sector: row.org.buyer_sector,
        region: row.org.region,
        dealCount: row.deals.length,
        latestActivityAt: row.deals[0]?.latest_source_at ?? null,
      }));
    const offset = (page - 1) * pageSize;
    return {
      items: items.slice(offset, offset + pageSize),
      page,
      pageSize,
      total: items.length,
    };
  }

  const refs = await listRecentCanonicalBuyerDealRefs(access);
  const latest = new Map<string, { count: number; latestActivityAt: string | null }>();
  for (const row of refs) {
    if (!row.buyer_organization_id) {
      continue;
    }
    const current = latest.get(row.buyer_organization_id) ?? {
      count: 0,
      latestActivityAt: null,
    };
    current.count += 1;
    if (
      row.latest_source_at &&
      (!current.latestActivityAt || row.latest_source_at > current.latestActivityAt)
    ) {
      current.latestActivityAt = row.latest_source_at;
    }
    latest.set(row.buyer_organization_id, current);
  }
  const ids = [...latest.keys()];
  const organizations = await listCanonicalOrganizationsByIds(ids, access);
  const items = organizations
    .map((org) => ({
      id: org.id,
      name: org.canonical_name,
      sector: org.buyer_sector,
      region: org.region,
      dealCount: latest.get(org.id)?.count ?? 0,
      latestActivityAt: latest.get(org.id)?.latestActivityAt ?? null,
    }))
    .sort((left, right) =>
      (right.latestActivityAt ?? "").localeCompare(left.latestActivityAt ?? ""),
    );
  const offset = (page - 1) * pageSize;
  return {
    items: items.slice(offset, offset + pageSize),
    page,
    pageSize,
    total: items.length,
  };
}

export async function listSupplierDirectory(
  access: CanonicalAccess,
  options?: { query?: string; page?: number; pageSize?: number },
): Promise<OrganizationListDto> {
  const pageSize = options?.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, options?.page ?? 1);
  const query = options?.query?.trim() ?? "";
  const refs = await listRecentCanonicalAwardSupplierRefs(access);
  const latest = new Map<string, { count: number; latestActivityAt: string | null }>();
  for (const row of refs) {
    const current = latest.get(row.organization_id) ?? {
      count: 0,
      latestActivityAt: null,
    };
    current.count += 1;
    if (!current.latestActivityAt || row.created_at > current.latestActivityAt) {
      current.latestActivityAt = row.created_at;
    }
    latest.set(row.organization_id, current);
  }

  let organizations = await listCanonicalOrganizationsByIds([...latest.keys()], access);
  if (query) {
    const needle = query.toLowerCase();
    organizations = organizations.filter((org) =>
      org.canonical_name.toLowerCase().includes(needle),
    );
  }
  const items = organizations
    .map((org) => ({
      id: org.id,
      name: org.canonical_name,
      sector: org.buyer_sector,
      region: org.region,
      dealCount: latest.get(org.id)?.count ?? 0,
      latestActivityAt: latest.get(org.id)?.latestActivityAt ?? null,
    }))
    .sort((left, right) =>
      (right.latestActivityAt ?? "").localeCompare(left.latestActivityAt ?? ""),
    );
  const offset = (page - 1) * pageSize;
  return {
    items: items.slice(offset, offset + pageSize),
    page,
    pageSize,
    total: items.length,
  };
}

export async function listContractIntelligence(
  access: CanonicalAccess,
  options?: { page?: number; pageSize?: number },
  now = new Date(),
): Promise<ContractListDto> {
  const pageSize = options?.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, options?.page ?? 1);
  const offset = (page - 1) * pageSize;
  const listed = await listCanonicalContractsPage(access, { limit: pageSize, offset });
  const deals = (
    await listCanonicalDealsByIds(
      listed.items.map((row) => row.deal_id),
      access,
    )
  ).map(mapDealRef);
  const loaded = await loadGraph(access, deals, now);
  const byId = new Map(loaded.contracts.map((contract) => [contract.id, contract]));
  return {
    items: listed.items.flatMap((row) => {
      const mapped = byId.get(row.id);
      return mapped ? [mapped] : [];
    }),
    page,
    pageSize,
    total: listed.total,
  };
}

export async function listRenewalIntelligence(
  access: CanonicalAccess,
  options?: { page?: number; pageSize?: number },
  now = new Date(),
): Promise<RenewalListDto> {
  const pageSize = options?.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, options?.page ?? 1);
  const bounds = windowBounds(now);
  const [windowDeals, windowContracts, windowInsights] = await Promise.all([
    listCanonicalDealsInRenewalWindow(access, bounds),
    listCanonicalContractsInDateWindow(access, bounds),
    listCanonicalInsightsInRenewalWindow(access, bounds),
  ]);
  const dealIds = [
    ...windowDeals.map((row) => row.id),
    ...windowContracts.map((row) => row.deal_id),
    ...windowInsights.map((row) => row.deal_id),
  ];
  const deals = (await listCanonicalDealsByIds(dealIds, access)).map(mapDealRef);
  const loaded = await loadGraph(access, deals, now);
  const ranked = loaded.graph.renewals.slice().sort((left, right) => {
    if (left.window !== right.window) {
      return left.window === "upcoming" ? -1 : left.window === "undated" ? 1 : 0;
    }
    return (left.date ?? "9999-12-31").localeCompare(right.date ?? "9999-12-31");
  });
  const offset = (page - 1) * pageSize;
  return {
    items: ranked.slice(offset, offset + pageSize),
    page,
    pageSize,
    total: ranked.length,
  };
}
