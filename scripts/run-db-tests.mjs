import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runRollbackChecks } from "./check-rollbacks.mjs";
import { assertSafeDbTestTargets } from "./db-target-guard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readLocalSupabaseEnv() {
  const result = spawnSync(
    "npx",
    ["supabase", "status", "--output", "json", "--log-level", "error"],
    {
      cwd: ROOT,
      encoding: "utf8",
      shell: true,
    },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "supabase status failed\n");
    process.exit(result.status ?? 1);
  }

  const raw = (result.stdout || "").trim();
  const jsonStart = raw.indexOf("{");
  if (jsonStart < 0) {
    process.stderr.write("supabase status did not return JSON.\n");
    process.exit(1);
  }

  const parsed = JSON.parse(raw.slice(jsonStart));
  const url = parsed.API_URL || parsed.SUPABASE_URL;
  const anon = parsed.ANON_KEY || parsed.PUBLISHABLE_KEY || parsed.SUPABASE_ANON_KEY;
  const secret =
    parsed.SERVICE_ROLE_KEY ||
    parsed.SECRET_KEY ||
    parsed.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon || !secret || !parsed.DB_URL) {
    process.stderr.write(
      "Could not read local Supabase API URL, DB URL and keys from `supabase status`.\n",
    );
    process.exit(1);
  }

  return {
    dbUrl: parsed.DB_URL,
    DEALATLAS_DB_TEST_URL: url,
    DEALATLAS_DB_TEST_ANON_KEY: anon,
    DEALATLAS_DB_TEST_SECRET_KEY: secret,
  };
}

const { dbUrl, ...testEnv } = readLocalSupabaseEnv();
try {
  assertSafeDbTestTargets([
    ["supabase status API_URL", testEnv.DEALATLAS_DB_TEST_URL],
    ["supabase status DB_URL", dbUrl],
  ]);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
run("npx", ["supabase", "test", "db", "--local"]);
try {
  runRollbackChecks(dbUrl);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
run(
  "npx",
  ["vitest", "run", "tests/integration"],
  testEnv,
);
