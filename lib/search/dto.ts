import type { DealCardData, SuitabilityLevel } from "@/components/deals/types";
import type { BuyerSector } from "@/lib/constants";
import { BUYER_SECTORS } from "@/lib/constants";
import type { DealPreviewPublic, DealPreviewSearchRow } from "@/lib/db/previews";
import type { SafeMatchView } from "@/lib/matching/types";
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
};

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
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        if (typeof record.text === "string") {
          return record.text.trim();
        }
        if (typeof record.label === "string") {
          return record.label.trim();
        }
      }
      return "";
    })
    .filter((item) => item.length > 0 && item.length <= 500)
    .slice(0, 20);
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

export function toPublicDealPreview(
  row: DealPreviewPublic | DealPreviewSearchRow,
): PublicDealPreview {
  return {
    slug: row.slug,
    previewTitle: row.preview_title,
    previewSummary: row.preview_summary,
    dealType: parseEnum(row.deal_type, DEAL_TYPES, "PUBLIC_TENDER"),
    buyerSector: parseBuyerSector(row.buyer_sector),
    stage: parseEnum(row.stage, DEAL_STAGES, "LIVE"),
    status: parseEnum(row.status, DEAL_STATUSES, "OPEN"),
    mainCategory: row.main_category,
    broadRegion: row.broad_region,
    valueBand: row.value_band,
    deadlineBand: row.deadline_band,
    durationBand: row.duration_band,
    smeSuitability: parseLevel(row.sme_suitability),
    bidComplexity: parseLevel(row.bid_complexity),
    competitionLevel: parseLevel(row.competition_level),
    requirementsPreview: parseRequirementsPreview(row.requirements_preview),
    relevanceTags: Array.isArray(row.relevance_tags)
      ? row.relevance_tags.filter((tag): tag is string => typeof tag === "string").slice(0, 12)
      : [],
    freshnessLabel: row.freshness_label,
  };
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
