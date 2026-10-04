/** DB state and ACL probes (spec 5.1, B-DB-01, B-LOCK-06, B-XPH-02), all as postgres over psql. */
import fs from "node:fs";
import path from "node:path";

import { writeJson } from "../lib/artifacts";
import { ROOT } from "../lib/env";
import type { Assertion, Ctx } from "../lib/probe";
import { eq, ok, sorted } from "../lib/probe";

export const ANON_DTO_RPCS = ["search_preview_dtos", "get_preview_dto_by_slug", "list_preview_sitemap_entries", "count_preview_sitemap_entries"];
export const SIGNED_IN_RPCS = ["get_preview_dto_by_deal_id", "resolve_preview_deal_id", "list_saved_deal_previews"];
const DTO_RPCS = [...ANON_DTO_RPCS, ...SIGNED_IN_RPCS];

export type Acl = {
  functions: Record<string, { name: string; anon: boolean; authenticated: boolean }>;
  tables: Record<string, Record<"anon" | "authenticated", Record<"select" | "insert" | "update" | "delete", boolean>>>;
  columns: Record<string, { anon: boolean; authenticated: boolean }>;
  schemas: Record<string, Record<"anon" | "authenticated", Record<"usage" | "create", boolean>>>;
};

export type SeedRow = {
  deal_id: string;
  slug: string;
  is_published: boolean;
  leakage_risk: string;
  unpublished_by_admin: boolean;
  held: boolean;
  finding_codes: string[];
};

export function migrationFiles(phase: Ctx["phase"]): string[] {
  const files = fs
    .readdirSync(path.join(ROOT, "supabase/migrations"))
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .map((f) => f.slice(0, 4));
  const all = sorted([...files, ...(phase === "B" ? ["0019"] : [])]);
  return phase === "A" ? all.filter((v) => v <= "0018") : all;
}

export function readMigrations(ctx: Ctx): Array<{ version: string; name: string }> {
  return ctx.psqlJson<Array<{ version: string; name: string }>>(`select version, name from supabase_migrations.schema_migrations order by version`);
}

export function readAcl(ctx: Ctx): Acl {
  type ClientRole = "anon" | "authenticated";
  const fns = ctx.psqlJson<Array<{ sig: string; name: string; anon: boolean; authenticated: boolean }>>(
    `select p.oid::regprocedure::text as sig, p.proname as name,
            has_function_privilege('anon', p.oid, 'execute') as anon,
            has_function_privilege('authenticated', p.oid, 'execute') as authenticated
       from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
      order by 1`,
  );
  const tables = ctx.psqlJson<Array<{ t: string; r: string; s: boolean; i: boolean; u: boolean; d: boolean }>>(
    `select c.relname as t, r.r,
            has_table_privilege(r.r, c.oid, 'select') as s, has_table_privilege(r.r, c.oid, 'insert') as i,
            has_table_privilege(r.r, c.oid, 'update') as u, has_table_privilege(r.r, c.oid, 'delete') as d
       from pg_class c cross join (values ('anon'), ('authenticated')) r(r)
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p')
      order by 1, 2`,
  );
  const columns = ctx.psqlJson<Array<{ c: string; anon: boolean; authenticated: boolean }>>(
    `select 'deal_matches.' || a.attname as c,
            has_column_privilege('anon', 'public.deal_matches'::regclass, a.attname, 'select') as anon,
            has_column_privilege('authenticated', 'public.deal_matches'::regclass, a.attname, 'select') as authenticated
       from pg_attribute a
      where a.attrelid = 'public.deal_matches'::regclass and a.attnum > 0 and not a.attisdropped
      order by 1`,
  );
  const schemas = ctx.psqlJson<Array<{ n: string; r: string; usage: boolean; create: boolean }>>(
    `select n.nspname as n, r.r,
            has_schema_privilege(r.r, n.oid, 'usage') as usage, has_schema_privilege(r.r, n.oid, 'create') as "create"
       from pg_namespace n cross join (values ('anon'), ('authenticated')) r(r)
      where n.nspname in ('public', 'private', 'extensions', 'auth')
      order by 1, 2`,
  );
  const acl: Acl = { functions: {}, tables: {}, columns: {}, schemas: {} };
  for (const f of fns) acl.functions[f.sig] = { name: f.name, anon: f.anon, authenticated: f.authenticated };
  for (const t of tables) {
    const entry = (acl.tables[t.t] ??= {} as Acl["tables"][string]);
    entry[t.r as ClientRole] = { select: t.s, insert: t.i, update: t.u, delete: t.d };
  }
  for (const c of columns) acl.columns[c.c] = { anon: c.anon, authenticated: c.authenticated };
  for (const s of schemas) {
    const entry = (acl.schemas[s.n] ??= {} as Acl["schemas"][string]);
    entry[s.r as ClientRole] = { usage: s.usage, create: s.create };
  }
  return acl;
}

export function readSeedOutcome(ctx: Ctx): Record<string, SeedRow> {
  const list = ctx.psqlJson<Array<SeedRow>>(
    `select dp.deal_id, dp.slug, dp.is_published, dp.leakage_risk::text as leakage_risk, dp.unpublished_by_admin,
            exists (select 1 from private.preview_holds h where h.deal_id = dp.deal_id) as held,
            coalesce((select array_agg(distinct f.finding_code order by f.finding_code)
                        from private.preview_leak_findings(dp.deal_id, dp.slug, dp.preview_title, dp.preview_summary,
                                                           dp.requirements_preview, dp.relevance_tags, dp.broad_region) f), '{}') as finding_codes
       from public.deal_previews dp
      where dp.deal_id::text like '5eed0000-%'`,
  );
  const byId = new Map(list.map((r) => [r.deal_id, r]));
  const out: Record<string, SeedRow> = {};
  for (const [rowId, row] of Object.entries(ctx.manifest.rows)) {
    const found = byId.get(row.deal_id);
    if (found) out[rowId] = found;
  }
  return out;
}

/** Spec 2.8: SEED_INVALID assertions for B, F, A and E rows. */
export function seedAssertions(ctx: Ctx, seed: Record<string, SeedRow>): Assertion[] {
  const out: Assertion[] = [];
  for (const [rowId, row] of Object.entries(ctx.manifest.rows)) {
    if (row.group === "residual" && process.env.LEAK_INCLUDE_RESIDUALS !== "1") continue;
    const s = seed[rowId];
    if (!s) {
      out.push({ id: `seed_row_exists:${rowId}`, pass: false, code: "SEED_INVALID", actual: "missing" });
      continue;
    }
    if (row.group === "published_low" || row.group === "filler") {
      const pass = s.is_published && s.leakage_risk === "LOW" && !s.unpublished_by_admin && !s.held;
      out.push({ id: `published_low:${rowId}`, pass, code: pass ? undefined : "SEED_INVALID", actual: pass ? undefined : s });
    } else if (["held_admin", "draft", "review", "high", "held_after_publish"].includes(row.group)) {
      const needsHold = rowId === "A1" || rowId === "E1";
      const pass = !s.is_published && (!needsHold || s.held);
      out.push({ id: `unpublished${needsHold ? "_and_held" : ""}:${rowId}`, pass, code: pass ? undefined : "SEED_INVALID", actual: pass ? undefined : s });
    }
  }
  return out;
}

export type GateMiss = { row: string; slug: string; is_published: boolean; leakage_risk: string; tokens: string[]; finding_codes: string[] };

export function gateMisses(ctx: Ctx, seed: Record<string, SeedRow>): GateMiss[] {
  const misses: GateMiss[] = [];
  for (const [rowId, row] of Object.entries(ctx.manifest.rows)) {
    if (row.group !== "adversarial" && row.group !== "slug") continue;
    const s = seed[rowId];
    if (s && !s.is_published && s.leakage_risk !== "LOW") continue;
    misses.push({
      row: rowId,
      slug: row.slug,
      is_published: s?.is_published ?? false,
      leakage_risk: s?.leakage_risk ?? "MISSING",
      tokens: ctx.manifest.tokens.filter((t) => t.rows.includes(rowId)).map((t) => t.id),
      finding_codes: s?.finding_codes ?? [],
    });
  }
  return misses;
}

function holds(ctx: Ctx): string[] {
  return ctx.psqlJson<Array<{ deal_id: string }>>(`select deal_id from private.preview_holds order by deal_id`).map((r) => r.deal_id);
}

/** A-DB-01..05 or B-DB-01 plus DB-02..05 and B-LOCK-06. Throws SEED_INVALID before any HTTP probe. */
export function dbProbes(ctx: Ctx, phaseA?: { holds?: string[] }): { gateMisses: GateMiss[]; acl: Acl } {
  const migrations = readMigrations(ctx);
  writeJson(`${ctx.dir}/migrations.json`, migrations);
  const versions = migrations.map((m) => m.version);
  const expectedVersions = migrationFiles(ctx.phase);
  const anonReadsPreviews = ctx.psql(`select has_table_privilege('anon', 'public.deal_previews', 'select')`) === "t";
  const authReadsPreviews = ctx.psql(`select has_table_privilege('authenticated', 'public.deal_previews', 'select')`) === "t";
  const rpcsPresent = ctx.psqlJson<Array<{ proname: string }>>(
    `select distinct proname from pg_proc where pronamespace = 'public'::regnamespace and proname in (${DTO_RPCS.map((n) => `'${n}'`).join(",")})`,
  ).map((r) => r.proname);
  const heldNow = holds(ctx);

  const db01: Assertion[] = [eq("migrations", expectedVersions, versions), eq("dto_rpcs_exist", sorted(DTO_RPCS), sorted(rpcsPresent))];
  if (ctx.phase === "A") {
    db01.push(ok("anon_select_deal_previews_pre_0019", anonReadsPreviews, anonReadsPreviews));
  } else {
    const usage = ctx.psqlJson<Array<{ n: string; u: boolean }>>(
      `select nspname as n, has_schema_privilege('anon', oid, 'usage') as u from pg_namespace where nspname in ('private', 'extensions')`,
    );
    db01.push(
      ok("anon_no_select_deal_previews", !anonReadsPreviews, anonReadsPreviews),
      ok("authenticated_no_select_deal_previews", !authReadsPreviews, authReadsPreviews),
      ok("anon_no_usage_private_extensions", usage.every((r) => !r.u), usage),
      ok("pre_0019_acl_exists", ctx.psql(`select to_regclass('private.pre_0019_acl') is not null`) === "t"),
    );
    if (phaseA?.holds) db01.push(eq("holds_unchanged_from_A-DB-04", phaseA.holds, heldNow));
  }
  ctx.derive({ id: "DB-01", instance: "migrations-and-privileges", role: "db", assertions: db01, detail: { migrations } });

  const seed = readSeedOutcome(ctx);
  writeJson(`${ctx.dir}/seed-outcome.json`, seed);
  const seedChecks = seedAssertions(ctx, seed);
  const db02 = ctx.derive({ id: "DB-02", instance: "seed-preconditions", role: "db", assertions: seedChecks });

  const misses = gateMisses(ctx, seed);
  ctx.derive({
    id: "DB-03",
    instance: "gate-rows",
    role: "db",
    assertions: [eq("gate_misses", [], misses.map((m) => `${m.row}:${m.tokens.join("+")}`))],
    detail: { gate_misses: misses },
  });

  ctx.snapshots.set("DB-04|holds", heldNow);
  ctx.derive({
    id: "DB-04",
    instance: "holds",
    role: "db",
    assertions: [ok("A1_and_E1_held", ["A1", "E1"].every((r) => heldNow.includes(ctx.row(r).deal_id)), heldNow)],
  });

  const acl = readAcl(ctx);
  writeJson(`${ctx.dir}/acl.json`, acl);
  ctx.derive({
    id: "DB-05",
    instance: "acl-snapshot",
    role: "db",
    severity: "P2",
    assertions: [{ id: "report_only", pass: true, blocking: false }],
    detail: Object.fromEntries(
      Object.entries(acl.functions)
        .filter(([, f]) => [...DTO_RPCS, "admin_release_preview_hold", "admin_merge_organizations", "search_deal_previews", "search_deal_previews_for_profile"].includes(f.name))
        .map(([sig, f]) => [sig, { anon: f.anon, authenticated: f.authenticated }]),
    ),
  });

  if (ctx.phase === "B") {
    const anonExec = sorted(Object.values(acl.functions).filter((f) => f.anon).map((f) => f.name));
    ctx.derive({ id: "LOCK-06", instance: "anon-execute", role: "db", assertions: [eq("anon_execute_only_dto_rpcs", sorted(ANON_DTO_RPCS), anonExec)] });
  }

  if (db02.pass === false) {
    throw new Error(`SEED_INVALID: ${seedChecks.filter((a) => !a.pass).map((a) => a.id).join(", ")}`);
  }
  return { gateMisses: misses, acl };
}

/** B-XPH-02: every ACL change between phases is a revoke that 0019 intends. */
export function aclDiff(a: Acl, b: Acl): { intended: string[]; unintended: string[] } {
  const intended: string[] = [];
  const unintended: string[] = [];
  const note = (key: string, from: boolean, to: boolean, allowedRevoke: boolean) => {
    if (from === to) return;
    (allowedRevoke && from && !to ? intended : unintended).push(`${key}: ${from} -> ${to}`);
  };
  for (const sig of new Set([...Object.keys(a.functions), ...Object.keys(b.functions)])) {
    const fa = a.functions[sig];
    const fb = b.functions[sig];
    if (!fa || !fb) {
      unintended.push(`${sig}: ${fa ? "dropped" : "added"}`);
      continue;
    }
    const revocable = !DTO_RPCS.includes(fa.name);
    note(`function ${sig} anon`, fa.anon, fb.anon, revocable);
    note(`function ${sig} authenticated`, fa.authenticated, fb.authenticated, revocable);
  }
  for (const table of new Set([...Object.keys(a.tables), ...Object.keys(b.tables)])) {
    for (const role of ["anon", "authenticated"] as const) {
      for (const priv of ["select", "insert", "update", "delete"] as const) {
        const from = a.tables[table]?.[role]?.[priv];
        const to = b.tables[table]?.[role]?.[priv];
        if (from === undefined || to === undefined) {
          if (from !== to) unintended.push(`table ${table}: ${from === undefined ? "added" : "dropped"}`);
          continue;
        }
        note(`table ${table} ${role} ${priv}`, from, to, table === "deal_previews");
      }
    }
  }
  for (const column of Object.keys(a.columns)) {
    for (const role of ["anon", "authenticated"] as const) note(`column ${column} ${role}`, a.columns[column][role], b.columns[column]?.[role] ?? false, false);
  }
  for (const schema of Object.keys(a.schemas)) {
    for (const role of ["anon", "authenticated"] as const) {
      note(`schema ${schema} ${role} usage`, a.schemas[schema][role].usage, b.schemas[schema]?.[role]?.usage ?? false, schema === "private" || schema === "extensions");
      note(`schema ${schema} ${role} create`, a.schemas[schema][role].create, b.schemas[schema]?.[role]?.create ?? false, true);
    }
  }
  return { intended, unintended };
}
