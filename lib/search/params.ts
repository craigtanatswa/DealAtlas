import { z } from "zod";

import {
  DEAL_STATUSES,
  DEAL_TYPES,
  type DealStatus,
  type DealType,
} from "@/lib/search/filters";
import { BUYER_SECTORS, type BuyerSector } from "@/lib/constants";
import { parseInputSafe } from "@/lib/validation";

export const PUBLIC_SEARCH_PAGE_SIZE = 20;
export const PUBLIC_DEALS_PAGE_SIZE = 10;
export const PUBLIC_SEARCH_MAX_PAGE_SIZE = 50;
export const PUBLIC_SEARCH_MAX_PAGE = 500;
export const SEARCH_SORTS = ["biddable", "deadline", "updated", "relevance"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

const optionalTrimmed = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((value) => {
    if (!value) {
      return undefined;
    }
    return value;
  });

export const publicSearchInputSchema = z.object({
  query: optionalTrimmed,
  category: optionalTrimmed,
  buyerSector: z.enum(BUYER_SECTORS).optional(),
  region: optionalTrimmed,
  valueBand: z.string().trim().min(1).max(80).optional(),
  deadlineBand: z.string().trim().min(1).max(80).optional(),
  dealType: z.enum(DEAL_TYPES).optional(),
  status: z.enum(DEAL_STATUSES).optional(),
  sort: z.enum(SEARCH_SORTS).optional(),
  page: z.coerce.number().int().min(1).max(PUBLIC_SEARCH_MAX_PAGE).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PUBLIC_SEARCH_MAX_PAGE_SIZE)
    .default(PUBLIC_SEARCH_PAGE_SIZE),
});

export type PublicSearchInput = z.infer<typeof publicSearchInputSchema>;

export type PublicSearchFilters = {
  query?: string;
  category?: string;
  buyerSector?: BuyerSector;
  region?: string;
  valueBand?: string;
  deadlineBand?: string;
  dealType?: DealType;
  status?: DealStatus;
  page: number;
  limit: number;
  sort?: SearchSort;
  minScore?: number;
};

export type SignedInSearchFilters = PublicSearchFilters & {
  sort: SearchSort;
};

export type SearchParamRecord = Record<
  string,
  string | string[] | undefined
>;

/**
 * Page must be a positive integer. Anything else becomes page 1 so a bad
 * `page` value cannot fail the rest of the filter parse.
 */
export function parseSearchPage(value: string | undefined): number {
  if (!value) {
    return 1;
  }
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return 1;
  }
  const page = Number(trimmed);
  if (!Number.isSafeInteger(page) || page < 1) {
    return 1;
  }
  return Math.min(page, PUBLIC_SEARCH_MAX_PAGE);
}

/** Clamp a requested page onto 1..pageCount. An empty result set is page 1. */
export function clampSearchPage(page: number, total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0) {
    return 1;
  }
  const size = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 1;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  return Math.min(current, pageCount);
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function optionalEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  if (!value) {
    return undefined;
  }
  return (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/**
 * Parse public search/filter query params. Invalid enum values are ignored
 * so a crafted URL cannot 500 the free search page.
 */
export function parsePublicSearchParams(
  searchParams: SearchParamRecord,
): PublicSearchFilters {
  const raw = {
    query: firstParam(searchParams.q) ?? firstParam(searchParams.query),
    category: firstParam(searchParams.category),
    buyerSector: optionalEnum(firstParam(searchParams.buyerSector), BUYER_SECTORS),
    region: firstParam(searchParams.region),
    valueBand: firstParam(searchParams.valueBand),
    deadlineBand: firstParam(searchParams.deadlineBand),
    dealType: optionalEnum(firstParam(searchParams.dealType), DEAL_TYPES),
    status: optionalEnum(firstParam(searchParams.status), DEAL_STATUSES),
    sort: optionalEnum(firstParam(searchParams.sort), SEARCH_SORTS),
    page: parseSearchPage(firstParam(searchParams.page)),
    limit: firstParam(searchParams.limit),
  };

  const parsed = parseInputSafe(publicSearchInputSchema, raw);
  if (parsed.success) {
    return parsed.data;
  }

  const query = raw.query?.trim().slice(0, 200);
  const category = raw.category?.trim().slice(0, 200);
  return {
    query: query || undefined,
    category: category || undefined,
    page: 1,
    limit: PUBLIC_SEARCH_PAGE_SIZE,
  };
}

export function publicSearchOffset(filters: PublicSearchFilters): number {
  return (filters.page - 1) * filters.limit;
}

export function hasActivePublicFilters(filters: PublicSearchFilters): boolean {
  return Boolean(
    filters.query ||
      filters.category ||
      filters.buyerSector ||
      filters.region ||
      filters.valueBand ||
      filters.deadlineBand ||
      filters.dealType ||
      filters.status,
  );
}

export function toPublicSearchQuery(filters: PublicSearchFilters): string {
  const params = new URLSearchParams();
  if (filters.query) {
    params.set("q", filters.query);
  }
  if (filters.category) {
    params.set("category", filters.category);
  }
  if (filters.buyerSector) {
    params.set("buyerSector", filters.buyerSector);
  }
  if (filters.region) {
    params.set("region", filters.region);
  }
  if (filters.valueBand) {
    params.set("valueBand", filters.valueBand);
  }
  if (filters.deadlineBand) {
    params.set("deadlineBand", filters.deadlineBand);
  }
  if (filters.dealType) {
    params.set("dealType", filters.dealType);
  }
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.sort && filters.sort !== "biddable") {
    params.set("sort", filters.sort);
  }
  if (filters.minScore != null) {
    params.set("minScore", String(filters.minScore));
  }
  if (filters.page > 1) {
    params.set("page", String(filters.page));
  }
  const query = params.toString();
  return query ? `/deals?${query}` : "/deals";
}

export function searchHref(
  filters: PublicSearchFilters,
  page = filters.page,
  path = "/deals",
): string {
  const url = toPublicSearchQuery({ ...filters, page });
  if (path === "/deals") {
    return url;
  }
  return url.replace(/^\/deals/, path);
}

export function publicSearchHref(
  filters: PublicSearchFilters,
  page = filters.page,
): string {
  return searchHref(filters, page, "/deals");
}

export function parseSignedInSearchParams(
  searchParams: SearchParamRecord,
  options?: { defaultSort?: SearchSort },
): SignedInSearchFilters {
  const base = parsePublicSearchParams(searchParams);
  const sort =
    optionalEnum(firstParam(searchParams.sort), SEARCH_SORTS) ??
    options?.defaultSort ??
    "biddable";
  const minScoreRaw = firstParam(searchParams.minScore);
  const minScoreParsed = minScoreRaw ? Number(minScoreRaw) : Number.NaN;
  const minScore =
    Number.isFinite(minScoreParsed) && minScoreParsed >= 0 && minScoreParsed <= 100
      ? Math.round(minScoreParsed)
      : undefined;
  return {
    ...base,
    sort,
    minScore,
  };
}
