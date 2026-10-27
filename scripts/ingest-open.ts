import fs from "node:fs";

import { loadEnvFiles } from "./load-env";

loadEnvFiles();

function countsFromEnv(): { dryRun: boolean; backfillDays: number } {
  const dry = (process.env.DRY_RUN ?? "true").trim().toLowerCase();
  if (dry !== "true" && dry !== "false") {
    throw new Error("dry_run must be true or false");
  }
  const days = Number(process.env.BACKFILL_DAYS ?? "7");
  if (!Number.isInteger(days) || days < 1 || days > 180) {
    throw new Error("backfill_days must be an integer from 1 to 180");
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
    mergeOpenIngestChangedIds,
    openIngestLogLine,
    openIngestShouldFail,
    publicIngestErrorLine,
    runOpenCatalogueIngest,
    runOpenContractsFinderIngest,
    runOpenFindAGrantIngest,
    runOpenFindATenderIngest,
    runOpenPublicContractsScotlandIngest,
    runOpenSell2WalesIngest,
    runOpenTedIngest,
    runOpenInnovateUkIngest,
  } = await import("@/lib/jobs/ingest-open");
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
    source !== "public-contracts-scotland" &&
    source !== "sell2wales" &&
    source !== "ted" &&
    source !== "find-a-grant" &&
    source !== "innovate-uk" &&
    source !== "gca-agreements" &&
    source !== "gca-procurement-pipeline"
  ) {
    throw new Error(
      "OPEN_INGEST_SOURCE must be find-a-tender, contracts-finder, public-contracts-scotland, sell2wales, ted, find-a-grant, innovate-uk, gca-agreements, or gca-procurement-pipeline",
    );
  }
  const dealIds = phase === "previews" ? readChangedDealIds(statePath) : undefined;
  const result =
    source === "gca-agreements" || source === "gca-procurement-pipeline"
      ? await runOpenCatalogueIngest({
          store,
          dryRun: phase === "previews" ? false : dryRun,
          phase,
          sourceKey: source,
          dealIds,
        })
      : source === "find-a-grant" || source === "innovate-uk"
        ? await (source === "find-a-grant"
            ? runOpenFindAGrantIngest
            : runOpenInnovateUkIngest)({
            store,
            dryRun: phase === "previews" ? false : dryRun,
            phase,
            dealIds,
          })
        : await (source === "contracts-finder"
            ? runOpenContractsFinderIngest
            : source === "public-contracts-scotland"
              ? runOpenPublicContractsScotlandIngest
              : source === "sell2wales"
                ? runOpenSell2WalesIngest
                : source === "ted"
                  ? runOpenTedIngest
                  : runOpenFindATenderIngest)({
            store,
            dryRun: phase === "previews" ? false : dryRun,
            backfillDays,
            phase,
            dealIds,
          });
  if (phase === "ingest" && statePath && !dryRun) {
    const ids = mergeOpenIngestChangedIds(
      source,
      readChangedDealIds(statePath),
      result.changedDealIds,
    );
    fs.writeFileSync(statePath, JSON.stringify(ids));
  }
  emit(openIngestLogLine(result.counts));
  if (result.status !== "SKIPPED") {
    for (const error of result.errors) {
      console.error(publicIngestErrorLine(error));
    }
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
