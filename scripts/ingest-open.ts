import fs from "node:fs";

import { loadEnvFiles } from "./load-env";

loadEnvFiles();

function countsFromEnv(): { dryRun: boolean; backfillDays: number } {
  const dry = (process.env.DRY_RUN ?? "true").trim().toLowerCase();
  if (dry !== "true" && dry !== "false") {
    throw new Error("dry_run must be true or false");
  }
  const days = Number(process.env.BACKFILL_DAYS ?? "7");
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    throw new Error("backfill_days must be an integer from 1 to 366");
  }
  return { dryRun: dry === "true", backfillDays: days };
}

function emit(line: string) {
  console.log(line);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    fs.appendFileSync(summary, `${line}\n`);
  }
}

async function main() {
  const { openIngestLogLine, runOpenFindATenderIngest } = await import(
    "@/lib/jobs/ingest-open"
  );
  const { createSupabaseIngestionStore } = await import("@/ingestion/store/supabase");
  const { createIngestionSupabaseClient } = await import(
    "@/ingestion/store/worker-client"
  );
  const { dryRun, backfillDays } = countsFromEnv();
  const store = createSupabaseIngestionStore(createIngestionSupabaseClient());
  const result = await runOpenFindATenderIngest({
    store,
    dryRun,
    backfillDays,
  });
  emit(openIngestLogLine(result.counts));
  if (result.status === "PARTIAL" || result.status === "FAILED") {
    process.exitCode = 1;
  }
}

main().catch(() => {
  emit(
    JSON.stringify({
      fetched: 0,
      new: 0,
      updated: 0,
      unchanged: 0,
      failed: 1,
    }),
  );
  process.exitCode = 1;
});
