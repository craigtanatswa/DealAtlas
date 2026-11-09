import { afterEach, describe, expect, it, vi } from "vitest";

import { runIngestion } from "@/ingestion/core/pipeline";
import type { DiscoverResult, SourceAdapter } from "@/ingestion/core/types";
import { findATenderSourceRecord } from "@/ingestion/sources/find-a-tender/seed";
import { contractsFinderSourceRecord } from "@/ingestion/sources/contracts-finder/seed";
import { PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY } from "@/ingestion/sources/public-contracts-scotland/constants";
import { publicContractsScotlandSourceRecord } from "@/ingestion/sources/public-contracts-scotland/seed";
import { SELL2WALES_SOURCE_KEY } from "@/ingestion/sources/sell2wales/constants";
import { sell2WalesSourceRecord } from "@/ingestion/sources/sell2wales/seed";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import {
  classifyZeroRecordRun,
  isZeroRecordSource,
  openIngestShouldFail,
  runOpenPublicContractsScotlandIngest,
  runOpenSell2WalesIngest,
  zeroRecordNoticeLine,
} from "@/lib/jobs/ingest-open";

const NOW = new Date("2026-09-10T12:00:00.000Z");
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function emptyAdapter(sourceKey: string): SourceAdapter {
  return {
    sourceKey,
    async discover(): Promise<DiscoverResult> {
      return { items: [] };
    },
    async fetch() {
      throw new Error("not used");
    },
    async parse() {
      return [];
    },
  };
}

describe("stale ingestion runs", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fails old RUNNING rows for the source and leaves recent and other sources alone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const store = createMemoryIngestionStore({
      sources: [
        findATenderSourceRecord({ id: "source-fat" }),
        contractsFinderSourceRecord({ id: "source-cf" }),
      ],
    });
    const old = await store.createRun({
      sourceId: "source-fat",
      status: "RUNNING",
      triggerType: "SCHEDULED",
      startedAt: new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString(),
      metadata: { attempt: 1 },
    });
    const queued = await store.createRun({
      sourceId: "source-fat",
      status: "QUEUED",
      triggerType: "SCHEDULED",
      startedAt: new Date(NOW.getTime() - 4 * 60 * 60 * 1000).toISOString(),
    });
    const recent = await store.createRun({
      sourceId: "source-fat",
      status: "RUNNING",
      triggerType: "SCHEDULED",
      startedAt: new Date(NOW.getTime() - 30 * 60 * 1000).toISOString(),
    });
    const otherSource = await store.createRun({
      sourceId: "source-cf",
      status: "RUNNING",
      triggerType: "SCHEDULED",
      startedAt: new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString(),
    });

    const closed = await store.closeStaleRuns({
      sourceId: "source-fat",
      olderThanMs: TWO_HOURS_MS,
    });

    expect(closed).toBe(2);
    expect(queued.status).toBe("FAILED");
    expect(queued.metadata).toMatchObject({ timed_out: true });
    expect(old.status).toBe("FAILED");
    expect(old.finishedAt).toBe(NOW.toISOString());
    expect(old.errorCount).toBe(1);
    expect(old.metadata).toMatchObject({
      attempt: 1,
      timed_out: true,
      closed_reason: "stale run exceeded limit",
    });
    expect(recent.status).toBe("RUNNING");
    expect(recent.finishedAt).toBeNull();
    expect(recent.errorCount).toBe(0);
    expect(otherSource.status).toBe("RUNNING");
  });

  it("closes stale RUNNING rows before creating a new run", async () => {
    const store = createMemoryIngestionStore({
      sources: [findATenderSourceRecord({ id: "source-fat" })],
    });
    const events: string[] = [];
    const close = store.closeStaleRuns.bind(store);
    const create = store.createRun.bind(store);
    store.closeStaleRuns = async (input) => {
      events.push(`close:${input.sourceId}`);
      return close(input);
    };
    store.createRun = async (input) => {
      events.push(`create:${input.sourceId}`);
      return create(input);
    };

    await runIngestion({
      sourceKey: "find-a-tender",
      store,
      adapter: emptyAdapter("find-a-tender"),
      now: NOW,
      limit: 1,
    });

    expect(events[0]).toBe("close:source-fat");
    expect(events[1]).toBe("create:source-fat");
  });
});

describe("per-run timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("finalizes the run as FAILED with timed_out after the hard limit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const store = createMemoryIngestionStore({
      sources: [findATenderSourceRecord({ id: "source-fat" })],
    });
    const hanging: SourceAdapter = {
      sourceKey: "find-a-tender",
      async discover(): Promise<DiscoverResult> {
        return new Promise<never>(() => undefined);
      },
      async fetch() {
        throw new Error("not used");
      },
      async parse() {
        return [];
      },
    };

    const run = runIngestion({
      sourceKey: "find-a-tender",
      store,
      adapter: hanging,
      now: NOW,
      limit: 1,
      timeoutMs: 1_000,
    });
    const rejection = expect(run).rejects.toMatchObject({ code: "RUN_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;

    expect(store.runs).toHaveLength(1);
    const saved = store.runs[0]!;
    expect(saved.status).toBe("FAILED");
    expect(saved.finishedAt).toBeTruthy();
    expect(saved.errorCount).toBe(1);
    expect(saved.metadata).toMatchObject({ timed_out: true, code: "RUN_TIMEOUT" });
  });
});

describe("zero-record classification", () => {
  it("marks empty PCS and Sell2Wales runs as ok-with-zero only", () => {
    expect(isZeroRecordSource(PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY)).toBe(true);
    expect(isZeroRecordSource(SELL2WALES_SOURCE_KEY)).toBe(true);
    expect(isZeroRecordSource("find-a-tender")).toBe(false);

    for (const sourceKey of [
      PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY,
      SELL2WALES_SOURCE_KEY,
    ]) {
      const classified = classifyZeroRecordRun({
        sourceKey,
        status: "SUCCEEDED",
        fetched: 0,
        discovered: 0,
      });
      expect(classified.status).toBe("SUCCEEDED");
      expect(classified.zeroRecords).toBe(true);
      expect(classified.reason).toContain("returned 0 records");
      expect(classified.metadata).toEqual({
        zero_records: true,
        ok_with_zero: true,
        zero_records_reason: `${sourceKey} returned 0 records`,
      });
    }

    expect(
      classifyZeroRecordRun({
        sourceKey: "find-a-tender",
        status: "SUCCEEDED",
        fetched: 0,
      }),
    ).toMatchObject({ status: "SUCCEEDED", zeroRecords: false });

    expect(
      classifyZeroRecordRun({
        sourceKey: PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY,
        status: "SUCCEEDED",
        fetched: 1,
      }),
    ).toMatchObject({ status: "SUCCEEDED", zeroRecords: false });

    expect(
      classifyZeroRecordRun({
        sourceKey: PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY,
        status: "SKIPPED",
        fetched: 0,
      }),
    ).toMatchObject({ status: "SKIPPED", zeroRecords: false });
  });

  it("prints an informational notice annotation", () => {
    expect(zeroRecordNoticeLine("sell2wales")).toContain(
      "::notice title=sell2wales returned 0 records::",
    );
  });

  it("treats a partial status with zero records as ok-with-zero", () => {
    const classified = classifyZeroRecordRun({
      sourceKey: PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY,
      status: "PARTIAL",
      fetched: 0,
      discovered: 0,
    });
    expect(classified.status).toBe("SUCCEEDED");
    expect(classified.metadata).toMatchObject({ ok_with_zero: true });
  });

  it("completed 0-record run is success / ok-with-zero and does not fail", async () => {
    const store = createMemoryIngestionStore({
      sources: [publicContractsScotlandSourceRecord({ id: "source-pcs" })],
    });
    const result = await runOpenPublicContractsScotlandIngest({
      store,
      now: NOW,
      dryRun: true,
      backfillDays: 7,
      sleep: async () => undefined,
      http: {
        async getJson(url) {
          return {
            url,
            status: 200,
            contentType: "application/json",
            body: { releases: [] },
            rawText: "{}",
          };
        },
      },
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(result.counts.fetched).toBe(0);
    expect(result.metadata).toEqual({
      zero_records: true,
      ok_with_zero: true,
      zero_records_reason: "public-contracts-scotland returned 0 records",
    });
    expect(openIngestShouldFail(result)).toBe(false);
  });

  it("completed 0-record Sell2Wales run does not fail either", async () => {
    const store = createMemoryIngestionStore({
      sources: [sell2WalesSourceRecord({ id: "source-s2w" })],
    });
    const result = await runOpenSell2WalesIngest({
      store,
      now: NOW,
      dryRun: true,
      backfillDays: 7,
      sleep: async () => undefined,
      http: {
        async getJson(url) {
          return {
            url,
            status: 200,
            contentType: "application/json",
            body: { releases: [] },
            rawText: "{}",
          };
        },
      },
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(result.metadata).toMatchObject({ zero_records: true, ok_with_zero: true });
    expect(openIngestShouldFail(result)).toBe(false);
  });
});
