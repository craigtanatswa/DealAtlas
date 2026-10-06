import { contextFromPersisted } from "@/ingestion/intelligence/types";
import { generatePreviewDraft } from "@/ingestion/preview/generate";
import { persistIntelligenceAndPreview } from "@/ingestion/preview/publish";
import type { IngestionStore } from "@/ingestion/store/types";
import type { JobMode } from "@/lib/jobs/cli";
import { errorMessage, structuredLog } from "@/lib/observability/log";
import { createErrorReporter, type ErrorReporter } from "@/lib/monitoring";

export type PreviewRebuildResult = {
  mode: JobMode;
  dryRun: boolean;
  changedSince: string;
  selected: number;
  processed: number;
  published: number;
  blocked: number;
  failures: number;
};

export async function rebuildChangedPreviews(options: {
  store: IngestionStore;
  now?: Date;
  mode?: JobMode;
  limit?: number;
  changedSince?: string;
  reporter?: ErrorReporter;
  onPreviewPublished?: (dealId: string) => Promise<void>;
}): Promise<PreviewRebuildResult> {
  const now = options.now ?? new Date();
  const mode = options.mode ?? "live";
  const dryRun = mode === "dry-run";
  const reporter = options.reporter ?? createErrorReporter();
  const lookbackHours = mode === "test" ? 6 : 24;
  const changedSince =
    options.changedSince ??
    new Date(now.getTime() - lookbackHours * 60 * 60 * 1000).toISOString();
  const limit = options.limit ?? (mode === "test" ? 10 : 100);
  const dealIds = await options.store.listChangedDealIds(changedSince, limit);

  structuredLog({
    job: "previews",
    msg: "preview_rebuild_selected",
    mode,
    changedSince,
    selected: dealIds.length,
  });

  if (dryRun) {
    return {
      mode,
      dryRun: true,
      changedSince,
      selected: dealIds.length,
      processed: 0,
      published: 0,
      blocked: 0,
      failures: 0,
    };
  }

  let processed = 0;
  let published = 0;
  let blocked = 0;
  let failures = 0;

  for (const dealId of dealIds) {
    try {
      const deal = await options.store.getDealById(dealId);
      if (!deal) {
        continue;
      }
      const context = await contextFromPersisted({
        store: options.store,
        deal,
        now,
      });
      if (!context) {
        continue;
      }
      const outcome = await persistIntelligenceAndPreview({
        store: options.store,
        context,
      });
      processed += 1;
      if (outcome.published) {
        published += 1;
        if (options.onPreviewPublished) {
          await options.onPreviewPublished(deal.id);
        }
      } else {
        blocked += 1;
      }
    } catch (error) {
      failures += 1;
      structuredLog({
        job: "previews",
        msg: "preview_rebuild_failed",
        level: "error",
        dealId,
        error: errorMessage(error),
      });
      await reporter.captureException(error, { job: "previews", dealId });
    }
  }

  if (processed > 0) {
    await options.store.maintainDealsLeakIndex();
  }

  return {
    mode,
    dryRun: false,
    changedSince,
    selected: dealIds.length,
    processed,
    published,
    blocked,
    failures,
  };
}

export type PreviewRiskCounts = {
  LOW: number;
  REVIEW: number;
  HIGH: number;
};

export type PreviewRebuildBatch = {
  selected: number;
  processed: number;
  failures: number;
  risks: PreviewRiskCounts;
};

export type PreviewRebuildAllResult = {
  mode: JobMode;
  dryRun: boolean;
  all: true;
  selected: number;
  processed: number;
  failures: number;
  batches: PreviewRebuildBatch[];
  risks: PreviewRiskCounts;
  nextCursor: string | null;
};

const DEFAULT_PREVIEW_BATCH = 100;

function emptyRisks(): PreviewRiskCounts {
  return { LOW: 0, REVIEW: 0, HIGH: 0 };
}

function addRisk(risks: PreviewRiskCounts, risk: string) {
  if (risk === "LOW" || risk === "REVIEW" || risk === "HIGH") {
    risks[risk] += 1;
  }
}

function previewBatchSize(explicit?: number): number {
  if (explicit == null || !Number.isFinite(explicit) || explicit < 1) {
    return DEFAULT_PREVIEW_BATCH;
  }
  return Math.floor(explicit);
}

export async function rebuildAllPreviews(options: {
  store: IngestionStore;
  now?: Date;
  mode?: JobMode;
  batchSize?: number;
  cursor?: string | null;
  reporter?: ErrorReporter;
}): Promise<PreviewRebuildAllResult> {
  const now = options.now ?? new Date();
  const mode = options.mode ?? "live";
  const dryRun = mode === "dry-run";
  const reporter = options.reporter ?? createErrorReporter();
  const batchSize = previewBatchSize(options.batchSize);
  const risks = emptyRisks();
  const batches: PreviewRebuildBatch[] = [];
  let cursor = options.cursor || null;
  let selected = 0;
  let processed = 0;
  let failures = 0;

  for (;;) {
    const dealIds = await options.store.listPreviewRebuildDealIds({
      afterId: cursor,
      limit: batchSize,
    });
    if (dealIds.length === 0) {
      break;
    }
    const lastId = dealIds[dealIds.length - 1];
    if (!lastId || (cursor != null && lastId <= cursor)) {
      break;
    }

    const batchRisks = emptyRisks();
    let batchProcessed = 0;
    let batchFailures = 0;
    for (const dealId of dealIds) {
      try {
        const deal = await options.store.getDealById(dealId);
        if (!deal) {
          continue;
        }
        const context = await contextFromPersisted({
          store: options.store,
          deal,
          now,
        });
        if (!context) {
          continue;
        }
        if (dryRun) {
          const draft = await generatePreviewDraft(context);
          addRisk(batchRisks, draft.leakageRisk);
          continue;
        }
        const outcome = await persistIntelligenceAndPreview({
          store: options.store,
          context,
          publication: "preserve",
        });
        batchProcessed += 1;
        addRisk(batchRisks, outcome.leakageRisk);
      } catch {
        batchFailures += 1;
        structuredLog({
          job: "previews",
          msg: "preview_rebuild_all_failed",
          level: "error",
        });
        await reporter.captureException(new Error("preview rebuild failed"), {
          job: "previews",
        });
      }
    }

    if (!dryRun && batchProcessed > 0) {
      await options.store.maintainDealsLeakIndex();
    }

    selected += dealIds.length;
    processed += batchProcessed;
    failures += batchFailures;
    risks.LOW += batchRisks.LOW;
    risks.REVIEW += batchRisks.REVIEW;
    risks.HIGH += batchRisks.HIGH;
    batches.push({
      selected: dealIds.length,
      processed: batchProcessed,
      failures: batchFailures,
      risks: batchRisks,
    });
    cursor = lastId;
    structuredLog({
      job: "previews",
      msg: "preview_rebuild_all_batch",
      mode,
      dryRun,
      batch: batches.length,
      selected: dealIds.length,
      processed: batchProcessed,
      failures: batchFailures,
      low: batchRisks.LOW,
      review: batchRisks.REVIEW,
      high: batchRisks.HIGH,
    });
    if (dealIds.length < batchSize) {
      break;
    }
  }

  structuredLog({
    job: "previews",
    msg: "preview_rebuild_all_complete",
    mode,
    dryRun,
    selected,
    processed,
    failures,
    batches: batches.length,
    low: risks.LOW,
    review: risks.REVIEW,
    high: risks.HIGH,
  });

  return {
    mode,
    dryRun,
    all: true,
    selected,
    processed,
    failures,
    batches,
    risks,
    nextCursor: cursor,
  };
}
