import "server-only";

import {
  listCanonicalDataSourcesByIds,
  listCanonicalDealRecordsByIds,
  listCanonicalOrganizationsByIds,
  type CanonicalDataSource,
  type CanonicalDeal,
  type CanonicalOrganization,
} from "@/lib/db/canonical";
import {
  assertPaidDealDto,
  toPaidDealDto,
  type PaidDealDto,
  type PaidDealMappingInput,
} from "@/lib/deals/paid-dto";
import type { ProCanonicalAccess } from "@/lib/entitlements/types";

function toDealInput(deal: CanonicalDeal): PaidDealMappingInput["deal"] {
  return {
    id: deal.id,
    source_title: deal.source_title,
    source_description: deal.source_description,
    reference: deal.reference,
    ocid: deal.ocid,
    external_primary_id: deal.external_primary_id,
    deal_type: deal.deal_type,
    buyer_sector: deal.buyer_sector,
    stage: deal.stage,
    status: deal.status,
    main_category: deal.main_category,
    procurement_method: deal.procurement_method,
    special_regime: deal.special_regime,
    currency: deal.currency,
    value_min_ex_vat: deal.value_min_ex_vat,
    value_max_ex_vat: deal.value_max_ex_vat,
    exact_value_text: deal.exact_value_text,
    exact_location_text: deal.exact_location_text,
    enquiry_deadline: deal.enquiry_deadline,
    submission_deadline: deal.submission_deadline,
    award_decision_date: deal.award_decision_date,
    contract_start_date: deal.contract_start_date,
    contract_end_date: deal.contract_end_date,
    extension_end_date: deal.extension_end_date,
    next_procurement_date: deal.next_procurement_date,
    estimated_renewal_date: deal.estimated_renewal_date,
    sme_suitable: deal.sme_suitable,
    vcse_suitable: deal.vcse_suitable,
    source_url: deal.source_url,
    application_url: deal.application_url,
    first_published_at: deal.first_published_at,
    latest_source_at: deal.latest_source_at,
  };
}

function toBuyerInput(
  buyer: CanonicalOrganization | undefined,
): PaidDealMappingInput["buyer"] {
  if (!buyer) {
    return null;
  }
  return {
    id: buyer.id,
    canonical_name: buyer.canonical_name,
    website: buyer.website,
    domain: buyer.domain,
    email: buyer.email,
    phone: buyer.phone,
    city: buyer.city,
    region: buyer.region,
    country_code: buyer.country_code,
  };
}

function toSourceInput(
  source: CanonicalDataSource | undefined,
): PaidDealMappingInput["source"] {
  if (!source) {
    return null;
  }
  return {
    id: source.id,
    name: source.name,
    source_key: source.source_key,
    source_type: source.source_type,
    base_url: source.base_url,
    reuse_status: source.reuse_status,
    licence_name: source.licence_name,
    licence_url: source.licence_url,
    terms_url: source.terms_url,
  };
}

export async function loadPaidDealsForExport(
  dealIds: string[],
  access: ProCanonicalAccess,
): Promise<PaidDealDto[]> {
  if (dealIds.length === 0) {
    return [];
  }

  const deals = await listCanonicalDealRecordsByIds(dealIds, access);
  const byId = new Map(deals.map((deal) => [deal.id, deal]));
  const buyerIds = deals
    .map((deal) => deal.buyer_organization_id)
    .filter((id): id is string => Boolean(id));
  const sourceIds = deals
    .map((deal) => deal.primary_source_id)
    .filter((id): id is string => Boolean(id));

  const [buyers, sources] = await Promise.all([
    listCanonicalOrganizationsByIds(buyerIds, access),
    listCanonicalDataSourcesByIds(sourceIds, access),
  ]);
  const buyerById = new Map(buyers.map((buyer) => [buyer.id, buyer]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  return dealIds.flatMap((id) => {
    const deal = byId.get(id);
    if (!deal) {
      return [];
    }
    return [
      assertPaidDealDto(
        toPaidDealDto({
          deal: toDealInput(deal),
          buyer: toBuyerInput(
            deal.buyer_organization_id
              ? buyerById.get(deal.buyer_organization_id)
              : undefined,
          ),
          source: toSourceInput(
            deal.primary_source_id ? sourceById.get(deal.primary_source_id) : undefined,
          ),
          notices: [],
          documents: [],
        }),
      ),
    ];
  });
}
