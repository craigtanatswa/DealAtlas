import "server-only";

import { ADMIN_PAGE_SIZE } from "@/lib/admin/paths";
import type {
  AdminDiscoveryCandidateDetail,
  AdminDiscoveryCandidateRow,
  AdminDiscoveryKeywordRow,
  AdminDiscoveryMetrics,
  AdminDiscoveryOverview,
  AdminDiscoverySourceRow,
  AdminListResult,
} from "@/lib/admin/types";
import { searchMaxQueriesFromEnv } from "@/ingestion/discovery/search/env";
import { DEFAULT_LLM_MAX_CALLS_PER_RUN } from "@/ingestion/intelligence/provider";
import type { Database, Json } from "@/lib/db/database.types";
import { throwIfQueryError } from "@/lib/db/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type CandidateStatus = Database["public"]["Enums"]["candidate_status"];



function admin() {
  return createSupabaseAdminClient();
}

type CandidateQueryRow = {
  id: string;
  source_id: string;
  url: string;
  title: string | null;
  buyer_name: string | null;
  buyer_domain: string | null;
  deadline: string | null;
  confidence: number;
  opportunity_type: Database["public"]["Enums"]["deal_type"] | null;
  status: CandidateStatus;
  reject_reason: string | null;
  merged_deal_id: string | null;
  created_at: string;
  updated_at: string;
  extraction: unknown;
};

type SourceNameRow = { id: string; source_key: string; name: string };

type SourceHealthRow = {
  enabled: boolean;
  consecutive_failures: number;
  reliability_score: number | null;
  last_error: string | null;
};

export function sourceHealthForMetrics(
  source: SourceHealthRow,
): "healthy" | "degraded" | "down" | "disabled" {
  if (!source.enabled) {
    return "disabled";
  }
  const restricted =
    source.last_error != null &&
    /(?:HTTP_(?:401|403|429)|REUSE_(?:UNKNOWN|PROHIBITED)|ROBOTS_DISALLOW|SCRAPING_NOT_PERMITTED|CAPTCHA|LOGIN_REQUIRED|PAYWALL)/i.test(
      source.last_error,
    );
  if (source.consecutive_failures >= 8 || restricted) {
    return "down";
  }
  if (
    source.consecutive_failures > 0 ||
    (source.reliability_score != null && source.reliability_score < 70)
  ) {
    return "degraded";
  }
  return "healthy";
}

export function discoveryMetricsFromRows(input: {
  jobRuns: Array<{ summary: unknown }>;
  candidates: Array<{
    discovery_channel: string | null;
    blocked_reason: string | null;
    domain: string | null;
  }>;
  sources: SourceHealthRow[];
  expiredCount: number;
  searchQueryCap?: number;
  llmCallCap?: number;
  llmCallsUsedMonth?: number;
}): AdminDiscoveryMetrics {
  const candidatesByMethod = { SEARCH: 0, CRAWL: 0, UNKNOWN: 0 };
  const blocked = new Map<string, number>();
  for (const row of input.candidates) {
    const channel =
      row.discovery_channel === "SEARCH" || row.discovery_channel === "CRAWL"
        ? row.discovery_channel
        : "UNKNOWN";
    candidatesByMethod[channel] += 1;
    if (row.blocked_reason && row.domain) {
      blocked.set(row.domain, (blocked.get(row.domain) ?? 0) + 1);
    }
  }

  let searchQueriesUsedMonth = 0;
  let llmCallsUsedMonth = 0;
  for (const run of input.jobRuns) {
    if (!run.summary || typeof run.summary !== "object" || Array.isArray(run.summary)) {
      continue;
    }
    const summary = run.summary as Record<string, unknown>;
    if (typeof summary.searchQueriesUsed === "number") {
      searchQueriesUsedMonth += summary.searchQueriesUsed;
    }
    if (typeof summary.llmCallsUsed === "number") {
      llmCallsUsedMonth += summary.llmCallsUsed;
    }
  }

  const sourcesByHealth = { healthy: 0, degraded: 0, down: 0, disabled: 0 };
  for (const source of input.sources) {
    sourcesByHealth[sourceHealthForMetrics(source)] += 1;
  }

  return {
    searchQueriesUsedMonth,
    searchQueryCap: input.searchQueryCap ?? searchMaxQueriesFromEnv(process.env),
    llmCallsUsedMonth: input.llmCallsUsedMonth ?? llmCallsUsedMonth,
    llmCallCap: input.llmCallCap ?? llmCapFromEnv(),
    candidatesByMethod,
    blockedDomains: [...blocked.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
      .slice(0, 10),
    sourcesByHealth,
    expiredCount: input.expiredCount,
  };
}

function llmCapFromEnv(): number {
  const raw = process.env.DEALATLAS_LLM_MAX_CALLS_PER_RUN?.trim();
  if (!raw) {
    return DEFAULT_LLM_MAX_CALLS_PER_RUN;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : DEFAULT_LLM_MAX_CALLS_PER_RUN;
}

function monthStartIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function budgetFromExtraction(extraction: unknown): {
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string | null;
  location: string | null;
} {
  if (!extraction || typeof extraction !== "object" || Array.isArray(extraction)) {
    return { budgetMin: null, budgetMax: null, currency: null, location: null };
  }
  const value = extraction as Record<string, unknown>;
  const numberOrNull = (input: unknown): number | null =>
    typeof input === "number" && Number.isFinite(input) ? input : null;
  return {
    budgetMin: numberOrNull(value.budgetMin),
    budgetMax: numberOrNull(value.budgetMax),
    currency: typeof value.currency === "string" ? value.currency : null,
    location: typeof value.location === "string" ? value.location : null,
  };
}

function mapCandidate(
  row: CandidateQueryRow,
  sources: Map<string, SourceNameRow>,
): AdminDiscoveryCandidateRow {
  const source = sources.get(row.source_id);
  const budget = budgetFromExtraction(row.extraction);
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceKey: source?.source_key ?? null,
    sourceName: source?.name ?? null,
    status: row.status,
    opportunityType: row.opportunity_type ?? "OTHER",
    title: row.title ?? "(untitled candidate)",
    buyerName: row.buyer_name,
    buyerDomain: row.buyer_domain,
    location: budget.location,
    budgetMin: budget.budgetMin,
    budgetMax: budget.budgetMax,
    currency: budget.currency,
    deadline: row.deadline,
    confidence: row.confidence,
    rejectReason: row.reject_reason,
    mergedDealId: row.merged_deal_id,
    url: row.url,
    normalizedUrl: row.url,
    discoveredAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function sourceNames(ids: string[]): Promise<Map<string, SourceNameRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return new Map();
  }
  const { data, error } = await admin()
    .from("data_sources")
    .select("id, source_key, name")
    .in("id", unique);
  const rows = throwIfQueryError("Failed to load discovery source names", {
    data: data ?? [],
    error,
  });
  return new Map(rows.map((row) => [row.id, row]));
}

export async function loadDiscoveryOverview(
  now: Date = new Date(),
): Promise<AdminDiscoveryOverview> {
  const monthStart = monthStartIso(now);
  const [candidateRows, sourceRows, keywordRows, jobRows, methodRows, llmRows] =
    await Promise.all([
    admin()
      .from("opportunity_candidates")
      .select("id, source_id, url, title, buyer_name, buyer_domain, deadline, confidence, opportunity_type, status, reject_reason, merged_deal_id, created_at, updated_at, extraction")
      .order("created_at", { ascending: false })
      .limit(1000),
    admin()
      .from("data_sources")
      .select("id, source_key, name, enabled, discovery_method, auto_publish, auto_publish_min_confidence, last_success_at, opportunities_discovered, reliability_score, last_error, consecutive_failures")
      .not("discovery_method", "is", null)
      .order("name"),
    admin()
      .from("discovery_keywords")
      .select("id, keyword, normalized_keyword, enabled, created_at")
      .order("keyword"),
    admin()
      .from("job_runs")
      .select("summary, started_at")
      .eq("job_name", "discover")
      .gte("started_at", monthStart)
      .limit(500),
    admin()
      .from("discovered_source_candidates")
      .select("discovery_channel, blocked_reason, domain")
      .gte("discovered_at", monthStart)
      .limit(5000),
    admin()
      .from("discovered_source_candidates")
      .select("id", { count: "exact", head: true })
      .gte("discovered_at", monthStart)
      .eq("raw_payload->>classificationMethod", "LLM"),
  ]);

  const candidates = throwIfQueryError("Failed to load discovery candidates", {
    data: (candidateRows.data ?? []) as CandidateQueryRow[],
    error: candidateRows.error,
  });
  const sources = throwIfQueryError("Failed to load discovery sources", {
    data: sourceRows.data ?? [],
    error: sourceRows.error,
  });
  const keywords = throwIfQueryError("Failed to load discovery keywords", {
    data: keywordRows.data ?? [],
    error: keywordRows.error,
  });
  const jobRuns = throwIfQueryError("Failed to load discovery usage", {
    data: jobRows.data ?? [],
    error: jobRows.error,
  });
  const methodCandidates = throwIfQueryError("Failed to load discovery channels", {
    data: (methodRows.data ?? []) as Array<{
      discovery_channel: string | null;
      blocked_reason: string | null;
      domain: string | null;
    }>,
    error: methodRows.error,
  });
  const llmCalls = throwIfQueryError("Failed to load LLM usage", {
    data: { count: llmRows.count ?? 0 },
    error: llmRows.error,
  });

  const names = new Map(sources.map((source) => [source.id, source]));
  const counts: Record<CandidateStatus, number> = {
    PENDING_REVIEW: 0,
    APPROVED: 0,
    REJECTED: 0,
    DUPLICATE: 0,
    EXPIRED: 0,
  };
  const perSource = new Map<string, number>();
  for (const candidate of candidates) {
    counts[candidate.status] += 1;
    perSource.set(candidate.source_id, (perSource.get(candidate.source_id) ?? 0) + 1);
  }

  const overviewSources: AdminDiscoverySourceRow[] = sources.map((source) => ({
    id: source.id,
    sourceKey: source.source_key,
    name: source.name,
    enabled: source.enabled,
    discoveryMethod: source.discovery_method,
    autoPublish: source.auto_publish,
    autoPublishMinConfidence: source.auto_publish_min_confidence,
    lastSuccessAt: source.last_success_at,
    opportunitiesDiscovered: source.opportunities_discovered,
    reliabilityScore: source.reliability_score,
    lastError: source.last_error,
    health: sourceHealthForMetrics(source),
    candidateCount: perSource.get(source.id) ?? 0,
  }));

  return {
    counts,
    metrics: discoveryMetricsFromRows({
      jobRuns,
      candidates: methodCandidates,
      sources,
      expiredCount: counts.EXPIRED,
      llmCallsUsedMonth: llmCalls.count,
    }),
    sources: overviewSources,
    recent: candidates.slice(0, 12).map((row) => mapCandidate(row, names)),
    keywords: keywords.map((row) => ({
      id: row.id,
      keyword: row.keyword,
      normalizedKeyword: row.normalized_keyword,
      enabled: row.enabled,
      createdAt: row.created_at,
    })),
  };
}

export async function loadDiscoveryCandidates(input: {
  status?: CandidateStatus | null;
  page?: number;
  pageSize?: number;
}): Promise<AdminListResult<AdminDiscoveryCandidateRow>> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = input.pageSize ?? ADMIN_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  let query = admin()
    .from("opportunity_candidates")
    .select("id, source_id, url, title, buyer_name, buyer_domain, deadline, confidence, opportunity_type, status, reject_reason, merged_deal_id, created_at, updated_at, extraction", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (input.status) {
    query = query.eq("status", input.status);
  }
  const { data, error, count } = await query;
  const rows = throwIfQueryError("Failed to load discovery candidates", {
    data: (data ?? []) as CandidateQueryRow[],
    error,
  });
  const names = await sourceNames(rows.map((row) => row.source_id));
  return {
    rows: rows.map((row) => mapCandidate(row, names)),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function loadDiscoveryKeywords(): Promise<AdminDiscoveryKeywordRow[]> {
  const { data, error } = await admin()
    .from("discovery_keywords")
    .select("id, keyword, normalized_keyword, enabled, created_at")
    .order("keyword");
  const rows = throwIfQueryError("Failed to load discovery keywords", {
    data: data ?? [],
    error,
  });
  return rows.map((row) => ({
    id: row.id,
    keyword: row.keyword,
    normalizedKeyword: row.normalized_keyword,
    enabled: row.enabled,
    createdAt: row.created_at,
  }));
}

export async function loadDiscoveryCandidate(
  candidateId: string,
): Promise<AdminDiscoveryCandidateDetail | null> {
  const { data, error } = await admin()
    .from("opportunity_candidates")
    .select("id, source_id, url, title, buyer_name, buyer_domain, deadline, confidence, opportunity_type, status, reject_reason, merged_deal_id, created_at, updated_at, extraction")
    .eq("id", candidateId)
    .maybeSingle();
  const row = throwIfQueryError("Failed to load discovery candidate", {
    data: data as CandidateQueryRow | null,
    error,
  });
  if (!row) {
    return null;
  }
  const names = await sourceNames([row.source_id]);
  const candidate = mapCandidate(row, names);

  let preview: AdminDiscoveryCandidateDetail["preview"] = null;
  if (row.merged_deal_id) {
    const { data: previewRow, error: previewError } = await admin()
      .from("deal_previews")
      .select("deal_id, slug, preview_title, is_published, leakage_risk")
      .eq("deal_id", row.merged_deal_id)
      .maybeSingle();
    const previewData = throwIfQueryError("Failed to load candidate preview", {
      data: previewRow,
      error: previewError,
    });
    if (previewData) {
      preview = {
        dealId: previewData.deal_id,
        slug: previewData.slug,
        previewTitle: previewData.preview_title,
        isPublished: previewData.is_published,
        leakageRisk: previewData.leakage_risk,
      };
    }
  }

  return { candidate, extraction: (row.extraction ?? {}) as Json, preview };
}
