/**
 * Runs supabase/rollback/0019_rollback.sql and 0018_rollback.sql inside one
 * outer transaction against a local database, checks the rolled-back state,
 * and then ROLLS BACK, so the database keeps 0018/0019 applied.
 *
 *   node scripts/check-rollbacks.mjs postgresql://postgres:postgres@127.0.0.1:54322/postgres
 *
 * The database must have every migration (0018 and 0019 included) applied.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertSafeDbTestTargets } from "./db-target-guard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The rollback scripts own their transaction; strip it so ours wraps both. */
function rollbackBody(file) {
  const lines = fs.readFileSync(path.join(ROOT, "supabase/rollback", file), "utf8").split("\n");
  const begins = lines.filter((line) => line.trim().toLowerCase() === "begin;").length;
  const commits = lines.filter((line) => line.trim().toLowerCase() === "commit;").length;
  if (begins !== 1 || commits !== 1) {
    throw new Error(`${file} must contain exactly one "begin;" and one "commit;" line`);
  }
  return lines.filter((line) => !["begin;", "commit;"].includes(line.trim().toLowerCase())).join("\n");
}

const CHECKS = `
insert into auth.users (id, email) values
  ('d0000000-0000-4000-8000-000000000001', 'rollback-null-period@example.test'),
  ('d0000000-0000-4000-8000-000000000002', 'rollback-paid@example.test'),
  ('d0000000-0000-4000-8000-000000000003', 'rollback-cancelled-null@example.test');

insert into public.subscriptions (user_id, status, current_period_end, is_current, cancel_at_period_end) values
  ('d0000000-0000-4000-8000-000000000001', 'ACTIVE', null, true, false),
  ('d0000000-0000-4000-8000-000000000002', 'ACTIVE', now() + interval '10 days', true, false),
  ('d0000000-0000-4000-8000-000000000003', 'CANCELLED', null, true, true);

do $$
declare
  failures text[] := '{}';
begin
  if private.is_user_pro('d0000000-0000-4000-8000-000000000001') then
    failures := array_append(failures, 'after 0018 rollback, ACTIVE with NULL current_period_end is Pro');
  end if;
  if private.is_user_pro('d0000000-0000-4000-8000-000000000003') then
    failures := array_append(failures, 'after 0018 rollback, CANCELLED at period end with NULL current_period_end is Pro');
  end if;
  if not private.is_user_pro('d0000000-0000-4000-8000-000000000002') then
    failures := array_append(failures, 'after 0018 rollback, ACTIVE paid-through subscription is not Pro');
  end if;
  if pg_catalog.to_regclass('private.preview_holds') is not null
     or pg_catalog.to_regclass('private.leak_gate_terms') is not null
     or pg_catalog.to_regprocedure('private.preview_leak_findings(uuid, text, text, text, jsonb, text[], text)') is not null
     or pg_catalog.to_regprocedure('public.admin_release_preview_hold(uuid)') is not null then
    failures := array_append(failures, 'after 0018 rollback, 0018 objects remain');
  end if;
  if pg_catalog.to_regprocedure('private.detect_preview_leakage(uuid, text, text, jsonb)') is null then
    failures := array_append(failures, 'after 0018 rollback, the 0016 detect_preview_leakage is missing');
  end if;
  if not pg_catalog.has_table_privilege('anon', 'public.deal_previews', 'select') then
    failures := array_append(failures, 'after 0019 rollback, anon cannot select deal_previews');
  end if;
  if cardinality(failures) > 0 then
    raise exception 'rollback check failed: %', array_to_string(failures, '; ');
  end if;
end $$;

select 'ok - 0019 + 0018 rollbacks revert their objects and keep is_user_pro fail-closed';
`;

export function rollbackCheckSql() {
  return [
    "\\set ON_ERROR_STOP on",
    "begin;",
    rollbackBody("0019_rollback.sql"),
    rollbackBody("0018_rollback.sql"),
    CHECKS,
    "rollback;",
    "",
  ].join("\n");
}

export function runRollbackChecks(dbUrl) {
  if (!dbUrl) {
    throw new Error("rollback check needs a database URL");
  }
  assertSafeDbTestTargets([["rollback check database", dbUrl]]);
  const result = spawnSync("psql", [dbUrl, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    cwd: ROOT,
    encoding: "utf8",
    input: rollbackCheckSql(),
    env: { ...process.env, PGOPTIONS: "-c search_path=" },
  });
  if (result.error) {
    throw new Error(`could not run psql (install the PostgreSQL client): ${result.error.message}`);
  }
  process.stdout.write(result.stdout.split("\n").filter((line) => line.startsWith("ok")).join("\n") + "\n");
  if (result.status !== 0) {
    throw new Error(result.stderr || "rollback check failed");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dbUrl = process.argv[2] ?? process.env.DEALATLAS_DB_TEST_DB_URL;
  if (!dbUrl) {
    process.stderr.write("usage: node scripts/check-rollbacks.mjs <postgres-url>\n");
    process.exit(2);
  }
  try {
    runRollbackChecks(dbUrl);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
