import { loadEnvFiles } from "./load-env";

loadEnvFiles();

async function main() {
  const { runIngestion } = await import("@/ingestion/core/pipeline");
  const { getSourceAdapter } = await import("@/ingestion/sources/registry");
  const { createSupabaseIngestionStore } = await import(
    "@/ingestion/store/supabase"
  );
  const { createIngestionSupabaseClient } = await import(
    "@/ingestion/store/worker-client"
  );

  const args = parseArgs(process.argv.slice(2));
  if (!args.source) {
    console.error(
      "Usage: npm run ingest -- --source <source-key> [--limit 5] [--smoke]",
    );
    process.exitCode = 1;
    return;
  }

  const smoke = Boolean(args.smoke);
  const limit = args.limit ?? (smoke ? 3 : 20);
  const store = createSupabaseIngestionStore(createIngestionSupabaseClient());
  const adapter = getSourceAdapter(args.source);

  const result = await runIngestion({
    sourceKey: args.source,
    store,
    adapter,
    triggerType: smoke ? "SMOKE" : "MANUAL",
    limit,
    cursor: args.cursor,
    updatedFrom: args.updatedFrom,
    updatedTo: args.updatedTo,
    force: args.force,
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.status === "FAILED" || result.status === "SKIPPED") {
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]) {
  const result: {
    source?: string;
    limit?: number;
    cursor?: string;
    updatedFrom?: string;
    updatedTo?: string;
    smoke?: boolean;
    force?: boolean;
  } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--source" && next) {
      result.source = next;
      index += 1;
    } else if (arg === "--limit" && next) {
      result.limit = Number(next);
      index += 1;
    } else if (arg === "--cursor" && next) {
      result.cursor = next;
      index += 1;
    } else if (arg === "--updated-from" && next) {
      result.updatedFrom = next;
      index += 1;
    } else if (arg === "--updated-to" && next) {
      result.updatedTo = next;
      index += 1;
    } else if (arg === "--smoke") {
      result.smoke = true;
    } else if (arg === "--force") {
      result.force = true;
    }
  }

  return result;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
