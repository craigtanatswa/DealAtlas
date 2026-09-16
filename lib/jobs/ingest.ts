import { canIngestSource } from "@/ingestion/core/compliance";
import { runIngestion, type RunIngestionOptions } from "@/ingestion/core/pipeline";
import { defaultSleep } from "@/ingestion/core/retry";
import {
  getSourceAdapter,
  listRegisteredSourceKeys,
} from "@/ingestion/sources/registry";
import type { IngestionRunResult, SourceAdapter } from "@/ingestion/core/types";
import type { DataSourceRecord, IngestionStore } from "@/ingestion/store/types";
import { runIsolated } from "@/lib/jobs/isolate";
import type { JobMode } from "@/lib/jobs/cli";
import { ingestLimitForMode, triggerTypeFor } from "@/lib/jobs/cli";
import { errorMessage, structuredLog } from "@/lib/observability/log";
import { createErrorReporter, type ErrorReporter } from "@/lib/monitoring";
import {
  isSourceDue,
  minFetchIntervalMs,
} from "@/lib/jobs/schedule";

export type ScheduledIngestionResult = {
  status: "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED";
  mode: JobMode;
  dryRun: boolean;
  selected: string[];
  results: Array<
    | { sourceKey: string; ok: true; result: IngestionRunResult }
    | { sourceKey: string; ok: false; error: string }
  >;
};

function toComplianceInput(source: DataSourceRecord) {
  return {
    sourceKey: source.sourceKey,
    enabled: source.enabled,
    reuseStatus: source.reuseStatus,
    accessMethod: source.accessMethod,
    scrapingPermitted: source.scrapingPermitted,
    licenceName: source.licenceName,
    licenceUrl: source.licenceUrl,
    termsUrl: source.termsUrl,
  };
}

export function selectIngestionSources(input: {
  sources: DataSourceRecord[];
  now: Date;
  force?: boolean;
  due?: boolean;
  all?: boolean;
  sourceKeys?: string[];
  registeredKeys?: string[];
}): DataSourceRecord[] {
  const registered = new Set(
    input.registeredKeys ?? listRegisteredSourceKeys(),
  );
  const requested = input.sourceKeys?.length
    ? new Set(input.sourceKeys)
    : null;
  return input.sources.filter((source) => {
    if (requested && !requested.has(source.sourceKey)) {
      return false;
    }
    if (!registered.has(source.sourceKey)) {
      return false;
    }
    if (requested) {
      return true;
    }
    const decision = canIngestSource(toComplianceInput(source));
    if (!decision.allowed) {
      return false;
    }
    if (input.all || input.force) {
      return true;
    }
    if (input.due) {
      return isSourceDue({
        scheduleExpression: source.scheduleExpression,
        lastSuccessAt: source.lastSuccessAt,
        now: input.now,
        force: false,
      });
    }
    return false;
  });
}

export async function runScheduledIngestion(options: {
  store: IngestionStore;
  now?: Date;
  mode?: JobMode;
  force?: boolean;
  due?: boolean;
  all?: boolean;
  sourceKeys?: string[];
  limit?: number;
  cursor?: string;
  updatedFrom?: string;
  updatedTo?: string;
  smoke?: boolean;
  adapters?: Record<string, SourceAdapter>;
  reporter?: ErrorReporter;
  onPreviewPublished?: RunIngestionOptions["onPreviewPublished"];
  sleep?: (ms: number) => Promise<void>;
}): Promise<ScheduledIngestionResult> {
  const now = options.now ?? new Date();
  const mode = options.mode ?? "live";
  const dryRun = mode === "dry-run";
  const reporter = options.reporter ?? createErrorReporter();
  const sources = await options.store.listSources();
  const selected = selectIngestionSources({
    sources,
    now,
    force: options.force,
    due: options.due,
    all: options.all,
    sourceKeys: options.sourceKeys,
  });

  structuredLog({
    job: "ingest",
    msg: "ingestion_selected",
    mode,
    selected: selected.map((source) => source.sourceKey),
  });

  if (dryRun) {
    return {
      status: selected.length === 0 ? "SKIPPED" : "SUCCEEDED",
      mode,
      dryRun: true,
      selected: selected.map((source) => source.sourceKey),
      results: selected.map((source) => ({
        sourceKey: source.sourceKey,
        ok: true,
        result: {
          status: "SKIPPED",
          sourceKey: source.sourceKey,
          runId: null,
          reason: "dry-run",
          counters: {
            discovered: 0,
            fetched: 0,
            new: 0,
            updated: 0,
            unchanged: 0,
            errorCount: 0,
            parseFailures: 0,
            duplicatesLinked: 0,
            previewsPublished: 0,
            previewsBlocked: 0,
            durationMs: 0,
          },
          errors: [],
        },
      })),
    };
  }

  const isolated = await runIsolated(
    selected,
    async (source) => {
      const adapter =
        options.adapters?.[source.sourceKey] ?? getSourceAdapter(source.sourceKey);
      const cursor =
        options.cursor ??
        (mode === "live" && !options.smoke
          ? ((await options.store.latestIncompleteCursor(source.id)) ?? undefined)
          : undefined);
      const result = await runIngestion({
        sourceKey: source.sourceKey,
        store: options.store,
        adapter,
        triggerType: triggerTypeFor(mode, Boolean(options.due), options.smoke),
        limit: ingestLimitForMode(mode, options.limit, options.smoke),
        cursor,
        updatedFrom: options.updatedFrom,
        updatedTo: options.updatedTo,
        now,
        force: options.force,
        minFetchIntervalMs: minFetchIntervalMs(source.rateLimitPerMinute),
        sleep: options.sleep ?? defaultSleep,
        onPreviewPublished: options.onPreviewPublished,
      });
      structuredLog({
        job: "ingest",
        msg: "ingestion_source_finished",
        sourceKey: source.sourceKey,
        status: result.status,
        runId: result.runId,
        counters: result.counters,
      });
      return result;
    },
    errorMessage,
  );

  const results = isolated.map((item) =>
    item.ok
      ? { sourceKey: item.item.sourceKey, ok: true as const, result: item.result }
      : { sourceKey: item.item.sourceKey, ok: false as const, error: item.error },
  );

  for (const item of results) {
    if (!item.ok) {
      structuredLog({
        job: "ingest",
        msg: "ingestion_source_failed",
        level: "error",
        sourceKey: item.sourceKey,
        error: item.error,
      });
      await reporter.captureException(new Error(item.error), {
        job: "ingest",
        sourceKey: item.sourceKey,
      });
    }
  }

  const failures = results.filter((item) => !item.ok).length;
  const status =
    selected.length === 0
      ? "SKIPPED"
      : failures === 0
        ? "SUCCEEDED"
        : failures === results.length
          ? "FAILED"
          : "PARTIAL";

  return {
    status,
    mode,
    dryRun: false,
    selected: selected.map((source) => source.sourceKey),
    results,
  };
}
