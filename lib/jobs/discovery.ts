import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import { throwIfQueryError } from "@/lib/db/errors";
import { DEFAULT_DISCOVERY_KEYWORDS } from "@/ingestion/discovery/keywords";
import { crawlDiscoverySource, type CrawlerSource } from "@/ingestion/discovery/crawler";
import {
  buildDiscoverySearchQueries,
  createSearchProviderFromEnv,
  runSearchDiscovery,
  searchMaxQueriesFromEnv,
  type SearchProvider,
} from "@/ingestion/discovery/search";
import {
  loadDiscoverySeeds,
  SEARCH_DISCOVERY_SOURCE_KEY,
  seededSourceKeys,
  UK_DISCOVERY_SEEDS,
  type SeedClient,
} from "@/ingestion/discovery/seeds";
import { createSupabaseDiscoveryStore } from "@/ingestion/discovery/store";
import type { DiscoveryStore } from "@/ingestion/discovery/types";
import {
  errorMessage,
  structuredLog,
  type LogEvent,
} from "@/lib/observability/log";

type Client = SupabaseClient<Database>;

export const HEALTH_FAILURE_THRESHOLD = 8;
export const HEALTH_LOW_RELIABILITY_THRESHOLD = 20;

export type DiscoverJobResult = {
  status: "SUCCEEDED" | "PARTIAL" | "SKIPPED";
  seedsInserted: number;
  searchSkipped: boolean;
  searchSkipReason: string | null;
  searchQueriesUsed: number;
  searchCandidates: number;
  searchErrors: number;
  crawledSources: number;
  crawlCandidates: number;
  crawlErrors: number;
  blockedSources: number;
  llmCallsUsed: number;
};

export type ExpiryJobResult = {
  status: "SUCCEEDED";
  expired: number;
  dryRun: boolean;
};

export type HealthJobResult = {
  status: "SUCCEEDED";
  checked: number;
  disabled: number;
  sources: string[];
};

export async function runDiscoverJob(input: {
  client: Client;
  env?: Record<string, string | undefined>;
  now?: Date;
  searchProvider?: SearchProvider | null;
  store?: DiscoveryStore;
  maxQueries?: number;
  maxPages?: number;
  http?: Parameters<typeof crawlDiscoverySource>[0]["http"];
  sleep?: (ms: number) => Promise<void>;
  log?: (event: LogEvent) => void;
}): Promise<DiscoverJobResult> {
  const env = input.env ?? process.env;
  const log = input.log ?? structuredLog;
  const now = input.now ?? new Date();
  const seedLoad = await loadDiscoverySeeds(input.client as unknown as SeedClient);
  const store = input.store ?? createSupabaseDiscoveryStore(input.client);

  const keywordResult = await input.client
    .from("discovery_keywords")
    .select("keyword, enabled")
    .eq("enabled", true);
  const keywordRows = throwIfQueryError("Load discovery keywords", {
    data: keywordResult.data ?? [],
    error: keywordResult.error,
  });
  const keywords =
    keywordRows.length > 0
      ? keywordRows.map((row) => row.keyword)
      : [...DEFAULT_DISCOVERY_KEYWORDS];

  const maxQueries = input.maxQueries ?? searchMaxQueriesFromEnv(env);
  const queries = buildDiscoverySearchQueries({
    keywords,
    seeds: UK_DISCOVERY_SEEDS.map((seed) => ({
      sourceKey: seed.sourceKey,
      baseUrl: seed.baseUrl,
    })),
    maxQueries,
  });
  const provider =
    input.searchProvider === undefined
      ? createSearchProviderFromEnv(env)
      : input.searchProvider;
  const searchSourceId = seedLoad.sourcesByKey.get(SEARCH_DISCOVERY_SOURCE_KEY) ?? null;

  const search = !provider
    ? await runSearchDiscovery({
        provider: null,
        queries,
        store,
        sourceId: searchSourceId ?? "",
        maxQueries,
        now,
        log,
      })
    : searchSourceId
      ? await runSearchDiscovery({
          provider,
          queries,
          store,
          sourceId: searchSourceId,
          maxQueries,
          now,
          log,
        })
      : {
          skipped: true,
          reason: "search source row unavailable",
          queriesUsed: 0,
          results: 0,
          candidates: 0,
          duplicates: 0,
          errors: 0,
        };

  const enabledKeys = seededSourceKeys().filter(
    (key) => key !== SEARCH_DISCOVERY_SOURCE_KEY,
  );
  const sourceResult = await input.client
    .from("data_sources")
    .select(
      "id, source_key, name, base_url, api_url, enabled, reuse_status, scraping_permitted, discovery_method, rate_limit_per_minute",
    )
    .in("source_key", enabledKeys)
    .eq("enabled", true);
  const sourceRows = throwIfQueryError("Load enabled discovery seeds", {
    data: sourceResult.data ?? [],
    error: sourceResult.error,
  });

  let crawlCandidates = 0;
  let crawlErrors = 0;
  let blockedSources = 0;
  for (const row of sourceRows) {
    const source: CrawlerSource = {
      id: row.id,
      sourceKey: row.source_key,
      name: row.name,
      baseUrl: row.base_url,
      apiUrl: row.api_url,
      enabled: row.enabled,
      reuseStatus: row.reuse_status,
      scrapingPermitted: row.scraping_permitted,
      discoveryMethod: row.discovery_method,
      rateLimitPerMinute: row.rate_limit_per_minute,
    };
    const crawl = await crawlDiscoverySource({
      source,
      store,
      http: input.http,
      maxPages: input.maxPages,
      sleep: input.sleep,
      log,
    });
    crawlCandidates += crawl.candidates;
    crawlErrors += crawl.errors;
    if (crawl.blocked) {
      blockedSources += 1;
    }
  }

  const failures =
    search.errors +
    crawlErrors +
    (search.reason && !search.skipped ? 1 : 0) +
    blockedSources;
  const result: DiscoverJobResult = {
    status: failures > 0 ? "PARTIAL" : "SUCCEEDED",
    seedsInserted: seedLoad.inserted,
    searchSkipped: search.skipped,
    searchSkipReason: search.reason,
    searchQueriesUsed: search.queriesUsed,
    searchCandidates: search.candidates,
    searchErrors: search.errors,
    crawledSources: sourceRows.length,
    crawlCandidates,
    crawlErrors,
    blockedSources,
    llmCallsUsed: 0,
  };
  log({
    job: "discover",
    msg: "discover_finished",
    ...result,
  });
  return result;
}

export async function runExpiryJob(input: {
  client: Client;
  now?: Date;
  dryRun?: boolean;
}): Promise<ExpiryJobResult> {
  const now = input.now ?? new Date();
  const dryRun = input.dryRun ?? false;
  if (dryRun) {
    const counted = await input.client
      .from("opportunity_candidates")
      .select("id", { count: "exact", head: true })
      .lt("deadline", now.toISOString())
      .in("status", ["PENDING_REVIEW", "APPROVED"]);
    const rows = throwIfQueryError("Count expiring opportunity candidates", {
      data: { count: counted.count ?? 0 },
      error: counted.error,
    });
    return { status: "SUCCEEDED", expired: rows.count, dryRun };
  }

  const updated = await input.client
    .from("opportunity_candidates")
    .update({
      status: "EXPIRED",
      reject_reason: "Opportunity deadline has passed",
      updated_at: now.toISOString(),
    })
    .lt("deadline", now.toISOString())
    .in("status", ["PENDING_REVIEW", "APPROVED"])
    .select("id");
  const rows = throwIfQueryError("Expire opportunity candidates", {
    data: updated.data ?? [],
    error: updated.error,
  });
  structuredLog({
    job: "expiry",
    msg: "expiry_finished",
    expired: rows.length,
  });
  return { status: "SUCCEEDED", expired: rows.length, dryRun };
}

type HealthSourceRow = {
  id: string;
  source_key: string;
  enabled: boolean;
  consecutive_failures: number;
  reliability_score: number | null;
  last_error: string | null;
};

export function healthDisableReason(source: HealthSourceRow): string | null {
  if (!source.enabled) {
    return null;
  }
  if (source.consecutive_failures >= HEALTH_FAILURE_THRESHOLD) {
    return `auto-disabled after ${source.consecutive_failures} consecutive failures`;
  }
  if (
    source.reliability_score != null &&
    source.reliability_score < HEALTH_LOW_RELIABILITY_THRESHOLD &&
    source.consecutive_failures >= 3
  ) {
    return `auto-disabled after low reliability (${source.reliability_score})`;
  }
  return null;
}

export async function runHealthJob(input: {
  client: Client;
  now?: Date;
}): Promise<HealthJobResult> {
  const now = input.now ?? new Date();
  const result = await input.client
    .from("data_sources")
    .select(
      "id, source_key, enabled, consecutive_failures, reliability_score, last_error",
    )
    .eq("enabled", true);
  const rows = throwIfQueryError("Load discovery source health", {
    data: (result.data ?? []) as HealthSourceRow[],
    error: result.error,
  });

  const unhealthy = rows
    .map((row) => ({ row, reason: healthDisableReason(row) }))
    .filter((item): item is { row: HealthSourceRow; reason: string } =>
      Boolean(item.reason),
    );
  if (unhealthy.length > 0) {
    for (const item of unhealthy) {
      const updated = await input.client
        .from("data_sources")
        .update({
          enabled: false,
          last_error: item.reason,
          updated_at: now.toISOString(),
        })
        .eq("id", item.row.id);
      throwIfQueryError("Disable unhealthy discovery source", {
        data: true,
        error: updated.error,
      });
    }
  }

  structuredLog({
    job: "health",
    msg: "health_finished",
    checked: rows.length,
    disabled: unhealthy.length,
  });
  return {
    status: "SUCCEEDED",
    checked: rows.length,
    disabled: unhealthy.length,
    sources: unhealthy.map((item) => item.row.source_key),
  };
}

export function discoveryJobError(error: unknown): string {
  return errorMessage(error);
}
