import { loadEnvFiles } from "./load-env";

loadEnvFiles();

async function main() {
  const { parseJobArgs } = await import("@/lib/jobs/cli");
  const args = parseJobArgs(process.argv.slice(2));
  const job = args.job;
  if (!job) {
    console.error(
      "Usage: npm run job -- --job <ingest|previews|alerts|renewals|data-quality> [--mode live|test|dry-run]",
    );
    process.exitCode = 1;
    return;
  }

  const { structuredLog, errorMessage } = await import("@/lib/observability/log");
  const { createErrorReporter } = await import("@/lib/monitoring");
  const { triggerTypeFor } = await import("@/lib/jobs/cli");
  const reporter = createErrorReporter();
  const scheduled = args.due || args.mode === "live";

  let client: import("@/ingestion/store/worker-client").IngestionSupabaseClient | null =
    null;
  let runId: string | null = null;
  try {
    const { createIngestionSupabaseClient } = await import(
      "@/ingestion/store/worker-client"
    );
    const { startJobRun, finishJobRun } = await import("@/lib/jobs/runs");
    client = createIngestionSupabaseClient();
    const run = await startJobRun(client, {
      jobName: job,
      triggerType: triggerTypeFor(args.mode, scheduled, args.smoke),
      mode: args.mode,
    });
    runId = run.id;
  } catch (error) {
    structuredLog({
      job,
      msg: "job_run_record_skipped",
      level: "warn",
      error: errorMessage(error),
    });
  }

  try {
    const summary = await dispatchJob(job, args, reporter);
    structuredLog({ job, msg: "job_finished", ...summary });
    if (client && runId) {
      const { finishJobRun } = await import("@/lib/jobs/runs");
      const failureCount =
        "failures" in summary && typeof summary.failures === "number"
          ? summary.failures
          : 0;
      const failed = summary.status === "FAILED" || failureCount > 0;
      await finishJobRun(client, runId, {
        status:
          summary.status === "SKIPPED"
            ? "SKIPPED"
            : summary.status === "PARTIAL"
              ? "PARTIAL"
              : failed
                ? "FAILED"
                : "SUCCEEDED",
        summary,
      });
    }
    if (summary.status === "FAILED") {
      process.exitCode = 1;
    } else if (
      summary.status === "PARTIAL" &&
      (job === "ingest" || job === "alerts" || job === "renewals")
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    structuredLog({
      job,
      msg: "job_failed",
      level: "error",
      error: errorMessage(error),
    });
    await reporter.captureException(error, { job });
    if (client && runId) {
      const { finishJobRun } = await import("@/lib/jobs/runs");
      await finishJobRun(client, runId, {
        status: "FAILED",
        errorMessage: errorMessage(error),
      });
    }
    process.exitCode = 1;
  }
}

async function dispatchJob(
  job: "ingest" | "previews" | "alerts" | "renewals" | "data-quality",
  args: Awaited<ReturnType<typeof import("@/lib/jobs/cli").parseJobArgs>>,
  reporter: ReturnType<typeof import("@/lib/monitoring").createErrorReporter>,
) {
  if (job === "ingest") {
    const { createSupabaseIngestionStore } = await import(
      "@/ingestion/store/supabase"
    );
    const { createIngestionSupabaseClient } = await import(
      "@/ingestion/store/worker-client"
    );
    const { runScheduledIngestion } = await import("@/lib/jobs/ingest");
    const store = createSupabaseIngestionStore(createIngestionSupabaseClient());
    const result = await runScheduledIngestion({
      store,
      mode: args.mode,
      force: args.force,
      due: args.due || (!args.all && args.sources.length === 0),
      all: args.all,
      sourceKeys: args.sources.length ? args.sources : undefined,
      limit: args.limit,
      cursor: args.cursor,
      updatedFrom: args.updatedFrom,
      updatedTo: args.updatedTo,
      smoke: args.smoke,
      reporter,
      onPreviewPublished: async (dealId) => {
        const { enqueueDealMatches } = await import("@/lib/matching/queue");
        await enqueueDealMatches(dealId);
      },
    });
    if (!args.dryRun) {
      const { processMatchJobs } = await import("@/lib/matching/queue");
      const matches = await processMatchJobs({ limit: 10, maxPairs: 80 });
      return { ...result, matches };
    }
    return result;
  }

  if (job === "previews") {
    const { createSupabaseIngestionStore } = await import(
      "@/ingestion/store/supabase"
    );
    const { createIngestionSupabaseClient } = await import(
      "@/ingestion/store/worker-client"
    );
    const { rebuildChangedPreviews } = await import("@/lib/jobs/previews");
    const store = createSupabaseIngestionStore(createIngestionSupabaseClient());
    const result = await rebuildChangedPreviews({
      store,
      mode: args.mode,
      limit: args.limit,
      changedSince: args.changedSince,
      reporter,
      onPreviewPublished: async (dealId) => {
        const { enqueueDealMatches } = await import("@/lib/matching/queue");
        await enqueueDealMatches(dealId);
      },
    });
    if (!args.dryRun) {
      const { processMatchJobs } = await import("@/lib/matching/queue");
      const matches = await processMatchJobs({ limit: 10, maxPairs: 80 });
      return { ...result, matches, status: result.failures > 0 ? "PARTIAL" : "SUCCEEDED" };
    }
    return { ...result, status: "SUCCEEDED" };
  }

  if (job === "alerts") {
    const { evaluateAlerts } = await import("@/lib/alerts/evaluate");
    const { sendAlertProviderTest } = await import("@/lib/email/send");
    const { getServerEnv } = await import("@/lib/env/server");
    const env = getServerEnv();
    const dryRun = args.mode !== "live";
    const evaluation = await evaluateAlerts({
      dryRun,
      reporter,
    });
    let testEmail: { skipped?: boolean; id?: string | null } | null = null;
    const testTo = args.testEmail ?? env.DEALATLAS_EMAIL_TEST_TO;
    if (args.mode === "test" && testTo) {
      testEmail = await sendAlertProviderTest({ to: testTo });
    }
    const status =
      evaluation.deliveryFailures > 0
        ? "PARTIAL"
        : "SUCCEEDED";
    return { ...evaluation, testEmail, status };
  }

  if (job === "renewals") {
    const { createSupabaseIngestionStore } = await import(
      "@/ingestion/store/supabase"
    );
    const { createIngestionSupabaseClient } = await import(
      "@/ingestion/store/worker-client"
    );
    const { recalculateRenewalSignals } = await import("@/lib/jobs/renewals");
    const { evaluateAlerts } = await import("@/lib/alerts/evaluate");
    const store = createSupabaseIngestionStore(createIngestionSupabaseClient());
    const recalc = await recalculateRenewalSignals({
      store,
      mode: args.mode,
      limit: args.limit,
      reporter,
    });
    const alerts =
      args.mode === "live"
        ? await evaluateAlerts({ reporter })
        : await evaluateAlerts({ dryRun: true, reporter });
    return {
      ...recalc,
      alerts,
      status: recalc.failures > 0 ? "PARTIAL" : "SUCCEEDED",
    };
  }

  const { createSupabaseIngestionStore } = await import(
    "@/ingestion/store/supabase"
  );
  const { createIngestionSupabaseClient } = await import(
    "@/ingestion/store/worker-client"
  );
  const { runDataQualityChecks } = await import("@/lib/jobs/quality");
  const { ADMIN_STALE_AFTER_DAYS } = await import("@/lib/admin/paths");
  const client = createIngestionSupabaseClient();
  const store = createSupabaseIngestionStore(client);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const staleBefore = new Date(
    Date.now() - ADMIN_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const [staleOpenDeals, unpublishedRisk, failedRuns24h] = await Promise.all([
    client
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("status", "OPEN")
      .lt("last_verified_at", staleBefore),
    client
      .from("deal_previews")
      .select("deal_id", { count: "exact", head: true })
      .eq("is_published", false)
      .in("leakage_risk", ["REVIEW", "HIGH"]),
    client
      .from("ingestion_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "FAILED")
      .gte("created_at", since),
  ]);
  const result = await runDataQualityChecks({
    store,
    mode: args.mode,
    counts: {
      staleOpenDeals: staleOpenDeals.count ?? 0,
      unpublishedRisk: unpublishedRisk.count ?? 0,
      failedRuns24h: failedRuns24h.count ?? 0,
    },
  });
  return {
    ...result,
    status:
      result.staleSources.length > 0 || result.failedRuns24h > 0
        ? "PARTIAL"
        : "SUCCEEDED",
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
