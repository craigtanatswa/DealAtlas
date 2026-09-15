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
  const { rebuildChangedPreviews } = await import("@/lib/jobs/previews");
  const { structuredLog } = await import("@/lib/observability/log");
  const { createErrorReporter } = await import("@/lib/monitoring");

  const store = createSupabaseIngestionStore(createIngestionSupabaseClient());
  const result = await rebuildChangedPreviews({
    store,
    mode: args.mode,
    limit: args.limit,
    changedSince: args.changedSince,
    all: args.all || !args.changedSince,
    reporter: createErrorReporter(),
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
