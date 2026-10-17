import type { DealCardData, SuitabilityLevel } from "@/components/deals/types";
import type { BuyerSector } from "@/lib/constants";
import { BUYER_SECTORS } from "@/lib/constants";
import type { DealPreviewSearchRow } from "@/lib/db/previews";
import type { SafeMatchView } from "@/lib/matching/types";
import {
  decodePreviewDetails,
  type PreviewDetails,
} from "@/lib/preview/compose";
import {
  DEAL_STAGES,
  DEAL_STATUSES,
  DEAL_TYPES,
  type DealStage,
  type DealStatus,
  type DealType,
} from "@/lib/search/filters";

const SUITABILITY_LEVELS = ["LOW", "MEDIUM", "HIGH", "UNKNOWN"] as const;

export const PUBLIC_PREVIEW_DTO_KEYS = [
  "slug",
  "previewTitle",
  "previewSummary",
  "dealType",
  "buyerSector",
  "stage",
  "status",
  "mainCategory",
  "broadRegion",
  "valueBand",
  "deadlineBand",
  "durationBand",
  "smeSuitability",
  "bidComplexity",
  "competitionLevel",
  "requirementsPreview",
  "relevanceTags",
  "freshnessLabel",
  "goodsServices",
  "quantities",
  "technicalSpecs",
  "standards",
  "keyDates",
  "deliveryRequirements",
  "scope",
  "commercialRequirements",
  "currency",
  "specificSector",
] as const;

export type PublicDealPreview = {
  slug: string;
  previewTitle: string;
  previewSummary: string;
  dealType: DealType;
  buyerSector: BuyerSector;
  stage: DealStage;
  status: DealStatus;
  mainCategory: string | null;
  broadRegion: string | null;
  valueBand: string | null;
  deadlineBand: string | null;
  durationBand: string | null;
  smeSuitability: SuitabilityLevel | null;
  bidComplexity: SuitabilityLevel | null;
  competitionLevel: SuitabilityLevel | null;
  requirementsPreview: string[];
  relevanceTags: string[];
  freshnessLabel: string | null;
} & PreviewDetails;

export type PublicDealSearchResult = {
  items: PublicDealPreview[];
  total: number;
  page: number;
  pageSize: number;
};

export type RankedDealSearchItem = {
  preview: PublicDealPreview;
  match: SafeMatchView | null;
};

export type RankedDealSearchResult = {
  items: RankedDealSearchItem[];
  total: number;
  page: number;
  pageSize: number;
};

const FORBIDDEN_PREVIEW_KEYS = [
  "buyer_name",
  "buyerName",
  "canonical_name",
  "source_url",
  "sourceUrl",
  "source_title",
  "sourceTitle",
  "application_url",
  "applicationUrl",
  "ocid",
  "reference",
  "notice_identifier",
  "contact_email",
  "contactEmail",
  "email",
  "phone",
  "domain",
  "website",
] as const;

export function parseRequirementsPreview(value: unknown): string[] {
  return decodePreviewDetails(value).requirements;
}

function parseLevel(value: unknown): SuitabilityLevel | null {
  if (typeof value !== "string") {
    return null;
  }
  return SUITABILITY_LEVELS.includes(value as SuitabilityLevel)
    ? (value as SuitabilityLevel)
    : null;
}

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

/** Sanitised preview fields shared by every preview DTO RPC. */
export type PreviewDtoFields = Pick<
  DealPreviewSearchRow,
  | "slug"
  | "preview_title"
  | "preview_summary"
  | "deal_type"
  | "buyer_sector"
  | "stage"
  | "status"
  | "main_category"
  | "broad_region"
  | "value_band"
  | "deadline_band"
  | "duration_band"
  | "sme_suitability"
  | "bid_complexity"
  | "competition_level"
  | "requirements_preview"
  | "relevance_tags"
  | "freshness_label"
>;

const PREVIEW_FIELD_KEYS = new Set<string>([
  "slug",
  "preview_title",
  "preview_summary",
  "deal_type",
  "buyer_sector",
  "stage",
  "status",
  "main_category",
  "broad_region",
  "value_band",
  "deadline_band",
  "duration_band",
  "sme_suitability",
  "bid_complexity",
  "competition_level",
  "requirements_preview",
  "relevance_tags",
  "freshness_label",
]);

const SOURCE_IDENTITY_PATTERNS = [
  /https?:\/\/\S+/gi,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /\bocds-[a-z0-9-]+\b/gi,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  /\bprocontract\b/gi,
  /\bdue[- ]north\b/gi,
  /\bthe chest\b/gi,
  /\bkent business portal\b/gi,
  /\bsource leicestershire\b/gi,
  /\beast mids tenders\b/gi,
  /\bessex procontract\b/gi,
  /\bfind a tender\b/gi,
  /\bcontracts finder\b/gi,
];

const IDENTITY_KEYS = new Set([
  "source_title",
  "sourceTitle",
  "source_url",
  "sourceUrl",
  "source_key",
  "sourceKey",
  "ocid",
  "reference",
  "buyer_name",
  "buyerName",
  "canonical_name",
  "canonicalName",
  "notice_identifier",
  "noticeIdentifier",
  "application_url",
  "applicationUrl",
  "advert_id",
  "advertId",
]);

function extraSourceStrings(row: object): string[] {
  const found: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (PREVIEW_FIELD_KEYS.has(key) || typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    const min = IDENTITY_KEYS.has(key) ? 4 : 12;
    if (trimmed.length >= min) {
      found.push(trimmed);
    }
  }
  return found;
}

/** Drop source identity from a free-user string. Extra row fields are never copied through. */
export function sanitizePublicPreviewText(value: string, blocked: readonly string[] = []): string {
  let next = value;
  for (const pattern of SOURCE_IDENTITY_PATTERNS) {
    pattern.lastIndex = 0;
    next = next.replace(pattern, " ");
  }
  for (const secret of blocked) {
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(escaped, "gi"), " ");
  }
  return next.replace(/\s+/g, " ").trim();
}

export function toPublicDealPreview(row: PreviewDtoFields): PublicDealPreview {
  const blocked = extraSourceStrings(row);
  const title = sanitizePublicPreviewText(row.preview_title, blocked) || "Public sector opportunity";
  const summary = sanitizePublicPreviewText(row.preview_summary, blocked);
  return {
    slug: row.slug,
    previewTitle: title,
    previewSummary: summary,
    dealType: parseEnum(row.deal_type, DEAL_TYPES, "PUBLIC_TENDER"),
    buyerSector: parseBuyerSector(row.buyer_sector),
    stage: parseEnum(row.stage, DEAL_STAGES, "LIVE"),
    status: parseEnum(row.status, DEAL_STATUSES, "OPEN"),
    mainCategory: cleanPreviewText(row.main_category, blocked),
    broadRegion: cleanPreviewText(row.broad_region, blocked),
    valueBand: cleanPreviewText(row.value_band, blocked),
    deadlineBand: cleanPreviewText(row.deadline_band, blocked),
    durationBand: cleanPreviewText(row.duration_band, blocked),
    smeSuitability: parseLevel(row.sme_suitability),
    bidComplexity: parseLevel(row.bid_complexity),
    competitionLevel: parseLevel(row.competition_level),
    requirementsPreview: parseRequirementsPreview(row.requirements_preview)
      .map((item) => sanitizePublicPreviewText(item, blocked))
      .filter((item) => item.length > 0),
    relevanceTags: Array.isArray(row.relevance_tags)
      ? row.relevance_tags
          .filter((tag): tag is string => typeof tag === "string")
          .map((tag) => sanitizePublicPreviewText(tag, blocked))
          .filter((tag) => tag.length > 0)
          .slice(0, 12)
      : [],
    freshnessLabel: cleanPreviewText(row.freshness_label, blocked),
    ...sanitizePreviewDetails(decodePreviewDetails(row.requirements_preview).details, blocked),
  };
}

/** Run the decoded rich-preview detail fields through the same source-identity scrub. */
function sanitizePreviewDetails(details: PreviewDetails, blocked: readonly string[]): PreviewDetails {
  const list = (items: string[]) =>
    items.map((item) => sanitizePublicPreviewText(item, blocked)).filter((item) => item.length > 0);
  return {
    ...details,
    goodsServices: list(details.goodsServices),
    quantities: list(details.quantities),
    technicalSpecs: list(details.technicalSpecs),
    standards: list(details.standards),
    deliveryRequirements: list(details.deliveryRequirements),
    commercialRequirements: list(details.commercialRequirements),
    keyDates: cleanPreviewText(details.keyDates, blocked),
    scope: cleanPreviewText(details.scope, blocked),
    specificSector: cleanPreviewText(details.specificSector, blocked),
  };
}

function cleanPreviewText(value: string | null, blocked: readonly string[]): string | null {
  if (!value) {
    return null;
  }
  return sanitizePublicPreviewText(value, blocked) || null;
}

export function toDealCardData(
  preview: PublicDealPreview,
  matchScore?: number | null,
  matchReasons?: string[] | null,
): DealCardData {
  return {
    slug: preview.slug,
    previewTitle: preview.previewTitle,
    previewSummary: preview.previewSummary,
    buyerSector: preview.buyerSector,
    mainCategory: preview.mainCategory,
    broadRegion: preview.broadRegion,
    valueBand: preview.valueBand,
    deadlineBand: preview.deadlineBand,
    smeSuitability: preview.smeSuitability,
    bidComplexity: preview.bidComplexity,
    status: preview.status,
    dealType: preview.dealType,
    relevanceTags: preview.relevanceTags.slice(0, 4),
    freshnessLabel: preview.freshnessLabel,
    goodsServices: preview.goodsServices,
    quantities: preview.quantities,
    standards: preview.standards,
    keyDates: preview.keyDates,
    specificSector: preview.specificSector,
    currency: preview.currency,
    matchScore: matchScore ?? null,
    matchReasons: (matchReasons ?? []).slice(0, 3),
  };
}

export function assertPublicPreviewDto(value: unknown): PublicDealPreview {
  if (!value || typeof value !== "object") {
    throw new Error("Public preview DTO must be an object");
  }

  const record = value as Record<string, unknown>;
  for (const key of FORBIDDEN_PREVIEW_KEYS) {
    if (key in record) {
      throw new Error(`Public preview DTO contains protected key ${key}`);
    }
  }

  return value as PublicDealPreview;
}
