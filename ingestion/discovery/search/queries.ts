import type { DiscoverySearchQuery } from "@/ingestion/discovery/search/types";

export type SearchQuerySeed = {
  sourceKey: string;
  baseUrl: string | null;
};

export function buildDiscoverySearchQueries(input: {
  keywords: string[];
  seeds: SearchQuerySeed[];
  maxQueries: number;
}): DiscoverySearchQuery[] {
  const maxQueries = Math.max(0, Math.floor(input.maxQueries));
  if (maxQueries === 0) {
    return [];
  }

  const keywords = [...new Set(input.keywords.map((item) => item.trim()).filter(Boolean))];
  const seeds = input.seeds
    .map((seed) => ({
      sourceKey: seed.sourceKey,
      domain: domainOf(seed.baseUrl),
    }))
    .filter((seed): seed is { sourceKey: string; domain: string } => Boolean(seed.domain));

  const queries: DiscoverySearchQuery[] = [];
  const seen = new Set<string>();
  const push = (query: DiscoverySearchQuery) => {
    const key = query.query.toLowerCase();
    if (seen.has(key) || queries.length >= maxQueries) {
      return;
    }
    seen.add(key);
    queries.push(query);
  };

  for (const keyword of keywords) {
    push({
      query: `${keyword} UK procurement supplier opportunity`,
      keyword,
      seedKey: null,
      seedDomain: null,
    });
    if (queries.length >= maxQueries) {
      return queries;
    }
  }

  for (const seed of seeds) {
    for (const keyword of keywords) {
      push({
        query: `${keyword} site:${seed.domain} supplier opportunity`,
        keyword,
        seedKey: seed.sourceKey,
        seedDomain: seed.domain,
      });
      if (queries.length >= maxQueries) {
        return queries;
      }
    }
  }

  return queries;
}

function domainOf(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}
