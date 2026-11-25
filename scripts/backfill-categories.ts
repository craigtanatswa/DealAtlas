/**
 * Label-only category backfill. Recomputes deals.main_category and
 * deal_previews.main_category from stored CPV classifications, and fills
 * deal_classifications.category_id where it is null. It never reads a live
 * source, never copies titles or descriptions, and writes only those three
 * category columns.
 *
 * Dry-run is the default and never writes. Writes need --apply plus
 * DEALATLAS_CATEGORY_BACKFILL_APPLY=1. The production Supabase project
 * (wdcanzikysdsvdlqbrbd, or DEALATLAS_PROD_SUPABASE_URL /
 * DEALATLAS_PROD_SUPABASE_PROJECT_REF) is refused even in dry-run. A remote
 * non-production apply also needs DEALATLAS_CATEGORY_BACKFILL_ALLOW_REMOTE=1
 * and DEALATLAS_CATEGORY_BACKFILL_REMOTE_HOST set to that exact host.
 */
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

type Args = {
  apply: boolean;
  limit?: number;
  help: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];
    if (value === "--apply") {
      args.apply = true;
    } else if (value === "--limit" && next) {
      const limit = Number(next);
      if (Number.isFinite(limit) && limit > 0) {
        args.limit = Math.floor(limit);
      }
      index += 1;
    } else if (value === "--help" || value === "-h") {
      args.help = true;
    }
  }
  return args;
}

function usage(): string {
  return [
    "Usage: npx tsx scripts/backfill-categories.ts [options]",
    "",
    "Options:",
    "  --apply          Write category-only changes (requires DEALATLAS_CATEGORY_BACKFILL_APPLY=1)",
    "  --limit <n>      Maximum deals to inspect",
    "  --help           Show this help",
    "",
    "Default mode is a dry-run and never writes.",
    "The production Supabase project is refused even in dry-run.",
    "Remote non-production apply needs DEALATLAS_CATEGORY_BACKFILL_ALLOW_REMOTE=1",
    "and DEALATLAS_CATEGORY_BACKFILL_REMOTE_HOST set to the exact host.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const { categoryBackfillBlockReason, runCategoryBackfill } = await import(
    "@/lib/jobs/backfill-categories"
  );
  const blocked = categoryBackfillBlockReason(process.env, args.apply);
  if (blocked) {
    throw new Error(blocked);
  }

  const { createSupabaseIngestionStore } = await import("@/ingestion/store/supabase");
  const { createIngestionSupabaseClient } = await import("@/ingestion/store/worker-client");
  const store = createSupabaseIngestionStore(createIngestionSupabaseClient());

  const result = await runCategoryBackfill({
    store,
    apply: args.apply,
    limit: args.limit,
    env: process.env,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
