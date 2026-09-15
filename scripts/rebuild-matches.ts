import { loadEnvFiles } from "./load-env";

loadEnvFiles();

async function main() {
  const { processMatchJobs, enqueueProfileMatches, enqueueDealMatches } = await import(
    "@/lib/matching/queue"
  );
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");

  const args = parseArgs(process.argv.slice(2));
  const admin = createSupabaseAdminClient();

  if (args.profileId) {
    await enqueueProfileMatches(args.profileId, admin);
  }
  if (args.dealId) {
    await enqueueDealMatches(args.dealId, admin);
  }

  const result = await processMatchJobs({
    admin,
    limit: args.jobs ?? 20,
    maxPairs: args.limit ?? 200,
  });

  console.log(JSON.stringify(result, null, 2));
}

function parseArgs(argv: string[]) {
  const result: {
    profileId?: string;
    dealId?: string;
    limit?: number;
    jobs?: number;
  } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--profile" && next) {
      result.profileId = next;
      index += 1;
    } else if (arg === "--deal" && next) {
      result.dealId = next;
      index += 1;
    } else if (arg === "--limit" && next) {
      result.limit = Number(next);
      index += 1;
    } else if (arg === "--jobs" && next) {
      result.jobs = Number(next);
      index += 1;
    }
  }
  return result;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
