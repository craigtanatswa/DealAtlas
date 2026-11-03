/**
 * Publishes open, in-date, unpublished deal previews only when the existing
 * leak gate passes. Dry-run is the default. Writes need --apply plus
 * DEALATLAS_REPUBLISH_APPLY=1, and obey the same production/remote target
 * guards as the preview regeneration and database test tooling.
 */
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

type Args = {
  apply: boolean;
  includeAdmin: boolean;
  limit?: number;
  help: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, includeAdmin: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];
    if (value === "--apply") {
      args.apply = true;
    } else if (value === "--include-admin") {
      args.includeAdmin = true;
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
    "Usage: npx tsx scripts/republish-open-deals.ts [options]",
    "",
    "Options:",
    "  --apply          Write changes (requires DEALATLAS_REPUBLISH_APPLY=1)",
    "  --include-admin  Also republish admin-held previews (default: held)",
    "  --limit <n>      Maximum candidates to inspect",
    "  --help           Show this help",
    "",
    "Default mode is a dry-run and never writes.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const { republishApplyBlockReason, runRepublishOpenDeals } = await import(
    "@/lib/jobs/republish-open"
  );
  const blocked = republishApplyBlockReason(process.env, args.apply);
  if (blocked) {
    throw new Error(blocked);
  }

  const { createSupabaseIngestionStore } = await import("@/ingestion/store/supabase");
  const { createIngestionSupabaseClient } = await import("@/ingestion/store/worker-client");
  const store = createSupabaseIngestionStore(createIngestionSupabaseClient());

  const result = await runRepublishOpenDeals({
    store,
    apply: args.apply,
    includeAdmin: args.includeAdmin,
    limit: args.limit,
    env: process.env,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
