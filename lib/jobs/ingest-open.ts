import { createAllowlistedJsonClient, type JsonHttpClient } from "@/ingestion/core/http";
import { runIngestion } from "@/ingestion/core/pipeline";
import { defaultSleep } from "@/ingestion/core/retry";
import { createFindATenderAdapter } from "@/ingestion/sources/find-a-tender/adapter";
import {
  FIND_A_TENDER_FETCH_POLICY,
  FIND_A_TENDER_SOURCE_KEY,
  formatOcdsDateTime,
} from "@/ingestion/sources/find-a-tender/constants";
import { createRequestPacer } from "@/ingestion/sources/find-a-tender/pace";
import type { SourceAdapter } from "@/ingestion/core/types";
import type { IngestionStore } from "@/ingestion/store/types";
import { rebuildChangedPreviews } from "@/lib/jobs/previews";

export type OpenIngestCounts = {
  fetched: number;
  new: number;
  updated: number;
  unchanged: number;
  failed: number;
};

export type OpenIngestResult = {
  status: "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED";
  dryRun: boolean;
  counts: OpenIngestCounts;
  changedDealIds: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 7 * DAY_MS;
const MAX_BACKFILL_DAYS = 366;
const MAX_RECORDS = 2000;

export function openIngestWindows(
  now: Date,
  backfillDays: number,
): Array<{ updatedFrom: string; updatedTo: string }> {
  const days = Math.min(
    MAX_BACKFILL_DAYS,
    Math.max(1, Math.floor(backfillDays)),
  );
  const end = now.getTime();
  let cursor = end - days * DAY_MS;
  const windows: Array<{ updatedFrom: string; updatedTo: string }> = [];
  while (cursor < end) {
    const next = Math.min(end, cursor + WINDOW_MS);
    windows.push({
      updatedFrom: formatOcdsDateTime(new Date(cursor)),
      updatedTo: formatOcdsDateTime(new Date(next)),
    });
    cursor = next;
  }
  return windows;
}

function emptyCounts(): OpenIngestCounts {
  return { fetched: 0, new: 0, updated: 0, unchanged: 0, failed: 0 };
}

export function openIngestLogLine(counts: OpenIngestCounts): string {
  return JSON.stringify({
    fetched: counts.fetched,
    new: counts.new,
    updated: counts.updated,
    unchanged: counts.unchanged,
    failed: counts.failed,
  });
}

export async function runOpenFindATenderIngest(options: {
  store: IngestionStore;
  now?: Date;
  dryRun: boolean;
  backfillDays: number;
  adapter?: SourceAdapter;
  http?: JsonHttpClient;
  sleep?: (ms: number) => Promise<void>;
  limit?: number;
  /** ingest writes canonical rows. previews rebuilds changed deals. all does both. */
  phase?: "ingest" | "previews" | "all";
  dealIds?: string[];
}): Promise<OpenIngestResult> {
  const now = options.now ?? new Date();
  const sleep = options.sleep ?? defaultSleep;
  const pace = createRequestPacer({ sleep });
  const http = options.http ?? createAllowlistedJsonClient(FIND_A_TENDER_FETCH_POLICY);
  const paced: JsonHttpClient = {
    async getJson(url: string) {
      await pace();
      return http.getJson(url);
    },
  };
  const adapter =
    options.adapter ??
    createFindATenderAdapter({
      http: paced,
      now: () => now,
    });

  const counts = emptyCounts();
  const changed = new Set<string>(options.dealIds ?? []);
  const phase = options.phase ?? "all";
  let remaining = options.limit ?? MAX_RECORDS;
  let status: OpenIngestResult["status"] = "SUCCEEDED";

  if (phase !== "previews") {
    for (const window of openIngestWindows(now, options.backfillDays)) {
      if (remaining <= 0) {
        break;
      }
      const result = await runIngestion({
        sourceKey: FIND_A_TENDER_SOURCE_KEY,
        store: options.store,
        adapter,
        triggerType: options.dryRun ? "DRY_RUN" : "SCHEDULED",
        limit: remaining,
        updatedFrom: window.updatedFrom,
        updatedTo: window.updatedTo,
        stages: "tender",
        now,
        force: true,
        pageSize: 100,
        minFetchIntervalMs: 0,
        sleep,
        dryRun: options.dryRun,
        skipPreview: true,
        failureMode: "partial",
        onPersisted: (info) => {
          if (info.outcome === "new" || info.outcome === "updated" || info.outcome === "linked") {
            changed.add(info.dealId);
          }
        },
      });

      counts.fetched += result.counters.fetched;
      counts.new += result.counters.new;
      counts.updated += result.counters.updated;
      counts.unchanged += result.counters.unchanged;
      counts.failed += result.counters.errorCount;
      remaining -= result.counters.fetched;

      if (result.status === "SKIPPED") {
        return { status: "SKIPPED", dryRun: options.dryRun, counts, changedDealIds: [] };
      }
      if (result.status === "PARTIAL" || result.status === "FAILED") {
        status = "PARTIAL";
        break;
      }
    }
  }

  const previewIds = phase === "ingest" ? [] : [...changed];
  if (!options.dryRun && previewIds.length > 0 && phase !== "ingest") {
    const previews = await rebuildChangedPreviews({
      store: options.store,
      now,
      mode: "live",
      changedSince: now.toISOString(),
      dealIds: previewIds,
      limit: previewIds.length,
      countsOnly: true,
    });
    counts.failed += previews.failures;
    if (previews.failures > 0) {
      status = "PARTIAL";
    }
  }

  if (counts.failed === 0) {
    status = "SUCCEEDED";
  }

  return {
    status,
    dryRun: options.dryRun,
    counts,
    changedDealIds: phase === "previews" ? [] : [...changed],
  };
}
