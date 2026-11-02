import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  discoveryMetricsFromRows,
  sourceHealthForMetrics,
} from "@/lib/admin/discovery";

describe("admin discovery metrics", () => {
  it("sums monthly usage, channel counts, blocked domains and source health", () => {
    const metrics = discoveryMetricsFromRows({
      jobRuns: [
        { summary: { searchQueriesUsed: 7, llmCallsUsed: 3 } },
        { summary: { searchQueriesUsed: 2, llmCallsUsed: 4 } },
        { summary: null },
      ],
      candidates: [
        { discovery_channel: "SEARCH", blocked_reason: null, domain: "a.example" },
        { discovery_channel: "SEARCH", blocked_reason: null, domain: "a.example" },
        { discovery_channel: "CRAWL", blocked_reason: "HTTP_403", domain: "b.example" },
        { discovery_channel: "UNKNOWN", blocked_reason: "CAPTCHA", domain: "b.example" },
      ],
      sources: [
        { enabled: true, consecutive_failures: 0, reliability_score: 100, last_error: null },
        { enabled: true, consecutive_failures: 2, reliability_score: 60, last_error: null },
        { enabled: true, consecutive_failures: 8, reliability_score: 10, last_error: "HTTP_429" },
        { enabled: false, consecutive_failures: 0, reliability_score: 0, last_error: null },
      ],
      expiredCount: 5,
      searchQueryCap: 25,
      llmCallCap: 40,
    });

    expect(metrics.searchQueriesUsedMonth).toBe(9);
    expect(metrics.llmCallsUsedMonth).toBe(7);
    expect(metrics.candidatesByMethod).toEqual({ SEARCH: 2, CRAWL: 1, UNKNOWN: 1 });
    expect(metrics.blockedDomains).toEqual([{ domain: "b.example", count: 2 }]);
    expect(metrics.sourcesByHealth).toEqual({
      healthy: 1,
      degraded: 1,
      down: 1,
      disabled: 1,
    });
    expect(metrics.expiredCount).toBe(5);
    expect(metrics.searchQueryCap).toBe(25);
    expect(metrics.llmCallCap).toBe(40);
  });

  it("treats restricted errors as down even before the failure threshold", () => {
    expect(
      sourceHealthForMetrics({
        enabled: true,
        consecutive_failures: 0,
        reliability_score: 100,
        last_error: "HTTP_403",
      }),
    ).toBe("down");
  });
});
