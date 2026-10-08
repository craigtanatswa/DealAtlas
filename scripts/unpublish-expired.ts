import fs from "node:fs";

import { loadEnvFiles } from "./load-env";

loadEnvFiles();

function emit(line: string) {
  console.log(line);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    fs.appendFileSync(summary, `${line}\n`);
  }
}

async function main() {
  const { unpublishExpiredDeals, unpublishExpiredLogLine } = await import(
    "@/lib/jobs/unpublish-expired"
  );
  const { createSupabaseIngestionStore } = await import("@/ingestion/store/supabase");
  const { createIngestionSupabaseClient } = await import(
    "@/ingestion/store/worker-client"
  );
  const result = await unpublishExpiredDeals({
    store: createSupabaseIngestionStore(createIngestionSupabaseClient()),
  });
  emit(unpublishExpiredLogLine(result));
}

main().catch(() => {
  emit(JSON.stringify({ unpublished: 0, failed: 1 }));
  process.exitCode = 1;
});
