/**
 * Regenerates sanitised previews from canonical deals.
 * This script refuses production and any non-local database. Do not point it
 * at a hosted project. The production rebuild workflow is separate.
 */
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

async function main() {
  const { previewRegenerationBlockReason } = await import(
    "@/lib/jobs/preview-regeneration-guard"
  );
  const reason = previewRegenerationBlockReason(process.env);
  if (reason) {
    throw new Error(reason);
  }

  const { parseJobArgs } = await import("@/lib/jobs/cli");
  const args = parseJobArgs(process.argv.slice(2));
  const { createSupabaseIngestionStore } = await import("@/ingestion/store/supabase");
  const { createIngestionSupabaseClient } = await import("@/ingestion/store/worker-client");
  const { rebuildAllPreviews } = await import("@/lib/jobs/previews");

  const store = createSupabaseIngestionStore(createIngestionSupabaseClient());
  const result = await rebuildAllPreviews({
    store,
    mode: args.mode,
    batchSize: args.limit,
    cursor: args.cursor,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
