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
  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    fs.appendFileSync(output, `counts=${line}\n`);
  }
}

function phaseFromEnv(): "ingest" | "previews" | "all" {
  const phase = (process.env.OPEN_INGEST_PHASE ?? "all").trim();
  if (phase === "ingest" || phase === "previews" || phase === "all") {
    return phase;
  }
  throw new Error("OPEN_INGEST_PHASE must be ingest, previews, or all");
}

function readChangedDealIds(filePath: string | undefined): string[] {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(
    (item): item is string =>
      typeof item === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item),
  );
}

async function main() {
  const {
    openIngestLogLine,
    openIngestShouldFail,
    publicIngestErrorLine,
    runOpenContractsFinderIngest,
    runOpenFindATenderIngest,
    runOpenProcontractIngest,
  } = await import("@/lib/jobs/ingest-open");
  const { isProcontractSourceKey } = await import("@/ingestion/sources/procontract/constants");
  const { createSupabaseIngestionStore } = await import("@/ingestion/store/supabase");
  const { createIngestionSupabaseClient } = await import(
    "@/ingestion/store/worker-client"
  );
  const phase = phaseFromEnv();
  const { dryRun, backfillDays } = countsFromEnv();
  const store = createSupabaseIngestionStore(createIngestionSupabaseClient());
  const statePath = process.env.OPEN_INGEST_STATE;
  const source = (process.env.OPEN_INGEST_SOURCE ?? "find-a-tender").trim();
  if (
    source !== "find-a-tender" &&
    source !== "contracts-finder" &&
    !isProcontractSourceKey(source)
  ) {
    throw new Error(
      "OPEN_INGEST_SOURCE must be find-a-tender, contracts-finder, or a ProContract portal key",
    );
  }
  const result = isProcontractSourceKey(source)
    ? await runOpenProcontractIngest({
        store,
        sourceKey: source,
        dryRun: phase === "previews" ? false : dryRun,
        phase,
      })
    : await (source === "contracts-finder"
        ? runOpenContractsFinderIngest
        : runOpenFindATenderIngest)({
        store,
        dryRun: phase === "previews" ? false : dryRun,
        backfillDays,
        phase,
        dealIds: phase === "previews" ? readChangedDealIds(statePath) : undefined,
      });
  if (phase === "ingest" && statePath && !dryRun && !isProcontractSourceKey(source)) {
    const prior =
      source === "contracts-finder" ? readChangedDealIds(statePath) : [];
    const ids = [...new Set([...prior, ...result.changedDealIds])];
    fs.writeFileSync(statePath, JSON.stringify(ids));
  }
  emit(openIngestLogLine(result.counts));
  for (const error of result.errors) {
    console.error(publicIngestErrorLine(error));
  }
  if (openIngestShouldFail(result)) {
    process.exitCode = 1;
  }
}

main().catch(async (err: unknown) => {
  const { publicFatalErrorLine } = await import("@/lib/jobs/ingest-open");
  console.error(publicFatalErrorLine(err));
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
