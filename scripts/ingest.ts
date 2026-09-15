import { loadEnvFiles } from "./load-env";

loadEnvFiles();

async function main() {
  const { parseJobArgs } = await import("@/lib/jobs/cli");
  const args = parseJobArgs(process.argv.slice(2));
  if (!args.source && !args.due && !args.all) {
    console.error(
      "Usage: npm run ingest -- --source <source-key> [--limit 5] [--smoke]\n" +
        "   or: npm run ingest -- --due [--mode test|dry-run]",
    );
    process.exitCode = 1;
    return;
  }

  const { createSupabaseIngestionStore } = await import(
    "@/ingestion/store/supabase"
  );
  const { createIngestionSupabaseClient } = await import(
    "@/ingestion/store/worker-client"
  );
  const { runScheduledIngestion } = await import("@/lib/jobs/ingest");
  const { createErrorReporter } = await import("@/lib/monitoring");
  const { structuredLog } = await import("@/lib/observability/log");

  const store = createSupabaseIngestionStore(createIngestionSupabaseClient());
  const result = await runScheduledIngestion({
    store,
    mode: args.mode,
    force: args.force,
    due: args.due || (!args.source && !args.all),
    all: args.all,
    sourceKeys: args.sources.length ? args.sources : undefined,
    limit: args.limit,
    cursor: args.cursor,
    updatedFrom: args.updatedFrom,
    updatedTo: args.updatedTo,
    smoke: args.smoke,
    reporter: createErrorReporter(),
    onPreviewPublished: async (dealId) => {
      const { enqueueDealMatches } = await import("@/lib/matching/queue");
      await enqueueDealMatches(dealId);
    },
  });

  if (!args.dryRun) {
    const { processMatchJobs } = await import("@/lib/matching/queue");
    const matches = await processMatchJobs({ limit: 10, maxPairs: 80 });
    structuredLog({ job: "ingest", msg: "ingestion_complete", ...result, matches });
    console.log(JSON.stringify({ ...result, matches }, null, 2));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  if (result.status === "FAILED") {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
