import { loadEnvFiles } from "./load-env";

loadEnvFiles();

async function main() {
  const { contextFromPersisted } = await import("@/ingestion/intelligence/types");
  const { persistIntelligenceAndPreview } = await import("@/ingestion/preview/publish");
  const { createSupabaseIngestionStore } = await import("@/ingestion/store/supabase");
  const { createIngestionSupabaseClient } = await import("@/ingestion/store/worker-client");

  const args = parseArgs(process.argv.slice(2));
  const store = createSupabaseIngestionStore(createIngestionSupabaseClient());
  const deals = await store.listDeals(args.limit ?? 50);
  const now = new Date();
  const results: Array<{ dealId: string; published: boolean; risk: string }> = [];

  for (const deal of deals) {
    const context = await contextFromPersisted({ store, deal, now });
    if (!context) {
      continue;
    }
    const outcome = await persistIntelligenceAndPreview({ store, context });
    results.push({
      dealId: deal.id,
      published: outcome.published,
      risk: outcome.leakageRisk,
    });
  }

  console.log(
    JSON.stringify(
      {
        processed: results.length,
        published: results.filter((item) => item.published).length,
        blocked: results.filter((item) => !item.published).length,
        results,
      },
      null,
      2,
    ),
  );
}

function parseArgs(argv: string[]) {
  const result: { limit?: number } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--limit" && next) {
      result.limit = Number(next);
      index += 1;
    }
  }
  return result;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
