import { structuredLog } from "@/lib/observability/log";

import type { SearchProvider, SearchResult } from "@/ingestion/discovery/search/types";

export const TAVILY_SEARCH_ENDPOINT = "https://api.tavily.com/search";

export class SearchProviderError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "SearchProviderError";
    this.status = status;
  }
}

type TavilyPayload = {
  results?: Array<{
    title?: unknown;
    url?: unknown;
    content?: unknown;
    score?: unknown;
    published_date?: unknown;
  }>;
};

export function createTavilySearchProvider(options: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): SearchProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;

  return {
    id: "tavily",
    async search(query, searchOptions = {}) {
      const response = await fetchImpl(TAVILY_SEARCH_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          search_depth: "basic",
          max_results: Math.min(10, Math.max(1, searchOptions.maxResults ?? 5)),
          include_answer: false,
          include_raw_content: false,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 429) {
        throw new SearchProviderError("Search provider rate limited the request", 429);
      }
      if (!response.ok) {
        throw new SearchProviderError(
          `Search provider returned HTTP ${response.status}`,
          response.status,
        );
      }

      const payload = (await response.json()) as TavilyPayload;
      const results: SearchResult[] = [];
      for (const row of payload.results ?? []) {
        if (
          typeof row.title !== "string" ||
          typeof row.url !== "string" ||
          typeof row.content !== "string"
        ) {
          continue;
        }
        results.push({
          title: row.title.trim(),
          url: row.url.trim(),
          content: row.content.trim(),
          score:
            typeof row.score === "number" && Number.isFinite(row.score)
              ? row.score
              : null,
          publishedAt:
            typeof row.published_date === "string" && row.published_date.trim()
              ? row.published_date.trim()
              : null,
        });
      }
      structuredLog({
        job: "discover",
        msg: "search_query_finished",
        provider: "tavily",
        results: results.length,
      });
      return results;
    },
  };
}
