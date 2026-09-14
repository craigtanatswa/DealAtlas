import { asIngestionError, IngestionError } from "@/ingestion/core/errors";
import {
  assertCanIngestSource,
  canIngestSource,
  sourceShouldPause,
} from "@/ingestion/core/compliance";
import { contentHash } from "@/ingestion/core/hash";
import { persistCandidate } from "@/ingestion/core/persist";
import { unwrapReleasePayload } from "@/ingestion/sources/find-a-tender/parse";
import type {
  IngestionCounters,
  IngestionRunResult,
  SourceAdapter,
} from "@/ingestion/core/types";
import type { DataSourceRecord, IngestionStore } from "@/ingestion/store/types";

export type RunIngestionOptions = {
  sourceKey: string;
  store: IngestionStore;
  adapter: SourceAdapter;
  triggerType?: string;
  limit?: number;
  cursor?: string;
  updatedFrom?: string;
  updatedTo?: string;
  stages?: string;
  now?: Date;
  force?: boolean;
  pageSize?: number;
};

function emptyCounters(): IngestionCounters {
  return {
    discovered: 0,
    fetched: 0,
    new: 0,
    updated: 0,
    unchanged: 0,
    errorCount: 0,
    parseFailures: 0,
    duplicatesLinked: 0,
    durationMs: 0,
  };
}

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

export async function runIngestion(
  options: RunIngestionOptions,
): Promise<IngestionRunResult> {
  const started = Date.now();
  const now = options.now ?? new Date();
  const counters = emptyCounters();
  const errors: IngestionRunResult["errors"] = [];
  const source = await options.store.getSourceByKey(options.sourceKey);

  if (!source) {
    throw new IngestionError({
      message: `Unknown source ${options.sourceKey}`,
      stage: "compliance",
      code: "SOURCE_NOT_FOUND",
    });
  }

  const decision = canIngestSource(toComplianceInput(source));
  if (!decision.allowed) {
    const run = await options.store.createRun({
      sourceId: source.id,
      status: "SKIPPED",
      triggerType: options.triggerType ?? "MANUAL",
      metadata: { reason: decision.reason, code: decision.code },
      startedAt: now.toISOString(),
    });
    await options.store.updateRun(run.id, {
      status: "SKIPPED",
      finishedAt: new Date().toISOString(),
    });
    return {
      status: "SKIPPED",
      sourceKey: source.sourceKey,
      runId: run.id,
      reason: decision.reason,
      counters: { ...counters, durationMs: Date.now() - started },
      errors: [
        {
          stage: "compliance",
          code: decision.code,
          message: decision.reason,
        },
      ],
    };
  }

  if (!options.force && sourceShouldPause(source.consecutiveFailures)) {
    const run = await options.store.createRun({
      sourceId: source.id,
      status: "SKIPPED",
      triggerType: options.triggerType ?? "MANUAL",
      metadata: { reason: "Source paused after repeated access failures" },
      startedAt: now.toISOString(),
    });
    await options.store.updateRun(run.id, {
      status: "SKIPPED",
      finishedAt: new Date().toISOString(),
    });
    return {
      status: "SKIPPED",
      sourceKey: source.sourceKey,
      runId: run.id,
      reason: "Source paused after repeated access failures",
      counters: { ...counters, durationMs: Date.now() - started },
      errors: [],
    };
  }

  assertCanIngestSource(toComplianceInput(source));

  const run = await options.store.createRun({
    sourceId: source.id,
    status: "RUNNING",
    triggerType: options.triggerType ?? "MANUAL",
    cursorValue: options.cursor ?? null,
    startedAt: now.toISOString(),
  });

  let cursor = options.cursor;
  let remaining = options.limit ?? Number.POSITIVE_INFINITY;

  try {
    while (remaining > 0) {
      const pageLimit = Math.min(
        options.pageSize ?? 20,
        Number.isFinite(remaining) ? remaining : 20,
        100,
      );
      const page = await options.adapter.discover(cursor, {
        limit: pageLimit,
        updatedFrom: options.updatedFrom,
        updatedTo: options.updatedTo,
        stages: options.stages,
      });
      const items = page.items.slice(
        0,
        Number.isFinite(remaining) ? remaining : page.items.length,
      );
      counters.discovered += items.length;

      for (const item of items) {
        try {
          const raw = await options.adapter.fetch(item);
          counters.fetched += 1;
          const hash = contentHash(unwrapReleasePayload(raw.payload) ?? raw.payload);
          const snapshot = await options.store.insertRawRecord({
            sourceId: source.id,
            ingestionRunId: run.id,
            externalRecordId: raw.externalRecordId,
            sourceUrl: raw.sourceUrl ?? null,
            publishedAt: raw.publishedAt ?? null,
            fetchedAt: raw.fetchedAt,
            contentHash: hash,
            contentType: raw.contentType ?? "application/json",
            rawPayload: {
              http: raw.http,
              body: raw.payload,
            },
            parserVersion: raw.parserVersion,
          });

          if (!snapshot.created) {
            const existingNotice = await options.store.findNotice(
              source.id,
              raw.externalRecordId,
              raw.externalRecordId,
            );
            if (existingNotice) {
              counters.unchanged += 1;
              continue;
            }
          }

          let candidates;
          try {
            candidates = await options.adapter.parse(raw);
          } catch (error) {
            counters.parseFailures += 1;
            throw asIngestionError(error, "parse", "PARSE_FAILED");
          }

          for (const candidate of candidates) {
            const persisted = await persistCandidate({
              store: options.store,
              source,
              raw: snapshot.record,
              candidate,
              now,
            });
            if (persisted.outcome === "new") {
              counters.new += 1;
            } else if (persisted.outcome === "updated") {
              counters.updated += 1;
            } else if (persisted.outcome === "linked") {
              counters.duplicatesLinked += 1;
              counters.updated += 1;
            } else {
              counters.unchanged += 1;
            }
          }
        } catch (error) {
          const ingestionError = asIngestionError(error, "record");
          counters.errorCount += 1;
          errors.push({
            externalRecordId: item.externalRecordId,
            stage: ingestionError.stage,
            code: ingestionError.code,
            message: ingestionError.message,
          });
          await options.store.insertError({
            sourceId: source.id,
            ingestionRunId: run.id,
            rawRecordId: null,
            externalRecordId: item.externalRecordId,
            errorStage: ingestionError.stage,
            errorCode: ingestionError.code,
            message: ingestionError.message,
            retryable: ingestionError.retryable,
            details: {
              ...ingestionError.details,
              ocid: item.ocid ?? null,
            },
          });
        }
      }

      remaining -= items.length;
      cursor = page.nextCursor;
      if (!page.nextCursor || items.length === 0) {
        break;
      }
    }

    const status =
      counters.errorCount === 0
        ? "SUCCEEDED"
        : counters.new + counters.updated + counters.unchanged > 0
          ? "PARTIAL"
          : "FAILED";

    await options.store.updateRun(run.id, {
      status,
      finishedAt: new Date().toISOString(),
      cursorValue: cursor ?? null,
      discoveredCount: counters.discovered,
      fetchedCount: counters.fetched,
      newCount: counters.new,
      updatedCount: counters.updated,
      unchangedCount: counters.unchanged,
      errorCount: counters.errorCount,
      metadata: {
        parseFailures: counters.parseFailures,
        duplicatesLinked: counters.duplicatesLinked,
      },
    });

    await options.store.updateSource(source.id, {
      lastSuccessAt: status === "FAILED" ? source.lastSuccessAt : new Date().toISOString(),
      consecutiveFailures: status === "FAILED" ? source.consecutiveFailures + 1 : 0,
    });

    counters.durationMs = Date.now() - started;
    return {
      status,
      sourceKey: source.sourceKey,
      runId: run.id,
      cursor: cursor ?? null,
      counters,
      errors,
    };
  } catch (error) {
    const ingestionError = asIngestionError(error, "run");
    await options.store.updateRun(run.id, {
      status: "FAILED",
      finishedAt: new Date().toISOString(),
      discoveredCount: counters.discovered,
      fetchedCount: counters.fetched,
      newCount: counters.new,
      updatedCount: counters.updated,
      unchangedCount: counters.unchanged,
      errorCount: counters.errorCount + 1,
      metadata: { code: ingestionError.code, message: ingestionError.message },
    });
    await options.store.updateSource(source.id, {
      consecutiveFailures: source.consecutiveFailures + 1,
    });
    throw ingestionError;
  }
}
