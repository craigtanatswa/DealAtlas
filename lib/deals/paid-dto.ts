import type { BuyerSector } from "@/lib/constants";
import { BUYER_SECTORS } from "@/lib/constants";
import {
  canLinkToSource,
  canRedistributeVerbatim,
  canShowNoticeMetadata,
  isReuseStatus,
  provenanceSummary,
  sourceContentAccess,
  type ReuseStatus,
  type SourceContentAccess,
} from "@/lib/deals/licence";
import { buildPaidTimeline, type PaidTimelineEventDto } from "@/lib/deals/timeline";
import { safeHttpUrl } from "@/lib/deals/urls";
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
  "procurementContact",
  "source",
  "provenance",
  "notices",
  "documents",
  "lots",
  "requirements",
  "awardCriteria",
  "timeline",
  "intelligence",
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

export type PaidProcurementContactDto = {
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  publishedForSupplierUse: true;
};

export type PaidSourceDto = {
  id: string;
  name: string;
  sourceKey: string;
  sourceType: string;
  baseUrl: string | null;
};

export type PaidProvenanceDto = {
  contentAccess: SourceContentAccess;
  sourceName: string | null;
  sourceType: string | null;
  reuseStatus: ReuseStatus | null;
  licenceName: string | null;
  licenceUrl: string | null;
  termsUrl: string | null;
  summary: string;
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
  access: "link" | "withheld";
};

export type PaidLotDto = {
  id: string;
  lotNumber: string | null;
  sourceTitle: string | null;
  sourceDescription: string | null;
  status: DealStatus | null;
  currency: string | null;
  valueMin: number | null;
  valueMax: number | null;
  exactLocationText: string | null;
  submissionDeadline: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  smeSuitable: boolean | null;
  vcseSuitable: boolean | null;
};

export type PaidRequirementDto = {
  id: string;
  lotId: string | null;
  requirementType: string;
  name: string;
  description: string | null;
  mandatory: boolean | null;
  minimumValue: number | null;
  unit: string | null;
  evidenceRequired: string | null;
  isInferred: boolean;
};

export type PaidAwardCriterionDto = {
  id: string;
  lotId: string | null;
  name: string;
  description: string | null;
  criterionType: string | null;
  weightPercent: number | null;
  orderOfImportance: number | null;
};

export type PaidIntelligenceFieldDto = {
  kind: "inference";
  value: string | string[] | null;
  confidence: number | null;
  method: string | null;
  model: string | null;
  version: string | null;
  evidence: Array<{ source: string; field: string; note?: string }>;
  generatedAt: string | null;
};

export type PaidIntelligenceDto = {
  label: "DealAtlas analysis";
  summary: PaidIntelligenceFieldDto;
  buyerNeed: PaidIntelligenceFieldDto;
  idealSupplier: PaidIntelligenceFieldDto;
  keyDeliverables: PaidIntelligenceFieldDto;
  smeAccessibility: PaidIntelligenceFieldDto;
  bidComplexity: PaidIntelligenceFieldDto;
  competitionLevel: PaidIntelligenceFieldDto;
  competitionNotes: PaidIntelligenceFieldDto;
  deadlineUrgency: PaidIntelligenceFieldDto;
  riskFlags: PaidIntelligenceFieldDto;
  estimatedRenewalDate: PaidIntelligenceFieldDto;
  overallConfidence: number | null;
  generationMethod: string | null;
  modelVersion: string | null;
  generatedAt: string | null;
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
  procurementContact: PaidProcurementContactDto | null;
  source: PaidSourceDto | null;
  provenance: PaidProvenanceDto;
  notices: PaidNoticeDto[];
  documents: PaidDocumentDto[];
  lots: PaidLotDto[];
  requirements: PaidRequirementDto[];
  awardCriteria: PaidAwardCriterionDto[];
  timeline: PaidTimelineEventDto[];
  intelligence: PaidIntelligenceDto | null;
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
    reuse_status?: string | null;
    licence_name?: string | null;
    licence_url?: string | null;
    terms_url?: string | null;
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
    redistribution_permitted?: boolean | null;
  }>;
  lots?: Array<{
    id: string;
    lot_number: string | null;
    source_title: string | null;
    source_description: string | null;
    status: string | null;
    currency: string | null;
    value_min: number | null;
    value_max: number | null;
    exact_location_text: string | null;
    submission_deadline: string | null;
    contract_start_date: string | null;
    contract_end_date: string | null;
    sme_suitable: boolean | null;
    vcse_suitable: boolean | null;
  }>;
  requirements?: Array<{
    id: string;
    lot_id: string | null;
    requirement_type: string;
    name: string;
    description: string | null;
    mandatory: boolean | null;
    minimum_value: number | null;
    unit: string | null;
    evidence_required: string | null;
    is_inferred: boolean;
  }>;
  awardCriteria?: Array<{
    id: string;
    lot_id: string | null;
    criterion_name: string;
    criterion_description: string | null;
    criterion_type: string | null;
    weight_percent: number | null;
    order_of_importance: number | null;
  }>;
  changes?: Array<{
    id: string;
    change_type: string;
    field_name: string | null;
    occurred_at: string;
    material: boolean;
  }>;
  intelligence?: {
    summary: string | null;
    buyerNeed: string | null;
    idealSupplier: string | null;
    keyDeliverables: unknown;
    mandatoryRequirements: unknown;
    competitionNotes: string | null;
    smeAccessibility: string | null;
    bidComplexity: string | null;
    competitionLevel: string | null;
    deadlineUrgency: string | null;
    riskFlags: unknown;
    estimatedRenewalDate: string | null;
    confidence: number | null;
    generationMethod: string | null;
    modelVersion: string | null;
    fieldProvenance: unknown;
    generatedAt: string | null;
  } | null;
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
  "extracted_text",
  "previous_value",
  "new_value",
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

function parseDealStatus(value: unknown): DealStatus | null {
  if (typeof value === "string" && (DEAL_STATUSES as readonly string[]).includes(value)) {
    return value as DealStatus;
  }
  return null;
}

function parseBuyerSector(value: unknown): BuyerSector {
  if (typeof value === "string" && (BUYER_SECTORS as readonly string[]).includes(value)) {
    return value as BuyerSector;
  }
  return "OTHER";
}

function toPaidBuyerDto(
  buyer: PaidDealMappingInput["buyer"],
  showMetadata: boolean,
): PaidBuyerDto | null {
  if (!buyer || !showMetadata) {
    return null;
  }

  return {
    id: buyer.id,
    name: buyer.canonical_name,
    website: safeHttpUrl(buyer.website),
    domain: buyer.domain,
    email: buyer.email,
    phone: buyer.phone,
    city: buyer.city,
    region: buyer.region,
    countryCode: buyer.country_code,
  };
}

function toProcurementContact(
  buyer: PaidBuyerDto | null,
): PaidProcurementContactDto | null {
  if (!buyer || (!buyer.email && !buyer.phone)) {
    return null;
  }

  return {
    name: buyer.name,
    email: buyer.email,
    phone: buyer.phone,
    city: buyer.city,
    publishedForSupplierUse: true,
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
    baseUrl: safeHttpUrl(source.base_url),
  };
}

function toProvenance(
  source: PaidDealMappingInput["source"],
  access: SourceContentAccess,
): PaidProvenanceDto {
  const reuseStatus = source?.reuse_status;

  return {
    contentAccess: access,
    sourceName: source?.name ?? null,
    sourceType: source?.source_type ?? null,
    reuseStatus: isReuseStatus(reuseStatus) ? reuseStatus : null,
    licenceName: source?.licence_name ?? null,
    licenceUrl: safeHttpUrl(source?.licence_url),
    termsUrl: safeHttpUrl(source?.terms_url),
    summary: provenanceSummary(access),
  };
}

function mapNotices(
  notices: PaidDealMappingInput["notices"],
  showMetadata: boolean,
  linkSource: boolean,
): PaidNoticeDto[] {
  if (!showMetadata) {
    return [];
  }

  return notices.map((notice) => ({
    id: notice.id,
    noticeIdentifier: notice.notice_identifier,
    noticeType: notice.notice_type,
    noticeStage: notice.notice_stage,
    sourceUrl: linkSource ? safeHttpUrl(notice.source_url) : null,
    publishedAt: notice.published_at,
    modifiedAt: notice.modified_at,
    isCurrentVersion: notice.is_current_version,
  }));
}

function mapDocuments(
  documents: PaidDealMappingInput["documents"],
  linkSource: boolean,
): PaidDocumentDto[] {
  if (!linkSource) {
    return [];
  }

  return documents.map((document) => ({
    id: document.id,
    name: document.name,
    documentType: document.document_type,
    sourceUrl: safeHttpUrl(document.source_url),
    mimeType: document.mime_type,
    publishedAt: document.published_at,
    access: "link",
  }));
}

function mapLots(
  lots: NonNullable<PaidDealMappingInput["lots"]>,
  showMetadata: boolean,
  redistribute: boolean,
): PaidLotDto[] {
  if (!showMetadata) {
    return [];
  }

  return lots.map((lot) => ({
    id: lot.id,
    lotNumber: lot.lot_number,
    sourceTitle: lot.source_title,
    sourceDescription: redistribute ? lot.source_description : null,
    status: parseDealStatus(lot.status),
    currency: lot.currency,
    valueMin: lot.value_min,
    valueMax: lot.value_max,
    exactLocationText: lot.exact_location_text,
    submissionDeadline: lot.submission_deadline,
    contractStartDate: lot.contract_start_date,
    contractEndDate: lot.contract_end_date,
    smeSuitable: lot.sme_suitable,
    vcseSuitable: lot.vcse_suitable,
  }));
}

function mapRequirements(
  requirements: NonNullable<PaidDealMappingInput["requirements"]>,
  showMetadata: boolean,
): PaidRequirementDto[] {
  if (!showMetadata) {
    return [];
  }

  return requirements.map((requirement) => ({
    id: requirement.id,
    lotId: requirement.lot_id,
    requirementType: requirement.requirement_type,
    name: requirement.name,
    description: requirement.description,
    mandatory: requirement.mandatory,
    minimumValue: requirement.minimum_value,
    unit: requirement.unit,
    evidenceRequired: requirement.evidence_required,
    isInferred: requirement.is_inferred,
  }));
}

function mapAwardCriteria(
  criteria: NonNullable<PaidDealMappingInput["awardCriteria"]>,
  showMetadata: boolean,
): PaidAwardCriterionDto[] {
  if (!showMetadata) {
    return [];
  }

  return [...criteria]
    .sort((left, right) => {
      const leftOrder = left.order_of_importance ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.order_of_importance ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    })
    .map((criterion) => ({
      id: criterion.id,
      lotId: criterion.lot_id,
      name: criterion.criterion_name,
      description: criterion.criterion_description,
      criterionType: criterion.criterion_type,
      weightPercent: criterion.weight_percent,
      orderOfImportance: criterion.order_of_importance,
    }));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function provenanceFor(
  provenance: unknown,
  field: string,
): {
  confidence: number | null;
  method: string | null;
  model: string | null;
  version: string | null;
  evidence: PaidIntelligenceFieldDto["evidence"];
  generatedAt: string | null;
} {
  if (!provenance || typeof provenance !== "object") {
    return {
      confidence: null,
      method: null,
      model: null,
      version: null,
      evidence: [],
      generatedAt: null,
    };
  }
  const record = (provenance as Record<string, unknown>)[field];
  if (!record || typeof record !== "object") {
    return {
      confidence: null,
      method: null,
      model: null,
      version: null,
      evidence: [],
      generatedAt: null,
    };
  }
  const item = record as Record<string, unknown>;
  const evidence = Array.isArray(item.evidence)
    ? item.evidence.flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
          return [];
        }
        const row = entry as Record<string, unknown>;
        if (typeof row.field !== "string") {
          return [];
        }
        return [
          {
            source: typeof row.source === "string" ? row.source : "canonical",
            field: row.field,
            note: typeof row.note === "string" ? row.note : undefined,
          },
        ];
      })
    : [];
  return {
    confidence: typeof item.confidence === "number" ? item.confidence : null,
    method: typeof item.method === "string" ? item.method : null,
    model: typeof item.model === "string" ? item.model : null,
    version: typeof item.version === "string" ? item.version : null,
    evidence,
    generatedAt: typeof item.generatedAt === "string" ? item.generatedAt : null,
  };
}

function intelligenceField(
  value: string | string[] | null,
  provenance: unknown,
  field: string,
): PaidIntelligenceFieldDto {
  const meta = provenanceFor(provenance, field);
  return {
    kind: "inference",
    value,
    ...meta,
  };
}

function toPaidIntelligence(
  intelligence: NonNullable<PaidDealMappingInput["intelligence"]>,
): PaidIntelligenceDto {
  const provenance = intelligence.fieldProvenance;
  const riskFlags = Array.isArray(intelligence.riskFlags)
    ? intelligence.riskFlags.map((flag) => {
        if (!flag || typeof flag !== "object") {
          return "";
        }
        const row = flag as Record<string, unknown>;
        return typeof row.label === "string" ? row.label : "";
      }).filter(Boolean)
    : [];

  return {
    label: "DealAtlas analysis",
    summary: intelligenceField(intelligence.summary, provenance, "summary"),
    buyerNeed: intelligenceField(intelligence.buyerNeed, provenance, "buyerNeed"),
    idealSupplier: intelligenceField(intelligence.idealSupplier, provenance, "idealSupplier"),
    keyDeliverables: intelligenceField(
      asStringArray(intelligence.keyDeliverables),
      provenance,
      "keyDeliverables",
    ),
    smeAccessibility: intelligenceField(
      intelligence.smeAccessibility,
      provenance,
      "smeAccessibility",
    ),
    bidComplexity: intelligenceField(intelligence.bidComplexity, provenance, "bidComplexity"),
    competitionLevel: intelligenceField(
      intelligence.competitionLevel,
      provenance,
      "competitionLevel",
    ),
    competitionNotes: intelligenceField(
      intelligence.competitionNotes,
      provenance,
      "competitionNotes",
    ),
    deadlineUrgency: intelligenceField(
      intelligence.deadlineUrgency,
      provenance,
      "deadlineUrgency",
    ),
    riskFlags: intelligenceField(riskFlags, provenance, "riskFlags"),
    estimatedRenewalDate: intelligenceField(
      intelligence.estimatedRenewalDate,
      provenance,
      "estimatedRenewalDate",
    ),
    overallConfidence: intelligence.confidence,
    generationMethod: intelligence.generationMethod,
    modelVersion: intelligence.modelVersion,
    generatedAt: intelligence.generatedAt,
  };
}

export function toPaidDealDto(input: PaidDealMappingInput): PaidDealDto {
  const { deal } = input;
  const access = sourceContentAccess(input.source?.reuse_status);
  const showMetadata = canShowNoticeMetadata(access);
  const redistribute = canRedistributeVerbatim(access);
  const linkSource = canLinkToSource(access);
  const buyer = toPaidBuyerDto(input.buyer, showMetadata);
  const notices = mapNotices(input.notices, showMetadata, linkSource);
  const lots = mapLots(input.lots ?? [], showMetadata, redistribute);
  const requirements = mapRequirements(input.requirements ?? [], showMetadata);
  const awardCriteria = mapAwardCriteria(input.awardCriteria ?? [], showMetadata);
  const changes = showMetadata
    ? (input.changes ?? []).map((change) => ({
        id: change.id,
        changeType: change.change_type,
        fieldName: change.field_name,
        occurredAt: change.occurred_at,
        material: change.material,
      }))
    : [];

  return {
    id: deal.id,
    sourceTitle: showMetadata ? deal.source_title : "Source content withheld",
    sourceDescription: redistribute ? deal.source_description : null,
    reference: showMetadata ? deal.reference : null,
    ocid: showMetadata ? deal.ocid : null,
    externalPrimaryId: showMetadata ? deal.external_primary_id : null,
    dealType: parseEnum(deal.deal_type, DEAL_TYPES, "PUBLIC_TENDER"),
    buyerSector: parseBuyerSector(deal.buyer_sector),
    stage: parseEnum(deal.stage, DEAL_STAGES, "LIVE"),
    status: parseEnum(deal.status, DEAL_STATUSES, "OPEN"),
    mainCategory: deal.main_category,
    procurementMethod: showMetadata ? deal.procurement_method : null,
    specialRegime: showMetadata ? deal.special_regime : null,
    currency: deal.currency,
    valueMinExVat: showMetadata ? deal.value_min_ex_vat : null,
    valueMaxExVat: showMetadata ? deal.value_max_ex_vat : null,
    exactValueText: showMetadata ? deal.exact_value_text : null,
    exactLocationText: showMetadata ? deal.exact_location_text : null,
    enquiryDeadline: showMetadata ? deal.enquiry_deadline : null,
    submissionDeadline: showMetadata ? deal.submission_deadline : null,
    awardDecisionDate: showMetadata ? deal.award_decision_date : null,
    contractStartDate: showMetadata ? deal.contract_start_date : null,
    contractEndDate: showMetadata ? deal.contract_end_date : null,
    extensionEndDate: showMetadata ? deal.extension_end_date : null,
    nextProcurementDate: showMetadata ? deal.next_procurement_date : null,
    estimatedRenewalDate: showMetadata ? deal.estimated_renewal_date : null,
    smeSuitable: deal.sme_suitable,
    vcseSuitable: deal.vcse_suitable,
    sourceUrl: linkSource ? safeHttpUrl(deal.source_url) : null,
    applicationUrl: linkSource ? safeHttpUrl(deal.application_url) : null,
    firstPublishedAt: showMetadata ? deal.first_published_at : null,
    latestSourceAt: showMetadata ? deal.latest_source_at : null,
    buyer,
    procurementContact: toProcurementContact(buyer),
    source: showMetadata ? toPaidSourceDto(input.source) : null,
    provenance: toProvenance(input.source, access),
    notices,
    documents: mapDocuments(input.documents, linkSource),
    lots,
    requirements,
    awardCriteria,
    timeline: showMetadata
      ? buildPaidTimeline({
          firstPublishedAt: deal.first_published_at,
          latestSourceAt: deal.latest_source_at,
          enquiryDeadline: deal.enquiry_deadline,
          submissionDeadline: deal.submission_deadline,
          awardDecisionDate: deal.award_decision_date,
          contractStartDate: deal.contract_start_date,
          contractEndDate: deal.contract_end_date,
          extensionEndDate: deal.extension_end_date,
          nextProcurementDate: deal.next_procurement_date,
          estimatedRenewalDate: deal.estimated_renewal_date,
          notices,
          changes,
        })
      : [],
    intelligence:
      showMetadata && input.intelligence ? toPaidIntelligence(input.intelligence) : null,
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
