import type { Database } from "@/lib/db/database.types";
import { throwIfQueryError } from "@/lib/db/errors";

import {
  SEARCH_DISCOVERY_SOURCE_KEY,
  UK_DISCOVERY_SEEDS,
} from "@/ingestion/discovery/seeds/uk";
import type { DiscoverySeed } from "@/ingestion/discovery/seeds/types";

type DataSourceInsert =
  Database["public"]["Tables"]["data_sources"]["Insert"];

type SeedSourceRow = {
  id: string;
  source_key: string;
};

export type SeedClient = {
  from(table: "data_sources"): {
    select(columns: string): {
      in(
        column: string,
        values: string[],
      ): PromiseLike<{
        data: SeedSourceRow[] | null;
        error: { message: string; code?: string; details?: string } | null;
      }>;
    };
    insert(rows: DataSourceInsert[]): PromiseLike<{
      error: { message: string; code?: string; details?: string } | null;
    }>;
  };
};

export type SeedLoadResult = {
  inserted: number;
  existing: number;
  sourcesByKey: Map<string, string>;
};

export function seedSourceInsertRows(
  seeds: readonly DiscoverySeed[] = UK_DISCOVERY_SEEDS,
): DataSourceInsert[] {
  const rows: DataSourceInsert[] = seeds.map((seed) => ({
    source_key: seed.sourceKey,
    name: seed.name,
    source_type: seed.sourceType,
    access_method: seed.accessMethod,
    base_url: seed.baseUrl,
    terms_url: seed.termsUrl ?? null,
    licence_name: seed.licenceName ?? null,
    licence_url: seed.licenceUrl ?? null,
    reuse_status: "UNKNOWN",
    scraping_permitted: false,
    enabled: false,
    discovery_method: "HTML",
    parser_type: "portal-crawler",
    parser_config: (seed.parserConfig ?? { crawl: "PORTAL" }) as DataSourceInsert["parser_config"],
    country: seed.country ?? "GB",
    industry: seed.industry ?? null,
    crawl_frequency_minutes: 1440,
    auto_publish: false,
    auto_publish_min_confidence: 90,
  }));
  rows.push(searchSourceInsertRow());
  return rows;
}

export function searchSourceInsertRow(): DataSourceInsert {
  return {
    source_key: SEARCH_DISCOVERY_SOURCE_KEY,
    name: "DealAtlas web search discovery",
    source_type: "MANUAL_REVIEW",
    access_method: "MANUAL",
    base_url: null,
    api_url: null,
    reuse_status: "TERMS_REVIEWED",
    scraping_permitted: false,
    enabled: false,
    discovery_method: null,
    parser_type: "search-results",
    parser_config: { provider: "tavily", candidateOnly: true },
    country: "GB",
    industry: null,
    crawl_frequency_minutes: 1440,
    auto_publish: false,
    auto_publish_min_confidence: 90,
  };
}

export function seededSourceKeys(
  seeds: readonly DiscoverySeed[] = UK_DISCOVERY_SEEDS,
): string[] {
  return [...seeds.map((seed) => seed.sourceKey), SEARCH_DISCOVERY_SOURCE_KEY];
}

export async function loadDiscoverySeeds(
  client: SeedClient,
  seeds: readonly DiscoverySeed[] = UK_DISCOVERY_SEEDS,
): Promise<SeedLoadResult> {
  const rows = seedSourceInsertRows(seeds);
  const keys = rows.map((row) => row.source_key);
  const existingResult = await client
    .from("data_sources")
    .select("id, source_key")
    .in("source_key", keys);
  const existing = throwIfQueryError("Load discovery seed sources", {
    data: existingResult.data ?? [],
    error: existingResult.error,
  });
  const existingKeys = new Set(existing.map((row) => row.source_key));
  const missing = rows.filter((row) => !existingKeys.has(row.source_key));

  if (missing.length > 0) {
    const inserted = await client.from("data_sources").insert(missing);
    throwIfQueryError("Insert discovery seed sources", {
      data: true,
      error: inserted.error,
    });
  }

  const sourcesByKey = new Map(existing.map((row) => [row.source_key, row.id]));
  if (missing.length > 0) {
    const refreshed = await client
      .from("data_sources")
      .select("id, source_key")
      .in("source_key", missing.map((row) => row.source_key));
    const insertedRows = throwIfQueryError("Reload discovery seed sources", {
      data: refreshed.data ?? [],
      error: refreshed.error,
    });
    for (const row of insertedRows) {
      sourcesByKey.set(row.source_key, row.id);
    }
  }

  return {
    inserted: missing.length,
    existing: rows.length - missing.length,
    sourcesByKey,
  };
}
