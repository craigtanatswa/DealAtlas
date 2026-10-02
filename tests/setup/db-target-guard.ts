import { assertSafeDbTestTargets } from "../../scripts/db-target-guard.mjs";

export default function setup() {
  const targets: Array<[string, string | undefined]> = [
    ["DEALATLAS_DB_TEST_URL", process.env.DEALATLAS_DB_TEST_URL],
  ];
  if (process.env.INGEST_LIVE_SMOKE === "1") {
    targets.push(["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL]);
  }
  assertSafeDbTestTargets(targets);
}
