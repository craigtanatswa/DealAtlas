/**
 * Concurrent founding cap. Forty separate sessions reserve and claim.
 * Exactly 25 become founders. The rest are refused or recorded as standard.
 * Local Supabase only. The database job runs this after migrations.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { assertSafeDbTestTargets } from "./db-target-guard.mjs";

const exec = promisify(execFile);
const ATTEMPTS = 40;

function userId(n) {
  return `f3000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

async function psql(dbUrl, sql) {
  const result = await exec(
    "psql",
    [dbUrl, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql],
    { encoding: "utf8" },
  );
  return result.stdout.trim();
}

async function main() {
  const dbUrl = process.argv[2];
  if (!dbUrl) {
    process.stderr.write("usage: node scripts/founding-cap-race.mjs <postgres-url>\n");
    process.exit(1);
  }
  assertSafeDbTestTargets([["founding cap race", dbUrl]]);

  const ids = Array.from({ length: ATTEMPTS }, (_, i) => userId(i + 1));
  const idList = ids.map((id) => `'${id}'`).join(",");

  try {
    await psql(
      dbUrl,
      `
      insert into auth.users (id, email)
      select id::uuid, 'race-' || id || '@example.test'
      from unnest(array[${idList}]) as id;
      `,
    );

    await Promise.all(
      ids.map((id) =>
        psql(
          dbUrl,
          `
          select public.reserve_founding_slot('${id}'::uuid);
          select public.claim_founding_activation('evt-${id}', 'sub-${id}', '${id}'::uuid);
          `,
        ),
      ),
    );

    const founders = Number(
      await psql(
        dbUrl,
        `select count(*) from public.profiles where id in (${idList}) and founding_member;`,
      ),
    );
    const fallbacks = Number(
      await psql(
        dbUrl,
        `select count(*) from private.founding_cap_fallbacks where user_id in (${idList});`,
      ),
    );
    process.stdout.write(
      `founding_race founders=${founders} fallbacks=${fallbacks} attempts=${ATTEMPTS}\n`,
    );
    if (founders !== 25 || founders + fallbacks !== ATTEMPTS) {
      process.exitCode = 1;
    }
  } finally {
    await psql(
      dbUrl,
      `
      delete from private.founding_cap_fallbacks where user_id in (${idList});
      delete from auth.users where id in (${idList});
      `,
    ).catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
