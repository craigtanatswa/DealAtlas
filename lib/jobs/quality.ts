import { canIngestSource } from "@/ingestion/core/compliance";
import type { DataSourceRecord, IngestionStore } from "@/ingestion/store/types";
import type { JobMode } from "@/lib/jobs/cli";
import { isSourceStale } from "@/lib/jobs/schedule";
import { structuredLog } from "@/lib/observability/log";
import { ADMIN_STALE_AFTER_DAYS } from "@/lib/admin/paths";

export type DataQualityCheckResult = {
  mode: JobMode;
  staleSources: Array<{
    sourceKey: string;
    lastSuccessAt: string | null;
    consecutiveFailures: number;
  }>;
  staleOpenDeals: number;
  unpublishedRisk: number;
  failedRuns24h: number;
};

function complianceInput(source: DataSourceRecord) {
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

export async function runDataQualityChecks(options: {
  store: IngestionStore;
  now?: Date;
  mode?: JobMode;
  counts?: {
    staleOpenDeals?: number;
    unpublishedRisk?: number;
    failedRuns24h?: number;
  };
}): Promise<DataQualityCheckResult> {
  const now = options.now ?? new Date();
  const mode = options.mode ?? "live";
  const sources = await options.store.listSources();
  const staleSources = sources
    .filter((source) => source.enabled && canIngestSource(complianceInput(source)).allowed)
    .filter((source) =>
      isSourceStale({
        enabled: source.enabled,
        scheduleExpression: source.scheduleExpression,
        lastSuccessAt: source.lastSuccessAt,
        now,
        staleAfterMs: ADMIN_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000,
      }),
    )
    .map((source) => ({
      sourceKey: source.sourceKey,
      lastSuccessAt: source.lastSuccessAt,
      consecutiveFailures: source.consecutiveFailures,
    }));

  const result: DataQualityCheckResult = {
    mode,
    staleSources,
    staleOpenDeals: options.counts?.staleOpenDeals ?? 0,
    unpublishedRisk: options.counts?.unpublishedRisk ?? 0,
    failedRuns24h: options.counts?.failedRuns24h ?? 0,
  };

  structuredLog({
    job: "data-quality",
    msg: "data_quality_report",
    mode,
    staleSourceCount: staleSources.length,
    staleSources: staleSources.map((item) => item.sourceKey),
    staleOpenDeals: result.staleOpenDeals,
    unpublishedRisk: result.unpublishedRisk,
    failedRuns24h: result.failedRuns24h,
  });

  return result;
}
