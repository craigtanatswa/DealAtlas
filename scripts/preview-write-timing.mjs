/**
 * Informational benchmark: how long a gated deal_previews INSERT/UPDATE takes
 * right after a bulk deal insert versus after maintenance on public.deals.
 * Runs only against a throwaway LOCAL database: it TRUNCATEs public.deals.
 *
 *   node scripts/preview-write-timing.mjs <postgres-url> [--deals 20000] [--samples 15] [--out write-timing]
 *
 * Each variant starts from an empty deals table, bulk inserts the filler
 * corpus, applies its maintenance step and then times one preview INSERT and
 * one UPDATE per sample deal. Autovacuum is disabled on public.deals so the
 * "after bulk insert" window is not cleaned up mid-measurement. Index options
 * are only changed inside this disposable database and are reset afterwards.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertSafeDbTestTargets } from "./db-target-guard.mjs";

const INDEX = "public.deals_leak_source_tsv_idx";

export const VARIANTS = [
  { id: "after-bulk-insert", label: "Right after bulk insert", before: "", after: "" },
  { id: "after-analyze", label: "After ANALYZE public.deals", before: "", after: "analyze public.deals;" },
  {
    id: "after-gin-clean-analyze",
    label: "After gin_clean_pending_list + ANALYZE",
    before: "",
    after: `select pg_catalog.gin_clean_pending_list('${INDEX}'::regclass); analyze public.deals;`,
  },
  { id: "after-vacuum-analyze", label: "After VACUUM ANALYZE public.deals", before: "", after: "vacuum analyze public.deals;" },
  {
    id: "fastupdate-off",
    label: "fastupdate=off during bulk insert",
    before: `alter index ${INDEX} set (fastupdate = off);`,
    after: "",
  },
];

function parseArgs(argv) {
  const args = { dbUrl: undefined, deals: 20000, samples: 15, out: "write-timing" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--deals") args.deals = Number(argv[++index]);
    else if (arg === "--samples") args.samples = Number(argv[++index]);
    else if (arg === "--out") args.out = argv[++index];
    else args.dbUrl = arg;
  }
  if (!args.dbUrl) throw new Error("usage: node scripts/preview-write-timing.mjs <postgres-url> [--deals N] [--samples N] [--out dir]");
  if (!Number.isInteger(args.deals) || args.deals < 1 || !Number.isInteger(args.samples) || args.samples < 2) {
    throw new Error("--deals must be a positive integer and --samples at least 2");
  }
  return args;
}

export function variantSql(variant, { deals, samples }) {
  return `
\\set ON_ERROR_STOP on
set statement_timeout = 0;
set client_min_messages = warning;
alter table public.deals set (autovacuum_enabled = false);
truncate public.deals cascade;
truncate private.preview_holds;
${variant.before}
insert into public.deals (primary_source_id, external_primary_id, source_title, source_description,
                          deal_type, buyer_sector, stage, status, main_category)
select s.id,
       'timing-filler-' || g,
       'Filler ' || initcap(substr(md5(g::text || 't'), 1, 7)) || ' services contract ' || g,
       'Supply of ' || substr(md5(g::text || 'a'), 1, 6) || ' and ' || substr(md5(g::text || 'b'), 1, 6)
         || ' maintenance for the ' || initcap(substr(md5(g::text || 'c'), 1, 8)) || ' estate, including '
         || substr(md5(g::text || 'd'), 1, 7) || ' support, ' || substr(md5(g::text || 'e'), 1, 7)
         || ' reporting and general facilities work over three years.',
       'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Technology'
from generate_series(1, ${deals}) g
cross join (select id from public.data_sources where source_key = 'find-a-tender') s;
insert into public.deals (primary_source_id, external_primary_id, source_title, source_description,
                          deal_type, buyer_sector, stage, status, main_category)
select s.id,
       'timing-target-' || g,
       'Tormalyn Depot ' || g || ' fleet telemetry replacement for Varrowby district',
       'The Varrowby district council needs fleet telemetry replaced at Tormalyn Depot ' || g
         || ' with remote diagnostics and a five year support term.',
       'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Technology'
from generate_series(1, ${samples}) g
cross join (select id from public.data_sources where source_key = 'find-a-tender') s;
${variant.after}
create temp table timings (op text, ms double precision);
do $$
declare
  r record;
  t0 timestamptz;
begin
  for r in
    select id, row_number() over (order by external_primary_id) as n
    from public.deals where external_primary_id like 'timing-target-%'
  loop
    t0 := clock_timestamp();
    insert into public.deal_previews (deal_id, slug, preview_title, preview_summary, deal_type,
                                      buyer_sector, stage, status, main_category, leakage_risk, is_published)
    values (r.id, 'fleet-telemetry-for-a-district-council-' || substr(md5(r.id::text), 1, 8),
            'Fleet telemetry replacement for a district council',
            'A district council wants vehicle telemetry replaced at a depot, with remote diagnostics.',
            'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Technology', 'LOW', true);
    insert into timings values ('insert', extract(epoch from clock_timestamp() - t0) * 1000);
    t0 := clock_timestamp();
    update public.deal_previews
       set preview_summary = 'A district council wants vehicle telemetry replaced, with remote diagnostics and support.'
     where deal_id = r.id;
    insert into timings values ('update', extract(epoch from clock_timestamp() - t0) * 1000);
  end loop;
end $$;
select json_build_object(
  'pending_pages', (select pending_pages from extensions.pgstatginindex('${INDEX}'::regclass)),
  'ops', (select json_object_agg(op, stats) from (
    select op, json_build_object(
      'n', count(*),
      'p50', round(percentile_cont(0.5) within group (order by ms)::numeric, 2),
      'p95', round(percentile_cont(0.95) within group (order by ms)::numeric, 2),
      'max', round(max(ms)::numeric, 2)) as stats
    from timings group by op) per_op)
)::text;
alter index ${INDEX} reset (fastupdate);
`;
}

function runPsql(dbUrl, sql) {
  const result = spawnSync("psql", [dbUrl, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    encoding: "utf8",
    input: sql,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw new Error(`could not run psql (install the PostgreSQL client): ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr || "psql failed");
  return result.stdout;
}

function markdown(results, args) {
  const rows = results.map(
    (r) =>
      `| ${r.label} | ${r.ops.insert.p50} | ${r.ops.insert.p95} | ${r.ops.update.p50} | ${r.ops.update.p95} | ${r.pending_pages ?? "n/a"} |`,
  );
  return [
    `### Preview write timing (informational, not a gate)`,
    ``,
    `${args.deals} filler deals, ${args.samples} preview INSERTs and UPDATEs per variant, times in ms. GitHub runner timing is not production timing.`,
    ``,
    `| Variant | INSERT p50 | INSERT p95 | UPDATE p50 | UPDATE p95 | GIN pending pages |`,
    `|---|---:|---:|---:|---:|---:|`,
    ...rows,
    ``,
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  assertSafeDbTestTargets([["write timing database", args.dbUrl]]);
  runPsql(args.dbUrl, "create extension if not exists pgstattuple with schema extensions;");
  const results = [];
  for (const variant of VARIANTS) {
    const started = Date.now();
    const output = runPsql(args.dbUrl, variantSql(variant, args));
    const line = output.trim().split("\n").filter((value) => value.startsWith("{")).pop();
    if (!line) throw new Error(`no timing output for ${variant.id}`);
    const parsed = JSON.parse(line);
    results.push({ id: variant.id, label: variant.label, ...parsed, wallSeconds: (Date.now() - started) / 1000 });
    console.log(`${variant.id}: insert p50 ${parsed.ops.insert.p50} ms, p95 ${parsed.ops.insert.p95} ms; update p50 ${parsed.ops.update.p50} ms, p95 ${parsed.ops.update.p95} ms`);
  }
  runPsql(args.dbUrl, "alter table public.deals reset (autovacuum_enabled);");
  fs.mkdirSync(args.out, { recursive: true });
  const report = { generatedAt: new Date().toISOString(), deals: args.deals, samples: args.samples, results };
  fs.writeFileSync(path.join(args.out, "write-timing.json"), JSON.stringify(report, null, 2));
  const summary = markdown(results, args);
  fs.writeFileSync(path.join(args.out, "write-timing.md"), summary);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
