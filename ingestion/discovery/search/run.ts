import { contentHash } from "@/ingestion/core/hash";
import { domainFromCandidateUrl, normalizeCandidateUrl } from "@/ingestion/discovery/dedupe";
import { SearchProviderError } from "@/ingestion/discovery/search/tavily";
import type {
  DiscoverySearchQuery,
  DiscoverySearchResult,
  SearchProvider,
} from "@/ingestion/discovery/search/types";
import type { DiscoveryStore } from "@/ingestion/discovery/types";
import {
  errorMessage,
  structuredLog,
  type LogEvent,
} from "@/lib/observability/log";

export async function runSearchDiscovery(input: {
  provider: SearchProvider | null;
  queries: DiscoverySearchQuery[];
  store: DiscoveryStore;
  sourceId: string;
  maxQueries: number;
  now?: Date;
  log?: (event: LogEvent) => void;
}): Promise<DiscoverySearchResult> {
  const result: DiscoverySearchResult = {
    skipped: false,
    reason: null,
    queriesUsed: 0,
    results: 0,
    candidates: 0,
    duplicates: 0,
    errors: 0,
  };
  const log = input.log ?? structuredLog;

  if (!input.provider) {
    result.skipped = true;
    result.reason = "search provider not configured";
    log({
      job: "discover",
      msg: "search_skipped",
      level: "warn",
      reason: result.reason,
    });
    return result;
  }

  const limit = Math.max(0, Math.floor(input.maxQueries));
  if (limit === 0) {
    result.skipped = true;
    result.reason = "search query cap is zero";
    log({
      job: "discover",
      msg: "search_skipped",
      level: "warn",
      reason: result.reason,
    });
    return result;
  }

  const seen = new Set<string>();
  for (const query of input.queries.slice(0, limit)) {
    result.queriesUsed += 1;
    try {
      const rows = await input.provider.search(query.query);
      result.results += rows.length;
      for (const row of rows) {
        const normalizedUrl = normalizeCandidateUrl(row.url);
        if (!normalizedUrl) {
          result.errors += 1;
          continue;
        }
        if (seen.has(normalizedUrl)) {
          result.duplicates += 1;
          continue;
        }
        seen.add(normalizedUrl);
        await input.store.upsertDiscoveredCandidate({
          sourceId: input.sourceId,
          url: row.url,
          normalizedUrl,
          domain: domainFromCandidateUrl(normalizedUrl),
          title: row.title || null,
          publishedAt: row.publishedAt,
          status: "PENDING_REVIEW",
          confidence: confidenceFromScore(row.score),
          matchedKeywords: [query.keyword],
          contentHash: contentHash({
            url: normalizedUrl,
            title: row.title,
            content: row.content,
          }),
          rawPayload: {
            provider: input.provider.id,
            query: query.query,
            keyword: query.keyword,
            seedKey: query.seedKey,
            seedDomain: query.seedDomain,
            score: row.score,
            snippet: row.content.slice(0, 2_000),
            fetched: false,
          },
          discoveryChannel: "SEARCH",
          blockedReason: null,
        });
        result.candidates += 1;
      }
    } catch (error) {
      result.errors += 1;
      log({
        job: "discover",
        msg: "search_query_failed",
        level: "warn",
        query: query.query,
        error: errorMessage(error),
      });
      if (error instanceof SearchProviderError && error.status === 429) {
        result.reason = "search provider rate limited";
        break;
      }
    }
  }

  log({
    job: "discover",
    msg: "search_finished",
    queriesUsed: result.queriesUsed,
    results: result.results,
    candidates: result.candidates,
    duplicates: result.duplicates,
    errors: result.errors,
  });
  return result;
}

function confidenceFromScore(score: number | null): number {
  if (score == null) {
    return 40;
  }
  return Math.max(0, Math.min(100, Math.round(score * 100)));
}
