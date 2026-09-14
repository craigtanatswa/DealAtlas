import type { BuyerSector } from "@/lib/constants";
import { BUYER_SECTORS } from "@/lib/constants";
import {
  DEAL_STAGES,
  DEAL_STATUSES,
  DEAL_TYPES,
  type DealStage,
  type DealStatus,
  type DealType,
} from "@/lib/search/filters";

export const PAID_DEAL_DTO_KEYS = [
  "id",
  "sourceTitle",
  "sourceDescription",
  "reference",
  "ocid",
  "externalPrimaryId",
  "dealType",
  "buyerSector",
  "stage",
  "status",
  "mainCategory",
  "procurementMethod",
  "specialRegime",
  "currency",
  "valueMinExVat",
  "valueMaxExVat",
  "exactValueText",
  "exactLocationText",
  "enquiryDeadline",
  "submissionDeadline",
  "awardDecisionDate",
  "contractStartDate",
  "contractEndDate",
  "extensionEndDate",
  "nextProcurementDate",
  "estimatedRenewalDate",
  "smeSuitable",
  "vcseSuitable",
  "sourceUrl",
  "applicationUrl",
  "firstPublishedAt",
  "latestSourceAt",
  "buyer",
  "source",
  "notices",
  "documents",
] as const;

export type PaidBuyerDto = {
  id: string;
  name: string;
  website: string | null;
  domain: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  region: string | null;
  countryCode: string | null;
};

export type PaidSourceDto = {
  id: string;
  name: string;
  sourceKey: string;
  sourceType: string;
  baseUrl: string | null;
};

export type PaidNoticeDto = {
  id: string;
  noticeIdentifier: string | null;
  noticeType: string | null;
  noticeStage: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  isCurrentVersion: boolean;
};

export type PaidDocumentDto = {
  id: string;
  name: string | null;
  documentType: string | null;
  sourceUrl: string | null;
  mimeType: string | null;
  publishedAt: string | null;
};

export type PaidDealDto = {
  id: string;
  sourceTitle: string;
  sourceDescription: string | null;
  reference: string | null;
  ocid: string | null;
  externalPrimaryId: string | null;
  dealType: DealType;
  buyerSector: BuyerSector;
  stage: DealStage;
  status: DealStatus;
  mainCategory: string | null;
  procurementMethod: string | null;
  specialRegime: string | null;
  currency: string | null;
  valueMinExVat: number | null;
  valueMaxExVat: number | null;
  exactValueText: string | null;
  exactLocationText: string | null;
  enquiryDeadline: string | null;
  submissionDeadline: string | null;
  awardDecisionDate: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  extensionEndDate: string | null;
  nextProcurementDate: string | null;
  estimatedRenewalDate: string | null;
  smeSuitable: boolean | null;
  vcseSuitable: boolean | null;
  sourceUrl: string | null;
  applicationUrl: string | null;
  firstPublishedAt: string | null;
  latestSourceAt: string | null;
  buyer: PaidBuyerDto | null;
  source: PaidSourceDto | null;
  notices: PaidNoticeDto[];
  documents: PaidDocumentDto[];
};

export type PaidDealMappingInput = {
  deal: {
    id: string;
    source_title: string;
    source_description: string | null;
    reference: string | null;
    ocid: string | null;
    external_primary_id: string | null;
    deal_type: string;
    buyer_sector: string;
    stage: string;
    status: string;
    main_category: string | null;
    procurement_method: string | null;
    special_regime: string | null;
    currency: string | null;
    value_min_ex_vat: number | null;
    value_max_ex_vat: number | null;
    exact_value_text: string | null;
    exact_location_text: string | null;
    enquiry_deadline: string | null;
    submission_deadline: string | null;
    award_decision_date: string | null;
    contract_start_date: string | null;
    contract_end_date: string | null;
    extension_end_date: string | null;
    next_procurement_date: string | null;
    estimated_renewal_date: string | null;
    sme_suitable: boolean | null;
    vcse_suitable: boolean | null;
    source_url: string | null;
    application_url: string | null;
    first_published_at: string | null;
    latest_source_at: string | null;
  };
  buyer: {
    id: string;
    canonical_name: string;
    website: string | null;
    domain: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    region: string | null;
    country_code: string | null;
  } | null;
  source: {
    id: string;
    name: string;
    source_key: string;
    source_type: string;
    base_url: string | null;
  } | null;
  notices: Array<{
    id: string;
    notice_identifier: string | null;
    notice_type: string | null;
    notice_stage: string | null;
    source_url: string | null;
    published_at: string | null;
    modified_at: string | null;
    is_current_version: boolean;
  }>;
  documents: Array<{
    id: string;
    name: string | null;
    document_type: string | null;
    source_url: string | null;
    mime_type: string | null;
    published_at: string | null;
  }>;
};

const OMITTED_INTERNAL_KEYS = [
  "data_quality_score",
  "source_count",
  "created_at",
  "updated_at",
  "first_discovered_at",
  "last_verified_at",
  "scraping_permitted",
  "reuse_status",
  "access_method",
  "enabled",
  "api_url",
  "compliance_notes",
  "consecutive_failures",
  "rate_limit_per_minute",
  "processing_status",
  "protected_payload",
  "dodo_customer_id",
  "dodo_subscription_id",
  "dodo_product_id",
] as const;

function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}

function parseBuyerSector(value: unknown): BuyerSector {
  if (typeof value === "string" && (BUYER_SECTORS as readonly string[]).includes(value)) {
    return value as BuyerSector;
  }
  return "OTHER";
}

function toPaidBuyerDto(
  buyer: PaidDealMappingInput["buyer"],
): PaidBuyerDto | null {
  if (!buyer) {
    return null;
  }

  return {
    id: buyer.id,
    name: buyer.canonical_name,
    website: buyer.website,
    domain: buyer.domain,
    email: buyer.email,
    phone: buyer.phone,
    city: buyer.city,
    region: buyer.region,
    countryCode: buyer.country_code,
  };
}

function toPaidSourceDto(
  source: PaidDealMappingInput["source"],
): PaidSourceDto | null {
  if (!source) {
    return null;
  }

  return {
    id: source.id,
    name: source.name,
    sourceKey: source.source_key,
    sourceType: source.source_type,
    baseUrl: source.base_url,
  };
}

export function toPaidDealDto(input: PaidDealMappingInput): PaidDealDto {
  const { deal } = input;

  return {
    id: deal.id,
    sourceTitle: deal.source_title,
    sourceDescription: deal.source_description,
    reference: deal.reference,
    ocid: deal.ocid,
    externalPrimaryId: deal.external_primary_id,
    dealType: parseEnum(deal.deal_type, DEAL_TYPES, "PUBLIC_TENDER"),
    buyerSector: parseBuyerSector(deal.buyer_sector),
    stage: parseEnum(deal.stage, DEAL_STAGES, "LIVE"),
    status: parseEnum(deal.status, DEAL_STATUSES, "OPEN"),
    mainCategory: deal.main_category,
    procurementMethod: deal.procurement_method,
    specialRegime: deal.special_regime,
    currency: deal.currency,
    valueMinExVat: deal.value_min_ex_vat,
    valueMaxExVat: deal.value_max_ex_vat,
    exactValueText: deal.exact_value_text,
    exactLocationText: deal.exact_location_text,
    enquiryDeadline: deal.enquiry_deadline,
    submissionDeadline: deal.submission_deadline,
    awardDecisionDate: deal.award_decision_date,
    contractStartDate: deal.contract_start_date,
    contractEndDate: deal.contract_end_date,
    extensionEndDate: deal.extension_end_date,
    nextProcurementDate: deal.next_procurement_date,
    estimatedRenewalDate: deal.estimated_renewal_date,
    smeSuitable: deal.sme_suitable,
    vcseSuitable: deal.vcse_suitable,
    sourceUrl: deal.source_url,
    applicationUrl: deal.application_url,
    firstPublishedAt: deal.first_published_at,
    latestSourceAt: deal.latest_source_at,
    buyer: toPaidBuyerDto(input.buyer),
    source: toPaidSourceDto(input.source),
    notices: input.notices.map((notice) => ({
      id: notice.id,
      noticeIdentifier: notice.notice_identifier,
      noticeType: notice.notice_type,
      noticeStage: notice.notice_stage,
      sourceUrl: notice.source_url,
      publishedAt: notice.published_at,
      modifiedAt: notice.modified_at,
      isCurrentVersion: notice.is_current_version,
    })),
    documents: input.documents.map((document) => ({
      id: document.id,
      name: document.name,
      documentType: document.document_type,
      sourceUrl: document.source_url,
      mimeType: document.mime_type,
      publishedAt: document.published_at,
    })),
  };
}

export function assertPaidDealDto(value: unknown): PaidDealDto {
  if (!value || typeof value !== "object") {
    throw new Error("Paid deal DTO must be an object");
  }

  const record = value as Record<string, unknown>;
  for (const key of OMITTED_INTERNAL_KEYS) {
    if (key in record) {
      throw new Error(`Paid deal DTO contains internal key ${key}`);
    }
  }

  return value as PaidDealDto;
}
