import { z } from "zod";

import { BUYER_SECTORS } from "@/lib/constants";
import {
  DEAL_STATUSES,
  DEAL_TYPES,
} from "@/lib/search/filters";
import {
  PUBLIC_SEARCH_PAGE_SIZE,
  SEARCH_SORTS,
  searchHref,
  type PublicSearchFilters,
  type SignedInSearchFilters,
} from "@/lib/search/params";
import { parseInputSafe } from "@/lib/validation";

export const ALERT_CADENCES = ["NONE", "IMMEDIATE", "DAILY", "WEEKLY"] as const;
export type AlertCadence = (typeof ALERT_CADENCES)[number];

export const savedSearchFiltersSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(200).optional(),
  buyerSector: z.enum(BUYER_SECTORS).optional(),
  region: z.string().trim().min(1).max(200).optional(),
  valueBand: z.string().trim().min(1).max(80).optional(),
  deadlineBand: z.string().trim().min(1).max(80).optional(),
  dealType: z.enum(DEAL_TYPES).optional(),
  status: z.enum(DEAL_STATUSES).optional(),
  sort: z.enum(SEARCH_SORTS).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
});

export type SavedSearchFilters = z.infer<typeof savedSearchFiltersSchema>;

export const savedSearchInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  alertCadence: z.enum(ALERT_CADENCES).default("WEEKLY"),
  enabled: z.boolean().default(true),
  filters: savedSearchFiltersSchema,
});

export function toSavedSearchFilters(
  filters: PublicSearchFilters | SignedInSearchFilters,
): SavedSearchFilters {
  const parsed = parseInputSafe(savedSearchFiltersSchema, {
    query: filters.query,
    category: filters.category,
    buyerSector: filters.buyerSector,
    region: filters.region,
    valueBand: filters.valueBand,
    deadlineBand: filters.deadlineBand,
    dealType: filters.dealType,
    status: filters.status,
    sort: "sort" in filters ? filters.sort : undefined,
    minScore: "minScore" in filters ? filters.minScore : undefined,
  });
  return parsed.success ? parsed.data : {};
}

export function parseSavedSearchFilters(value: unknown): SavedSearchFilters {
  const parsed = parseInputSafe(savedSearchFiltersSchema, value ?? {});
  return parsed.success ? parsed.data : {};
}

export function savedSearchHref(filters: SavedSearchFilters): string {
  const publicFilters: PublicSearchFilters = {
    query: filters.query,
    category: filters.category,
    buyerSector: filters.buyerSector,
    region: filters.region,
    valueBand: filters.valueBand,
    deadlineBand: filters.deadlineBand,
    dealType: filters.dealType,
    status: filters.status,
    sort: filters.sort,
    minScore: filters.minScore,
    page: 1,
    limit: PUBLIC_SEARCH_PAGE_SIZE,
  };
  return searchHref(publicFilters, 1, "/app/search");
}

export function savedSearchSummary(filters: SavedSearchFilters): string {
  const parts: string[] = [];
  if (filters.query) {
    parts.push(`“${filters.query}”`);
  }
  if (filters.category) {
    parts.push(filters.category);
  }
  if (filters.buyerSector) {
    parts.push(filters.buyerSector.toLowerCase());
  }
  if (filters.region) {
    parts.push(filters.region);
  }
  if (filters.valueBand) {
    parts.push(filters.valueBand);
  }
  if (filters.deadlineBand) {
    parts.push(filters.deadlineBand);
  }
  if (filters.dealType) {
    parts.push(filters.dealType.replaceAll("_", " ").toLowerCase());
  }
  if (filters.status) {
    parts.push(filters.status.replaceAll("_", " ").toLowerCase());
  }
  if (filters.minScore != null) {
    parts.push(`score ≥ ${filters.minScore}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "All published opportunities";
}
