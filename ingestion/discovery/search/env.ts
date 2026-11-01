import { createTavilySearchProvider } from "@/ingestion/discovery/search/tavily";
import type { SearchProvider } from "@/ingestion/discovery/search/types";

export const DEFAULT_SEARCH_MAX_QUERIES_PER_RUN = 25;

export function searchMaxQueriesFromEnv(
  env: Record<string, string | undefined> = process.env,
): number {
  return readNonNegativeInt(
    env.DEALATLAS_SEARCH_MAX_QUERIES_PER_RUN,
    DEFAULT_SEARCH_MAX_QUERIES_PER_RUN,
  );
}

export function createSearchProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
  options: { fetchImpl?: typeof fetch } = {},
): SearchProvider | null {
  const apiKey = env.DEALATLAS_SEARCH_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  const provider = (env.DEALATLAS_SEARCH_PROVIDER?.trim() || "tavily").toLowerCase();
  if (provider !== "tavily") {
    return null;
  }
  return createTavilySearchProvider({ apiKey, fetchImpl: options.fetchImpl });
}

export function readNonNegativeInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
}
