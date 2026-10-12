import { describe, expect, it } from "vitest";

import { IngestionError } from "@/ingestion/core/errors";
import { runIngestion } from "@/ingestion/core/pipeline";
import { createContractsFinderAdapter } from "@/ingestion/sources/contracts-finder/adapter";
import { CONTRACTS_FINDER_SEARCH_API } from "@/ingestion/sources/contracts-finder/constants";
import { parseContractsFinderRaw } from "@/ingestion/sources/contracts-finder/parse";
import { contractsFinderSourceRecord } from "@/ingestion/sources/contracts-finder/seed";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import type { DealRecord } from "@/ingestion/store/types";
import { readFindATenderFixture } from "@/tests/helpers/ingestion-fixtures";
import fs from "node:fs";
import path from "node:path";

const NOW = new Date("2026-09-10T12:00:00.000Z");

function readFixture(name: string): unknown {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "tests/fixtures/ingestion/contracts-finder", name),
      "utf8",
    ),
  ) as unknown;
}

function packageFrom(names: string[]): unknown {
  const releases = names.flatMap((name) => {
    const payload = readFixture(name) as { releases?: unknown[] };
    return payload.releases ?? [];
  });
  return {
    uri: CONTRACTS_FINDER_SEARCH_API,
    version: "1.1",
    license:
      "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    releases,
  };
}

function ingest(fixtureNames: string[], store = createMemoryIngestionStore({
  sources: [contractsFinderSourceRecord({ id: "source-cf" })],
})) {
  const adapter = createContractsFinderAdapter({
    http: {
      async getJson(url: string) {
        const body = packageFrom(fixtureNames);
        return {
          url,
          status: 200,
          contentType: "application/json",
          body,
          rawText: JSON.stringify(body),
        };
      },
    },
    now: () => NOW,
    sleep: async () => {},
  });
  return {
    store,
    result: runIngestion({
      sourceKey: "contracts-finder",
      store,
      adapter,
      now: NOW,
      limit: fixtureNames.length,
      triggerType: "TEST",
    }),
  };
}

describe("Contracts Finder OCDS parse", () => {
  it("opens only a tender with a future deadline", () => {
    const [candidate] = parseContractsFinderRaw(readFixture("tender-open.json"), NOW);
    expect(candidate.status).toBe("OPEN");
    expect(candidate.sourceKey).toBe("contracts-finder");
    expect(candidate.sourceUrl).toContain("/Notice/cf-000001-2026");
    expect(candidate.sourceUrl).not.toContain("find-tender");
  });

  it("marks planning with a dated future tender as upcoming", () => {
    const [candidate] = parseContractsFinderRaw(
      readFixture("planning-upcoming.json"),
      NOW,
    );
    expect(candidate.status).toBe("UPCOMING");
  });

  it("leaves awards unclassified", () => {
    const [candidate] = parseContractsFinderRaw(
      readFixture("award-unclassified.json"),
      NOW,
    );
    expect(candidate.status).toBe("UNCLASSIFIED");
  });

  it("leaves a tender with a past deadline unclassified", () => {
    const [candidate] = parseContractsFinderRaw(readFixture("tender-open.json"), new Date("2027-01-01T00:00:00.000Z"));
    expect(candidate.status).toBe("UNCLASSIFIED");
  });
});

describe("Contracts Finder fixture ingestion", () => {
  it("upserts one deal on (source, notice) and does not publish", async () => {
    const first = ingest(["tender-open.json"]);
    const created = await first.result;
    expect(created.counters.new).toBe(1);
    expect(created.counters.fetched).toBe(1);
    expect(first.store.deals).toHaveLength(1);
    expect(first.store.previews[0]?.isPublished).toBe(false);

    const rerun = ingest(["tender-open.json"], first.store);
    const again = await rerun.result;
    expect(again.counters.unchanged).toBe(1);
    expect(again.counters.new).toBe(0);
    expect(first.store.deals).toHaveLength(1);
    expect(first.store.previews[0]?.isPublished).toBe(false);
  });

  it("leaves is_published unchanged when a later release is ingested", async () => {
    const first = ingest(["tender-open.json"]);
    await first.result;
    const preview = first.store.previews[0];
    expect(preview).toBeTruthy();
    preview!.isPublished = true;

    const second = ingest(["tender-open-updated.json"], first.store);
    const updated = await second.result;
    expect(updated.counters.updated).toBe(1);
    expect(first.store.deals).toHaveLength(1);
    expect(first.store.previews[0]?.isPublished).toBe(true);

    first.store.previews[0]!.isPublished = false;
    const third = ingest(["tender-open.json"], first.store);
    await third.result;
    expect(first.store.previews[0]?.isPublished).toBe(false);
  });

  it("links a Find a Tender OCID cross-reference instead of creating a second deal", async () => {
    const store = createMemoryIngestionStore({
      sources: [
        contractsFinderSourceRecord({ id: "source-cf" }),
        contractsFinderSourceRecord({
          id: "source-fat",
          sourceKey: "find-a-tender",
        }),
      ],
    });
    const existing = await store.createDeal({
      primarySourceId: "source-fat",
      externalPrimaryId: "ocds-h6vhtk-fixture-shared",
      ocid: "ocds-h6vhtk-fixture-shared",
      reference: "FTS-1",
      sourceTitle: "Find a Tender original title",
      sourceDescription: null,
      buyerOrganizationId: null,
      dealType: "PUBLIC_TENDER",
      buyerSector: "PUBLIC",
      stage: "LIVE",
      status: "OPEN",
      mainCategory: null,
      procurementMethod: null,
      specialRegime: null,
      currency: "GBP",
      valueMinExVat: null,
      valueMaxExVat: 100,
      exactValueText: null,
      exactLocationText: null,
      enquiryDeadline: null,
      submissionDeadline: null,
      awardDecisionDate: null,
      contractStartDate: null,
      contractEndDate: null,
      extensionEndDate: null,
      nextProcurementDate: null,
      estimatedRenewalDate: null,
      smeSuitable: null,
      vcseSuitable: null,
      sourceUrl: "https://www.find-tender.service.gov.uk/Notice/example",
      applicationUrl: null,
      firstPublishedAt: NOW.toISOString(),
      latestSourceAt: NOW.toISOString(),
      lastVerifiedAt: NOW.toISOString(),
      dataQualityScore: 20,
    } satisfies Omit<DealRecord, "id" | "firstDiscoveredAt" | "sourceCount" | "normalizedTitle">);

    await store.upsertDealPreview({
      dealId: existing.id,
      slug: "existing-preview",
      previewTitle: "Existing preview",
      previewSummary: "Already published synthetic preview.",
      dealType: "PUBLIC_TENDER",
      buyerSector: "PUBLIC",
      stage: "LIVE",
      status: "OPEN",
      mainCategory: null,
      broadRegion: null,
      valueBand: "Undisclosed",
      deadlineBand: "Closed",
      durationBand: "Not disclosed",
      smeSuitability: null,
      bidComplexity: null,
      competitionLevel: null,
      requirementsPreview: [],
      relevanceTags: [],
      freshnessLabel: null,
      leakageRisk: "LOW",
      isPublished: true,
      unpublishedByAdmin: false,
    });

    const { result } = ingest(["duplicate-fts.json"], store);
    const outcome = await result;
    expect(outcome.counters.duplicatesLinked).toBe(1);
    expect(outcome.counters.new).toBe(0);
    expect(store.deals).toHaveLength(1);
    expect(store.deals[0]?.sourceTitle).toBe("Find a Tender original title");
    expect(store.deals[0]?.ocid).toBe("ocds-h6vhtk-fixture-shared");
    expect(store.notices.some((notice) => notice.sourceId === "source-cf")).toBe(true);
    expect(store.previews[0]?.isPublished).toBe(true);
  });

  it("backs off when the search feed returns 429", async () => {
    const sleeps: number[] = [];
    let attempts = 0;
    const adapter = createContractsFinderAdapter({
      now: () => NOW,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      http: {
        async getJson() {
          attempts += 1;
          if (attempts === 1) {
            throw new IngestionError({
              message: "rate limited",
              stage: "fetch",
              code: "HTTP_429",
              retryable: true,
              details: { retryAfterMs: 25 },
            });
          }
          const body = packageFrom(["tender-open.json"]);
          return {
            url: CONTRACTS_FINDER_SEARCH_API,
            status: 200,
            contentType: "application/json",
            body,
            rawText: "{}",
          };
        },
      },
    });

    const page = await adapter.discover(undefined, { limit: 1 });
    expect(attempts).toBe(2);
    expect(sleeps).toEqual([25]);
    expect(page.items).toHaveLength(1);
  });

  it("does not fetch Find a Tender HTML fixtures as Contracts Finder", () => {
    expect(() => parseContractsFinderRaw(readFindATenderFixture("malformed.json"), NOW)).toThrow();
  });
});
