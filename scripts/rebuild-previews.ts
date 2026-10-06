import { loadEnvFiles } from "./load-env";

loadEnvFiles();

async function main() {
  const { parseJobArgs } = await import("@/lib/jobs/cli");
  const args = parseJobArgs(process.argv.slice(2));
  const { createSupabaseIngestionStore } = await import(
    "@/ingestion/store/supabase"
  );
  const { createIngestionSupabaseClient } = await import(
    "@/ingestion/store/worker-client"
  );
  const { rebuildAllPreviews, rebuildChangedPreviews } = await import(
    "@/lib/jobs/previews"
  );
  const { structuredLog } = await import("@/lib/observability/log");
  const { createErrorReporter } = await import("@/lib/monitoring");

  const store = createSupabaseIngestionStore(createIngestionSupabaseClient());
  const reporter = createErrorReporter();

  if (args.all) {
    const result = await rebuildAllPreviews({
      store,
      mode: args.mode,
      batchSize: args.limit,
      cursor: args.cursor,
      reporter,
    });
    structuredLog({
      job: "previews",
      msg: "preview_rebuild_complete",
      mode: result.mode,
      dryRun: result.dryRun,
      selected: result.selected,
      processed: result.processed,
      failures: result.failures,
      batches: result.batches.length,
      low: result.risks.LOW,
      review: result.risks.REVIEW,
      high: result.risks.HIGH,
    });
    console.log(
      JSON.stringify(
        {
          mode: result.mode,
          dryRun: result.dryRun,
          selected: result.selected,
          processed: result.processed,
          failures: result.failures,
          batches: result.batches.length,
          risks: result.risks,
          nextCursor: result.nextCursor,
        },
        null,
        2,
      ),
    );
    return;
  }

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
  let matches = null;
  if (!args.dryRun) {
    const { processMatchJobs } = await import("@/lib/matching/queue");
    matches = await processMatchJobs({ limit: 10, maxPairs: 80 });
  }
  const payload = { ...result, matches };
  structuredLog({ job: "previews", msg: "preview_rebuild_complete", ...payload });
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
