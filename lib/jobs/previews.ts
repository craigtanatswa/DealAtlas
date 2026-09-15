import { contextFromPersisted } from "@/ingestion/intelligence/types";
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
  all?: boolean;
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
  const dealIds = options.all
    ? (await options.store.listDeals(limit)).map((deal) => deal.id)
    : await options.store.listChangedDealIds(changedSince, limit);

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
