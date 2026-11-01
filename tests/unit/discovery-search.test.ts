import { describe, expect, it } from "vitest";

import { createMemoryDiscoveryStore } from "@/ingestion/discovery/store";
import {
  buildDiscoverySearchQueries,
  createSearchProviderFromEnv,
  runSearchDiscovery,
  searchMaxQueriesFromEnv,
  type SearchProvider,
} from "@/ingestion/discovery/search";
import type { DiscoveryStore } from "@/ingestion/discovery/types";
import type { LogEvent } from "@/lib/observability/log";

function captureStore() {
  const memory = createMemoryDiscoveryStore();
  const upserts: Array<Parameters<DiscoveryStore["upsertDiscoveredCandidate"]>[0]> = [];
  const store: DiscoveryStore = {
    ...memory,
    async upsertDiscoveredCandidate(input) {
      upserts.push(input);
      return memory.upsertDiscoveredCandidate(input);
    },
  };
  return { store, upserts };
}

describe("private discovery search", () => {
  it("skips without a search API key and never throws", async () => {
    const { store, upserts } = captureStore();
    const events: LogEvent[] = [];
    expect(createSearchProviderFromEnv({})).toBeNull();

    const result = await runSearchDiscovery({
      provider: null,
      queries: [{ query: "rfq", keyword: "rfq", seedKey: null, seedDomain: null }],
      store,
      sourceId: "source-1",
      maxQueries: 25,
      log: (event) => events.push(event),
    });

    expect(result.skipped).toBe(true);
    expect(result.queriesUsed).toBe(0);
    expect(upserts).toEqual([]);
    expect(events.map((event) => event.msg)).toContain("search_skipped");
  });

  it("enforces the per-run query cap and dedupes normalized result URLs", async () => {
    const { store, upserts } = captureStore();
    const calls: string[] = [];
    const provider: SearchProvider = {
      id: "tavily",
      async search(query) {
        calls.push(query);
        return [
          {
            title: "Supplier opportunity",
            url: "https://example.com/tender?utm_source=search",
            content: "RFQ for suppliers",
            score: 0.82,
            publishedAt: null,
          },
        ];
      },
    };
    const queries = buildDiscoverySearchQueries({
      keywords: ["rfq", "tender", "supplier", "framework", "itt"],
      seeds: [{ sourceKey: "seed-a", baseUrl: "https://buyer.example/" }],
      maxQueries: 10,
    });

    const result = await runSearchDiscovery({
      provider,
      queries,
      store,
      sourceId: "source-1",
      maxQueries: 2,
      log: () => {},
    });

    expect(calls).toHaveLength(2);
    expect(result.queriesUsed).toBe(2);
    expect(result.candidates).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].normalizedUrl).toBe("https://example.com/tender");
    expect(upserts[0].discoveryChannel).toBe("SEARCH");
    expect(upserts[0].rawPayload).toMatchObject({ fetched: false });
  });

  it("reads the default and configured query caps from env", () => {
    expect(searchMaxQueriesFromEnv({})).toBe(25);
    expect(
      searchMaxQueriesFromEnv({ DEALATLAS_SEARCH_MAX_QUERIES_PER_RUN: "3" }),
    ).toBe(3);
    expect(buildDiscoverySearchQueries({
      keywords: ["rfq", "tender"],
      seeds: [{ sourceKey: "seed-a", baseUrl: "https://buyer.example/" }],
      maxQueries: 2,
    })).toHaveLength(2);
  });
});
